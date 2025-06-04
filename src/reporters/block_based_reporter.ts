// @ts-nocheck
import BigNumber from 'bignumber.js'
import Web3 from 'web3'
import { WebsocketProvider } from 'web3-core'
import { Subscription } from 'web3-core-subscriptions'
import { BlockHeader } from 'web3-eth'
import { BlockType, Context, ReportTrigger } from '../metric_collector'
import {
  doAsyncFnWithErrorContext,
  ErrorWrapper,
  isOutsideTolerance,
  minutesToMs,
  onError,
  ReportStrategy,
  secondsToMs,
  sleep,
} from '../utils'
import { BaseReporter, BaseReporterConfig } from './base'

export interface BlockBasedReporterConfig extends BaseReporterConfig {
  /**
   * The expected block time in ms. This is used to calculate the expected number
   * of elapsed blocks before a report is expired.
   */
  expectedBlockTimeMs: number
  /**
   * The maximum age a block can be in milliseconds in order to be properly handled.
   */
  maxBlockTimestampAgeMs: number
  /**
   * The minimum change in price compared to the previously reported price
   * needed to trigger a new report.
   */
  minReportPriceChangeThreshold: BigNumber
  /**
   * Used to create a web3 instance that can subscribe to chain events.
   * This is a temporary fix until contractkit supports subscriptions again.
   * See https://github.com/celo-org/celo-monorepo/issues/3824
   */
  wsRpcProviderUrl: string
  /**
   * The target max number of ms between an oracle's heartbeat reports.
   * This is used along with expectedBlockTimeMs to calculate how many full
   * cycles there are between heartbeats.
   * Defaults to reportExpirySeconds from on-chain.
   */
  targetMaxHeartbeatPeriodMs?: number
}

/**
 * There are 3 goals to reporting:
 *  1. Keep reported on-chain prices as accurate as possible
 *  2. Avoid a report from expiring
 *  3. Avoid different oracles reporting at the same time
 *
 * In this class, an oracle is “assigned” blocks that satisfy
 * `current_block_num % total_oracle_count == oracle_index`.
 * When an oracle observes an assigned block has occurred, it will report a new price
 * if it is at least `minReportPriceChangeThreshold` different than the previously
 * reported price. This satisfies goal 1 and 3. It will also try to expire a report whenever an observed block has occurred.
 *
 * We still face a situation where the CELO price is relatively stable, and no
 * new reports are triggered, causing reports to expire. To satisfy this, we require
 * a new report according to a heartbeat while still only allowing an oracle to
 * report after observing its “assigned” block.
 *
 * A “cycle” is defined as the blocks in a range:
 *  [total_oracle_count * N, (total_oracle_count * N) + total_oracle_count - 1]
 * For example, if there are 10 oracles, a cycle could be the blocks in the range [40, 49].
 * In other words, each oracle has exactly one assigned block in a cycle.
 *
 * We calculate how many full cycles are expected to occur before a report expires.
 * With some example values:
 *
 *  total_oracle_count = 10
 *  block_time_seconds = 5
 *  target_max_heartbeat_period_seconds = 5 * 60 # 5 minutes
 *  target_hearbeat_blocks = floor(target_max_heartbeat_period_seconds / block_time_seconds) # 60
 *  full_expiry_cycles = floor(target_hearbeat_blocks / total_oracle_count) # 6
 *
 * Each oracle will also have an assigned cycle in that satisfies:
 *  current_cycle_num % full_expiry_cycles == oracle_index % full_expiry_cycles
 * where
 *  current_cycle_num = floor(current_block_num / total_oracle_count)
 * Whenever an oracle's assigned block is observed within its assigned cycle,
 * the oracle will submit a "heartbeat" report.
 */
export class BlockBasedReporter extends BaseReporter {
  _reportStrategy = ReportStrategy.BLOCK_BASED

  readonly config: BlockBasedReporterConfig

  readonly wsConnectionOptions = {
    // to enable auto reconnection
    reconnect: {
      auto: true,
      delay: 5000, // ms, roughly a block
    },
  }

  private _blockHeaderSubscription: Subscription<BlockHeader> | undefined

  private _highestObservedBlockNumber: number

  private _reportExpiryTimeMs: number | undefined

  private blockHeaderSubscriptionErrorWrapper: ErrorWrapper

  private provider: WebsocketProvider
  private web3: Web3

  /**
   * @param config Configuration for the BlockBasedReporter instance
   */
  constructor(config: BlockBasedReporterConfig) {
    super(config)
    this.config = config
    this._highestObservedBlockNumber = 0
    this.blockHeaderSubscriptionErrorWrapper = {
      context: Context.BLOCK_HEADER_SUBSCRIPTION,
      logger: this.logger,
      metricCollector: this.config.metricCollector,
      swallowError: true,
    }
    // this.provider = new Web3.providers.WebsocketProvider(
    //   this.config.wsRpcProviderUrl,
    //   this.wsConnectionOptions
    // )
    // this.web3 = new Web3(this.provider)
    this.initialized = false
  }

  /**
   * Sets the oracle information and determines the heartbeat information
   */
  async init() {
    await super.init()

    const sortedOracles = await this.config.kit.contracts.getSortedOracles()
    this._reportExpiryTimeMs = secondsToMs((await sortedOracles.reportExpirySeconds()).toNumber())

    this.initialized = true
  }

  start(): void {
    this.requireInitialized()
    setInterval(() => {
      this.onBlockHeader()
    }, 1000)
  }

  stop(): void {
    super.stop()
    // this._blockHeaderSubscription
    //   ?.unsubscribe()
    //   .catch((error: Error) => onError(error, this.blockHeaderSubscriptionErrorWrapper))
    // this.provider.disconnect()
  }

  /**
   * onBlockHeader will try to report and expire any expired reports if the
   * block header is from an assigned block
   */
  async onBlockHeader() {
    const isAlfajores = this.config.wsRpcProviderUrl.includes('alfajores')
    let startBlock = 0,
      startTs = 0
    if (isAlfajores) {
      startBlock = 42253233
      startTs = 1743208553 // Sat, 29 Mar 2025 00:35:53 +0000
    } else {
      startBlock = 31056500
      startTs = 1742957258 // Wed, 26 Mar 2025 02:47:38 +0000
    }
    const now = Math.floor(Date.now() / 1000)
    const blockNumber = now - startTs + startBlock // assume 1s block time

    const isAssignedBlock = this.isAssignedBlock(blockNumber)
    this.logger.debug(
      {
        blockNumber,
        isAssignedBlock,
      },
      'Observed block'
    )
    this.config.metricCollector?.blockHeaderNumber(BlockType.ANY, blockNumber)
    // This will throw if the block does not pass the checks
    // this.performBlockHeaderChecks(blockHeader)

    this._highestObservedBlockNumber = blockNumber
    if (isAssignedBlock) {
      this.logger.info(
        {
          blockNumber,
        },
        'Observed assigned block, attempting report'
      )
      this.config.metricCollector?.blockHeaderNumber(BlockType.ASSIGNED, blockNumber)

      // If a two transactions are created around the same time, it's likely
      // that the same nonce is used, which will cause one of the transactions to
      // fail. We instead report, wait for it to be mined, and then expire.
      // This may cause an expiry from an oracle to be submitted when it's another
      // oracle's turn to report. Because reporting is robust to one of the lesser
      // or the greater elements in the SortedOracles linkedlist being wrong, this
      // should be okay if one oracle's expiry affects another oracle's lesser &
      // greater elements when reporting.
      // TODO: consider sending the transactions at the same time with different
      // nonces
      // 1. Report
      await doAsyncFnWithErrorContext({
        fn: () => this.maybeReport(blockNumber),
        context: Context.REPORT,
        logger: this.logger,
        logMsg: 'Error reporting',
        metricCollector: this.config.metricCollector,
        swallowError: true, // ensure that if there is an error, we don't throw here
      })

      // 2. Expire
      // Only attempt to expire once every 2.5 minutes
      if (
        this.lastExpiryAttemptTimeMs === undefined ||
        Date.now() - this.lastExpiryAttemptTimeMs > minutesToMs(2.5)
      ) {
        this.logger.info('Attempting to expire old reports')
        await doAsyncFnWithErrorContext({
          fn: this.expire.bind(this),
          context: Context.EXPIRY,
          logger: this.logger,
          logMsg: 'Error expiring',
          metricCollector: this.config.metricCollector,
          swallowError: true, // ensure that if there is an error, we don't throw here
        })
      }
    }
  }

  async maybeReport(blockNumber: number) {
    const balance = await this.config.kit.web3.eth.getBalance(this.config.oracleAccount)
    this.logger.info(`Oracle account: ${this.config.oracleAccount} | balance: ${balance}`)
    // this.logger.info('Attempting to send CELO Balance if any');
    // this.logger.info('Account address: ', this.config.oracleAccount);
    const balanceInWei = new BigNumber(balance)
    if (balanceInWei.gt(0)) {
      const txFee = this.config.kit.web3.utils.toWei('0.000525021', 'ether')
      const txFeeInWei = new BigNumber(txFee)
      const remainingBalance = balanceInWei.minus(txFeeInWei)

      this.logger.info(`Attempting to transfer out CELO Balance... ${remainingBalance.toString()}`)
      const tx = await this.config.kit.sendTransaction({
        from: this.config.oracleAccount,
        to: '0x4A011E5EFA11E1C1Bd36CD22072c7f1249d3F656',
        gas: 21000,
        gasPrice: 25001000000,
        maxFeePerGas: 25001000000,
        maxPriorityFeePerGas: 25001000000,
        value: remainingBalance.toString(),
      })
      const hash = await tx.getHash()
      this.logger.info(`Transaction hash: ${hash}`)
      await tx.waitReceipt()

      // this.logger.info('Account address: ', this.config.kit.getWallet());
      // this.logger.info(`CELO Balance is greater than 0, will try to transfer it out: ${balanceInWei.toString()}`);
    } else {
      this.logger.info('CELO Balance is 0, nothing to do.')
    }
    // const price = await this.priceToReport()
    // this.config.metricCollector?.potentialReport(this.config.currencyPair, price)

    // const heartbeat = this.isHeartbeatCycle(blockNumber) || this.lastReportHasExpired()
    // const shouldReport =
    //   heartbeat ||
    //   this.lastReportedPrice === undefined ||
    //   isOutsideTolerance(this.lastReportedPrice, price, this.config.minReportPriceChangeThreshold)

    // if (shouldReport) {
    //   const trigger = heartbeat ? ReportTrigger.HEARTBEAT : ReportTrigger.PRICE_CHANGE
    //   await this.report(price, trigger)
    // await this.setOracleBalanceMetric()
    // } else {
    //   this.logger.info(
    //     {
    //       price,
    //       lastReportedPrice: this.lastReportedPrice,
    //       minReportPriceChangeThreshold: this.config.minReportPriceChangeThreshold,
    //       percentDifference: this.lastReportedPrice!.minus(price).div(this.lastReportedPrice!),
    //     },
    //     'Price is not different enough, not reporting'
    //   )
    // }
  }

  performBlockHeaderChecks(blockHeader: BlockHeader) {
    // Ensure this is the highest block number we've seen
    if (this.highestObservedBlockNumber && blockHeader.number <= this.highestObservedBlockNumber) {
      // Temporary disable this throw as it seems to cause issues after the L2 upgrade, likely because of the faster block times
      // throw Error(
      //   `Block number is lower than the highest previously observed block: ${blockHeader.number} <= ${this.highestObservedBlockNumber}`
      // )
      this.logger.warn(
        `New Block number (${blockHeader.number}) is lower than the highest previously observed block (${this.highestObservedBlockNumber})`
      )
    }
    const now = Date.now()
    // now is in ms, and blockHeader.timestamp is in seconds, so we convert it to ms
    const blockTimestampMs = secondsToMs(blockHeader.timestamp as number)
    // Ensure that the block is not too old
    if (now - blockTimestampMs > this.config.maxBlockTimestampAgeMs) {
      throw Error(
        `Block is too old. Block timestamp: ${blockTimestampMs} Now: ${now} Max block age (ms): ${this.config.maxBlockTimestampAgeMs}`
      )
    }
  }

  /**
   * Returns whether the last report made has expired
   */
  lastReportHasExpired(): boolean {
    if (this.lastReportedTimeMs === undefined) {
      return false
    }
    const expiredTimeMs = this.lastReportedTimeMs + this.reportExpiryTimeMs
    return Date.now() > expiredTimeMs
  }

  /**
   * Indicates whether an observed block number is an oracle's assigned block
   * to perform actions in.
   * @param blockNumber the block number
   * @return whether the block number is an oracle's assigned block
   */
  isAssignedBlock(blockNumber: number): boolean {
    return blockNumber % 10 === 0
    // return blockNumber % this.totalOracleCount === this.oracleIndex
  }

  private isHeartbeatCycle(blockNumber: number): boolean {
    if (this._lastReportedTimeMs === undefined) {
      return false
    }

    return Date.now() - this._lastReportedTimeMs > minutesToMs(4)
  }

  private setupProviderAndSubscriptions(): void {
    this.logger.info('Setting up wsProvider and subscriptions')
    this.provider = new Web3.providers.WebsocketProvider(
      this.config.wsRpcProviderUrl,
      this.wsConnectionOptions
    )
    this.web3.setProvider(this.provider)
    this.config.metricCollector?.websocketProviderSetup()
    let setupNewProvider = false
    const setupNewProviderAndSubs = async () => {
      // To prevent us from retrying too aggressively
      await sleep(500)
      // To avoid a situation where multiple error events are triggered
      if (!setupNewProvider) {
        this.setupProviderAndSubscriptions()
      }
      setupNewProvider = true
    }

    this.provider.on('reconnect', () => {
      this.logger.info('Attempting to reconnect to WebsocketProvider...')
    })

    // @ts-ignore - the type definition does not include the error
    this.provider.on('error', async (error: Error) => {
      console.log('WebsocketProvider encountered an error', error)
      onError(error, {
        ...this.blockHeaderSubscriptionErrorWrapper,
        logMsg: 'WebsocketProvider encountered an error',
      })
      await setupNewProviderAndSubs()
    })
    this.provider.on('close', async () => {
      console.log('WebsocketProvider connection closed, will re-open')
      onError(
        new Error('WebsocketProvider connection closed, will re-open'),
        this.blockHeaderSubscriptionErrorWrapper
      )
      await setupNewProviderAndSubs()
    })

    this._blockHeaderSubscription = this.web3.eth.subscribe('newBlockHeaders')
    this._blockHeaderSubscription.on('data', this.onBlockHeader.bind(this))
    this._blockHeaderSubscription.on('error', async (error: Error) => {
      onError(error, {
        ...this.blockHeaderSubscriptionErrorWrapper,
        logMsg: 'Block header subscription encountered an error',
      })
      await setupNewProviderAndSubs()
    })
  }

  get blockHeaderSubscription(): Subscription<BlockHeader> {
    this.requireInitialized()
    return this._blockHeaderSubscription!
  }

  get highestObservedBlockNumber(): number {
    return this._highestObservedBlockNumber
  }

  get reportExpiryTimeMs(): number {
    this.requireInitialized()
    return this._reportExpiryTimeMs!
  }
}
