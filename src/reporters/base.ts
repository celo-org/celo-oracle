import { ContractKit } from '@celo/contractkit'
import { ReportTarget } from '@celo/contractkit/lib/wrappers/SortedOracles'
import { normalizeAddressWith0x } from '@celo/utils/lib/address'
import BigNumber from 'bignumber.js'
import Logger from 'bunyan'
import { TransactionReceipt } from 'web3-core'
import { OracleApplicationConfig } from '../app'
import { DataAggregator } from '../data_aggregator'
import { Context, MetricCollector, ReportTrigger } from '../metric_collector'
import {
  doAsyncFnWithErrorContext,
  doWithDurationMetric,
  isOutsideTolerance,
  msToMinutes,
  msToSeconds,
  ReportStrategy,
} from '../utils'
import { sendTransaction, sendTransactionWithRetries } from './transaction_manager'

// Fallback gas amounts -- in the event gas estimation fails due to this race
// condition: https://github.com/celo-org/celo-blockchain/issues/1419
// We fall back to a hardcoded gas amount intended to be a little higher than
// normal to be extra safe:

// 400k -- gas estimations (including contractkit's inflation factor of 1.3)
// are typically ~330k and gas used is typically ~190k
const FALLBACK_REPORT_GAS = 400000
// 450k -- gas estimations (including contractkit's inflation factor of 1.3)
// are typically ~350k and gas used is typically ~200k
const FALLBACK_EXPIRY_GAS = 450000

export interface BaseReporterConfig {
  /**
   * A base instance of the logger that can be extended for a particular context
   */
  baseLogger: Logger
  /**
   * The maximum value the circuit breaker threshold can scale up to. Any change in a reported
   * price relative to the last report price that is greater than this value will ensure the
   * circuit breaker will open.
   * Provided as a ratio, eg 0.1 is 10%.
   */
  circuitBreakerPriceChangeThresholdMax: BigNumber
  /**
   * The base price change threshold. Each successful report reverts the price
   * threshold to this base value. The threshold will be scaled up in accordance
   * with the time that has elapsed since the last report.
   * Provided as a ratio, eg 0.1 is 10%.
   */
  circuitBreakerPriceChangeThresholdMin: BigNumber
  /**
   * The multiplier that determines how quickly the price change threshold scales up relative
   * to time elapsed since last report.
   */
  circuitBreakerPriceChangeThresholdTimeMultiplier: BigNumber
  /**
   * The currency pair to report upon
   */
  readonly currencyPair: OracleApplicationConfig['currencyPair']
  /**
   * An instance of DataAggregator from which to get the current price
   */
  readonly dataAggregator: DataAggregator
  /**
   * The multiplier value for the gas price minimum which shall be used to compute the gasPrice for a transaction to send
   */
  gasPriceMultiplier: BigNumber
  /**
   * How many times to retry failed transactions
   */
  transactionRetryLimit: number
  /**
   * Number to calculate increased gas price gas price by when retrying failed transactions due to gas price too low
   */
  transactionRetryGasPriceMultiplier: BigNumber
  /**
   * An instance of contractkit that can sign/send txs from the oracle account
   */
  readonly kit: ContractKit
  /**
   * An optional MetricCollector instance to report metrics
   */
  readonly metricCollector?: MetricCollector
  /**
   * The oracle account that this client is running as. It should be whitelisted
   * as an oracle for the currency pair it's reporting upon.
   */
  readonly oracleAccount: string
  /**
   * An optional number to assign to this oracle's index and override index calculation
   */
  readonly overrideIndex?: number
  /**
   * An optional number to assign to this oracle's count of total oracles
   * and override total count calculation
   */
  readonly overrideTotalOracleCount?: number
  /**
   * Identifier used for the currency pair when reporting to chain
   */
  readonly reportTarget: ReportTarget
  /**
   * A list of unused addresses to ignore on the whitelist.
   */
  readonly unusedOracleAddresses: string[]
}

/**
 * The BaseReporter class has common functions for reporting & expiring reports,
 * but leaves the reporting strategy to a subclass.
 */
export abstract class BaseReporter {
  abstract _reportStrategy: ReportStrategy

  readonly config: BaseReporterConfig

  /**
   * Intended to be set by a subclass to indicate initialization work occurring
   * in the subclass as completed
   */
  protected initialized: boolean
  /**
   * Indicates initialization work occurring in the BaseReporter has completed
   */
  private initializedBase: boolean

  /**
   * When circuitBreakerOpen is true, the circuit breaker has been triggered
   * and no reports will occur.
   */
  protected _circuitBreakerOpen: boolean
  protected _lastReportedPrice: BigNumber | undefined
  protected _lastReportedTimeMs: number | undefined

  protected _oracleIndex: number | undefined
  protected _totalOracleCount: number | undefined

  protected readonly logger: Logger

  /**
   * @param config Configuration for the reporter
   */
  constructor(config: BaseReporterConfig) {
    this.config = config
    this.logger = this.config.baseLogger.child({
      context: 'reporter',
      reportStrategy: this.reportStrategy,
    })
    this.initializedBase = false
    this._circuitBreakerOpen = false
    this.initialized = false
  }

  /**
   * Verify that the account is whitelisted, and get information on this oracle client
   */
  async init() {
    this.requireUninitializedBase()
    await this.requireAccountIsWhitelisted()
    await this.setOracleInfo()
    this.initializedBase = true
  }

  start(): void {
    this.requireInitialized()
  }

  stop(): void {
    this.requireInitialized()
  }

  /**
   * Reports a price to chain and records metrics for the report.
   * Error handling (logs + metric reporting) are left to the caller.
   */
  async report(price: BigNumber, trigger: ReportTrigger): Promise<void> {
    this.logger.info(
      {
        price,
        trigger,
      },
      'Reporting price'
    )
    const receipt = await this.doAsyncReportAction(() => this.reportPrice(price), 'total')
    this.logger.info(
      {
        price,
        receipt,
        trigger,
      },
      'Successfully reported price'
    )
    // This is only meant for metric collection purposes.
    // There's no straightforward way to get tx details from contractkit without
    // another RPC call. If we add gas estimation and gasPrice into the oracle
    // client in the future, we may be able to prevent this additional RPC.
    if (this.config.metricCollector) {
      const txInfo = await this.doAsyncReportAction(
        () => this.config.kit.web3.eth.getTransaction(receipt.transactionHash),
        'getTransaction'
      )
      this.config.metricCollector.reportTransaction(
        this.config.currencyPair,
        txInfo,
        receipt,
        price,
        trigger
      )
    }
  }

  /**
   * Reports a price to chain and records relevant durations for the async actions.
   * Error handling (logs + metric reporting) are left to the caller.
   */
  private async reportPrice(price: BigNumber): Promise<TransactionReceipt> {
    const sortedOracles = await this.doAsyncReportAction(
      () => this.config.kit.contracts.getSortedOracles(),
      'getSortedOracles'
    )
    const tx = await this.doAsyncReportAction(
      () =>
        sortedOracles.report(this.config.reportTarget, price.toFixed(), this.config.oracleAccount),
      'report'
    )
    const gasPrice = await this.doAsyncReportAction(
      () => this.calculateGasPrice(),
      'calculateGasPrice'
    )

    const receipt = await sendTransactionWithRetries(
      this.logger,
      tx,
      gasPrice,
      {
        ...this.config,
        logger: this.logger,
      },
      this.doAsyncReportAction.bind(this),
      FALLBACK_REPORT_GAS
    )

    if (this.config.metricCollector) {
      const time =
        this.lastReportedTimeMs !== undefined
          ? msToSeconds(Date.now() - this.lastReportedTimeMs)
          : 0
      this.config.metricCollector.timeBetweenReports(this.config.currencyPair, time)
    }
    // Once the transaction is sent to chain, set the last reported price
    this._lastReportedPrice = price
    this._lastReportedTimeMs = Date.now()

    return receipt
  }

  /**
   * Checks for expired reports, and removes any found. Reports relevant tx metrics.
   * Error handling (logs + metric reporting) are left to the caller.
   */
  async expire() {
    this.logger.info('Checking for expired reports')
    const receipt = await this.doAsyncExpiryAction(() => this.removeExpiredReports(), 'total')
    if (receipt) {
      this.logger.info(
        {
          receipt,
        },
        'Successfully expired report'
      )
      if (this.config.metricCollector) {
        // This is only meant for metric collection purposes.
        // There's no straightforward way to get tx details from contractkit without
        // another RPC call.
        const txInfo = await this.doAsyncExpiryAction(
          () => this.config.kit.web3.eth.getTransaction(receipt.transactionHash),
          'getTransaction'
        )
        this.config.metricCollector.expiryTransaction(this.config.currencyPair, txInfo, receipt)
      }
    } else {
      this.logger.info('No expired reports')
    }
  }

  /**
   * Checks if there are expired reports on-chain, and removes them if they exist.
   *
   * The purpose of this function is to mitigate the effects of other oracles
   * going down, or otherwise being unable to report new values. When an oracle
   * stops reporting, its last report will eventually expire. The presence of
   * expired reports on-chain prevent the exchange rate and stability buckets
   * from updating. This function removes any old reports, preventing interruption
   * to the stability mechanism.
   *
   * Error handling (logs + metric reporting) are left to the caller.
   */
  async removeExpiredReports(): Promise<TransactionReceipt | void> {
    const sortedOracles = await this.doAsyncExpiryAction(
      () => this.config.kit.contracts.getSortedOracles(),
      'getSortedOracles'
    )
    // This should be const [expired] = ..., however contractkit returns
    // isOldestReportExpired in the form: { '0': isExpired, '1': oldestReportAddress }
    const { '0': expired } = await this.doAsyncExpiryAction(
      () => sortedOracles.isOldestReportExpired(this.config.reportTarget),
      'isOldestReportExpired'
    )

    const expiredAndMoreThanOneReport = expired
      ? (await this.doAsyncExpiryAction(
          () => sortedOracles.numRates(this.config.reportTarget),
          'numRates'
        )) > 1
      : false

    if (expiredAndMoreThanOneReport) {
      const tx = await this.doAsyncExpiryAction(
        () => sortedOracles.removeExpiredReports(this.config.reportTarget),
        'removeExpiredReports'
      )
      const gasPrice = await this.doAsyncReportAction(
        () => this.calculateGasPrice(),
        'calculateGasPrice'
      )

      return sendTransaction(
        this.logger,
        tx,
        gasPrice,
        this.config.oracleAccount,
        this.doAsyncExpiryAction.bind(this),
        FALLBACK_EXPIRY_GAS
      )
    }
  }

  /**
   * If the circuit breaker is not open, this gets the price to report from the
   * dataAggregator and performs a check to ensure the price isn't too far from
   * the last reported price. If the new price is too far off, the circuit breaker
   * is opened causing reports to fail for the lifetime of the process.
   *
   * Logs & records metrics upon any error getting the price, but still throws.
   */
  async priceToReport() {
    const getPrice = async (): Promise<BigNumber> => {
      // If the circuit breaker is already open, complain loudly
      if (this.circuitBreakerOpen) {
        throw Error('Circuit breaker is open')
      }
      // This can throw if there is an issue with trade data
      const price = await this.config.dataAggregator.currentPrice()
      // lastReportedPrice is a BigNumber and therefore truthy even if zero.
      // Determine if we should open the circuit breaker.
      // TODO: consider lastReportedTime in circuit breaker calculation

      this._circuitBreakerOpen =
        (this.calculateCircuitBreakerPriceChangeThreshold() !== undefined &&
          this.lastReportedPrice &&
          isOutsideTolerance(
            this.lastReportedPrice,
            price,
            this.calculateCircuitBreakerPriceChangeThreshold()
          )) ||
        false // false so that it can't be undefined

      if (this._circuitBreakerOpen) {
        throw Error(
          `Opening circuit breaker, price to report is too different from the last reported price. Price: ${price} Last reported price: ${this.lastReportedPrice} Price change threshold: ${this.config.circuitBreakerPriceChangeThresholdMin}`
        )
      }
      return price
    }

    return doAsyncFnWithErrorContext({
      fn: getPrice,
      context: Context.REPORT_PRICE,
      metricCollector: this.config.metricCollector,
      logger: this.logger,
      logMsg: 'Error getting price to report',
      swallowError: false,
    })
  }

  /**
   * Checks if the account is whitelisted as an oracle for the ccurency pair that this
   * reporter instance is set to report upon.
   */
  private async requireAccountIsWhitelisted(): Promise<void> {
    const sortedOracles = await this.config.kit.contracts.getSortedOracles()
    if (!(await sortedOracles.isOracle(this.config.reportTarget, this.config.oracleAccount))) {
      throw Error(
        `Account ${this.config.oracleAccount} is not whitelisted as an oracle for ${this.config.currencyPair}`
      )
    }
  }

  /**
   * Sets the oracleIndex and totalOracleCount using on chain data
   * TODO: this should occasionally be rerun to account for changes to the oracle set
   */
  private async setOracleInfo() {
    const sortedOracles = await this.config.kit.contracts.getSortedOracles()
    const oracleWhitelist = (await sortedOracles.getOracles(this.config.reportTarget))
      .map(normalizeAddressWith0x)
      .filter((addr) => !this.config.unusedOracleAddresses.includes(addr))

    const oracleIndex =
      this.config.overrideIndex !== undefined
        ? this.config.overrideIndex
        : oracleWhitelist.indexOf(normalizeAddressWith0x(this.config.oracleAccount))

    // This should not happen, but handle the edge-case anyway
    if (oracleIndex === -1) {
      throw Error(
        `Account ${this.config.oracleAccount} is not whitelisted as an oracle for ${this.config.currencyPair}`
      )
    }

    this._oracleIndex = oracleIndex
    this._totalOracleCount =
      this.config.overrideTotalOracleCount !== undefined
        ? this.config.overrideTotalOracleCount
        : oracleWhitelist.length
  }

  /**
   * Returns the circuit breaker price change threshold
   * that will be used at the given time. If the current
   * report price change relative to the last report price
   * is greater the threshold calculated here, the circuit
   * breaker will open.
   * This will only be called when lastReportPrice is set so
   * lastReportedTimeMs will also be set.
   */
  calculateCircuitBreakerPriceChangeThreshold(): BigNumber {
    const timeElapsed: number = msToMinutes(Date.now() - this.lastReportedTimeMs!)
    const calculatedThreshold = this.config.circuitBreakerPriceChangeThresholdMin.times(
      this.config.circuitBreakerPriceChangeThresholdTimeMultiplier
        .times(timeElapsed)
        .squareRoot()
        .plus(1)
    )
    return BigNumber.min(this.config.circuitBreakerPriceChangeThresholdMax, calculatedThreshold)
  }
  /**
   * Returns gasPrice to be used for sending reports/expires.
   */
  async calculateGasPrice(): Promise<number> {
    const gasPriceMinimum = await this.getGasPriceMin()
    return gasPriceMinimum.times(this.config.gasPriceMultiplier).toNumber()
  }

  /**
   * Returns gasPriceMinimum for CELO as BigNumber
   */
  private async getGasPriceMin() {
    const gasPriceMinWrapper = await this.config.kit.contracts.getGasPriceMinimum()
    return gasPriceMinWrapper.gasPriceMinimum()
  }

  private requireUninitializedBase() {
    if (this.initializedBase) {
      throw Error(`BaseReporter is already initialized`)
    }
  }

  private requireInitializedBase() {
    if (!this.initializedBase) {
      throw Error(`BaseReporter is not initialized`)
    }
  }

  protected requireUninitialized() {
    if (this.initialized) {
      throw Error(`Reporter is already initialized`)
    }
  }

  protected requireInitialized() {
    if (!this.initialized) {
      throw Error(`Reporter is not initialized`)
    }
  }

  /**
   * Calls an arbitrary async function to do with price reporting and keeps track
   * of the duration for metric purposes
   */
  private doAsyncReportAction<T>(fn: () => Promise<T>, action: string): Promise<T> {
    return doWithDurationMetric(fn, (duration: number) => {
      this.config.metricCollector?.reportDuration(action, this.config.currencyPair, duration)
    })
  }

  /**
   * Calls an arbitrary async function to do with report expirty and keeps track
   * of the duration for metric purposes
   */
  private doAsyncExpiryAction<T>(fn: () => Promise<T>, action: string): Promise<T> {
    return doWithDurationMetric(fn, (duration: number) => {
      this.config.metricCollector?.expiryDuration(action, this.config.currencyPair, duration)
    })
  }

  get circuitBreakerOpen(): boolean {
    return this._circuitBreakerOpen
  }

  get lastReportedPrice(): BigNumber | undefined {
    return this._lastReportedPrice
  }

  get lastReportedTimeMs(): number | undefined {
    return this._lastReportedTimeMs
  }

  get oracleIndex(): number {
    this.requireInitializedBase()
    return this._oracleIndex!
  }

  get reportStrategy(): ReportStrategy {
    return this._reportStrategy
  }

  get totalOracleCount(): number {
    this.requireInitializedBase()
    return this._totalOracleCount!
  }
}
