import { CeloContract, newKit } from '@celo/contractkit'
import { SortedOraclesWrapper } from '@celo/contractkit/lib/wrappers/SortedOracles'
// This is a fix for incompatible bignumber versions
import { BigNumber as CKBigNumber } from '@celo/contractkit/node_modules/bignumber.js'
import { BigNumber } from 'bignumber.js'
import { BlockHeader } from 'web3-eth'
import { DataAggregator } from '../../src/data_aggregator'
import { baseLogger, defaultDataAggregatorConfig } from '../../src/default_config'
import { BlockType, MetricCollector, ReportTrigger } from '../../src/metric_collector'
import {
  BlockBasedReporter,
  BlockBasedReporterConfig,
} from '../../src/reporters/block_based_reporter'
import { minutesToMs, msToSeconds, secondsToMs } from '../../src/utils'

jest.mock('@celo/contractkit')
jest.mock('../../src/metric_collector')

describe('Reporter', () => {
  const currentPriceValue: BigNumber = new BigNumber(12.06)

  const currentPriceFn = jest.fn(async () => currentPriceValue)

  const kit = newKit('https://')

  // Randomly generated addresss
  const mockOracleAccount = '0x086bb25bFCD323f82a7d1c95E4Cf3807B8831270'
  const circuitBreakerPriceChangeThresholdMax = new BigNumber(0.01)
  const circuitBreakerPriceChangeThresholdMin = new BigNumber(0.01)
  const circuitBreakerPriceChangeThresholdTimeMultiplier = new BigNumber(0.0075)
  const expectedBlockTimeMs = secondsToMs(5)
  const minReportPriceChangeThreshold = new BigNumber(0.01)
  const maxBlockTimestampAgeMs = secondsToMs(30)

  let dataAggregator: DataAggregator
  let reporter: BlockBasedReporter
  let metricCollector: MetricCollector
  let defaultConfig: BlockBasedReporterConfig

  let sortedOraclesMock: SortedOraclesWrapper
  const oracleWhitelist: string[] = [
    '0x01',
    '0x01',
    mockOracleAccount,
    '0x01',
    '0x01',
    '0x01',
    '0x01',
    '0x01',
    '0x01',
    '0x01',
  ]

  async function createAndInitializeReporter(config: BlockBasedReporterConfig): Promise<void> {
    metricCollector = new MetricCollector(baseLogger)
    reporter = new BlockBasedReporter({
      ...config,
      metricCollector,
    })
    await reporter.init()
  }

  function getFakeBlockHeader(blockNumber: number, timestamp?: number): BlockHeader {
    return {
      number: blockNumber,
      hash: '0x01',
      parentHash: '0x01',
      nonce: '0x1',
      sha3Uncles: '0x01',
      logsBloom: '0x01',
      transactionRoot: '0x01',
      stateRoot: '0x01',
      receiptRoot: '0x01',
      miner: '0x01',
      extraData: '0x01',
      gasLimit: 10000,
      gasUsed: 5000,
      timestamp: timestamp || msToSeconds(Date.now()),
    }
  }

  beforeEach(() => {
    dataAggregator = new DataAggregator(defaultDataAggregatorConfig)
    jest.spyOn(dataAggregator, 'currentPrice').mockImplementation(currentPriceFn)

    defaultConfig = {
      baseLogger,
      kit,
      circuitBreakerPriceChangeThresholdMax,
      circuitBreakerPriceChangeThresholdMin,
      circuitBreakerPriceChangeThresholdTimeMultiplier,
      dataAggregator,
      expectedBlockTimeMs,
      gasPriceMultiplier: new BigNumber(5),
      transactionRetryLimit: 0,
      transactionRetryGasPriceMultiplier: new BigNumber(0),
      maxBlockTimestampAgeMs,
      minReportPriceChangeThreshold,
      oracleAccount: mockOracleAccount,
      token: CeloContract.StableToken,
      metricCollector,
      unusedOracleAddresses: [],
      wsRpcProviderUrl: 'ws://bar.foo',
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // TODO: add a test to ensure onBlockHeader correctly handles errors
  describe('init()', () => {
    beforeEach(async () => {
      sortedOraclesMock = await kit.contracts.getSortedOracles()
      jest.spyOn(sortedOraclesMock, 'isOracle').mockImplementation(async () => true)
      jest.spyOn(sortedOraclesMock, 'getOracles').mockImplementation(async () => oracleWhitelist)
    })

    describe('fullCyclesPerExpiryPeriod', () => {
      const blockTime = secondsToMs(5)
      it('sets fullCyclesPerExpiryPeriod when there are no partial cycles in the targetMaxHeartbeatPeriodMs', async () => {
        const targetMaxHeartbeatPeriodMs = minutesToMs(5)
        await createAndInitializeReporter({
          ...defaultConfig,
          expectedBlockTimeMs: blockTime,
          targetMaxHeartbeatPeriodMs,
        })
        // there are 60 blocks in a report expiry period, and 10 oracles.
        // therefore, there are 10 blocks per cycle, and 60 / 10 = 6 cycles
        expect(reporter.fullCyclesPerExpiryPeriod).toBe(6)
        expect(reporter.fullCyclesPerExpiryPeriod * reporter.totalOracleCount * blockTime).toBe(
          targetMaxHeartbeatPeriodMs
        )
      })

      it('rounds fullCyclesPerExpiryPeriod down when there is a partial cycle in the targetMaxHeartbeatPeriodMs', async () => {
        const targetMaxHeartbeatPeriodMs = minutesToMs(4)
        await createAndInitializeReporter({
          ...defaultConfig,
          expectedBlockTimeMs: blockTime,
          targetMaxHeartbeatPeriodMs,
        })
        // there are 48 blocks in a report expiry period, and 10 oracles.
        // therefore, there are 10 blocks per cycle, and
        // floor(48 / 10) = floor(4.8) = 4 full cycles
        expect(reporter.fullCyclesPerExpiryPeriod).toBe(4)
        expect(
          reporter.fullCyclesPerExpiryPeriod * reporter.totalOracleCount * blockTime
        ).toBeLessThan(targetMaxHeartbeatPeriodMs)
      })

      it('sets fullCyclesPerExpiryPeriod using reportExpirySeconds from the on-chain SortedOracles contract when targetMaxHeartbeatPeriodMs is undefined', async () => {
        const reportExpirySeconds = new CKBigNumber(6 * 60) // 6 minutes
        jest
          .spyOn(sortedOraclesMock, 'reportExpirySeconds')
          .mockImplementation(async () => reportExpirySeconds)
        await createAndInitializeReporter({
          ...defaultConfig,
          expectedBlockTimeMs: blockTime,
        })
        // there are 72 blocks in a report expiry period, and 10 oracles.
        // therefore, there are 10 blocks per cycle, and floor(72 / 10) = floor(7.2) = 7 cycles
        expect(reporter.fullCyclesPerExpiryPeriod).toBe(7)
        expect(
          reporter.fullCyclesPerExpiryPeriod * reporter.totalOracleCount * blockTime
        ).toBeLessThan(secondsToMs(reportExpirySeconds.toNumber()))
        expect(reporter.reportExpiryTimeMs).toBe(secondsToMs(reportExpirySeconds.toNumber()))
      })
    })

    describe('heartbeatCycleInExpiryPeriod', () => {
      it('assigns the heartbeat cycle by oracle index when the oracle index is less than fullCyclesPerExpiryPeriod', async () => {
        const blockTime = 5
        const reportExpirySeconds = new CKBigNumber(5 * 60) // 5 minutes
        jest
          .spyOn(sortedOraclesMock, 'reportExpirySeconds')
          .mockImplementation(async () => reportExpirySeconds)
        await createAndInitializeReporter({
          ...defaultConfig,
          expectedBlockTimeMs: secondsToMs(blockTime),
        })
        expect(reporter.heartbeatCycleInExpiryPeriod).toBe(
          oracleWhitelist.indexOf(mockOracleAccount)
        )
        expect(reporter.heartbeatCycleInExpiryPeriod).toBeLessThan(
          reporter.fullCyclesPerExpiryPeriod
        )
        expect(reporter.reportExpiryTimeMs).toBe(secondsToMs(reportExpirySeconds.toNumber()))
      })

      it('assigns the heartbeat cycle by oracle index when the oracle index is >= than fullCyclesPerExpiryPeriod', async () => {
        const blockTime = 5
        const reportExpirySeconds = new CKBigNumber(5 * 60) // 5 minutes
        const whitelist: string[] = [
          '0x01',
          '0x01',
          '0x01',
          '0x01',
          '0x01',
          '0x01',
          '0x01',
          '0x01',
          mockOracleAccount,
          '0x01',
        ]
        jest.spyOn(sortedOraclesMock, 'getOracles').mockImplementation(async () => whitelist)
        jest
          .spyOn(sortedOraclesMock, 'reportExpirySeconds')
          .mockImplementation(async () => reportExpirySeconds)
        await createAndInitializeReporter({
          ...defaultConfig,
          expectedBlockTimeMs: secondsToMs(blockTime),
        })
        expect(reporter.heartbeatCycleInExpiryPeriod).toBe(
          whitelist.indexOf(mockOracleAccount) % reporter.fullCyclesPerExpiryPeriod
        )
        expect(reporter.heartbeatCycleInExpiryPeriod).toBeLessThan(
          reporter.fullCyclesPerExpiryPeriod
        )
        expect(reporter.reportExpiryTimeMs).toBe(secondsToMs(reportExpirySeconds.toNumber()))
      })
    })
  })

  describe('when initialized correctly', () => {
    beforeEach(async () => {
      sortedOraclesMock = await kit.contracts.getSortedOracles()
      jest.spyOn(sortedOraclesMock, 'isOracle').mockImplementation(async () => true)
      jest.spyOn(sortedOraclesMock, 'getOracles').mockImplementation(async () => oracleWhitelist)
      await createAndInitializeReporter(defaultConfig)
    })

    describe('onBlockHeader()', () => {
      it('records metrics, sets the highest block number, and checks if the block is an assigned block', async () => {
        const isAssignedBlockSpy = jest.spyOn(reporter, 'isAssignedBlock')
        const blockNumber = 1
        await reporter.onBlockHeader(getFakeBlockHeader(blockNumber))
        expect(metricCollector.blockHeaderNumber).toBeCalledWith(BlockType.ANY, blockNumber)
        expect(reporter.highestObservedBlockNumber).toBe(blockNumber)
        expect(isAssignedBlockSpy).toBeCalledWith(blockNumber)
      })

      it('tries to report and expire if the block number is an assigned block', async () => {
        jest.spyOn(reporter, 'isAssignedBlock').mockReturnValue(true)
        const maybeReportSpy = jest.spyOn(reporter, 'maybeReport')
        const expireSpy = jest.spyOn(reporter, 'expire')
        const blockNumber = 2
        await reporter.onBlockHeader(getFakeBlockHeader(blockNumber))
        expect(maybeReportSpy).toBeCalledTimes(1)
        expect(expireSpy).toBeCalledTimes(1)
        expect(metricCollector.blockHeaderNumber).toBeCalledWith(BlockType.ASSIGNED, blockNumber)
      })

      it('confirms whether last report has expired', async () => {
        const reportExpirySeconds = new CKBigNumber(5 * 60) // 5 minutes
        const lastReportedTime = 900000000000
        let currentTime = lastReportedTime

        jest
          .spyOn(sortedOraclesMock, 'reportExpirySeconds')
          .mockImplementation(async () => reportExpirySeconds)
        await createAndInitializeReporter({
          ...defaultConfig,
        })

        jest.spyOn(global.Date, 'now').mockImplementation(() => currentTime)
        jest.spyOn(reporter, 'lastReportedTimeMs', 'get').mockImplementation(() => lastReportedTime)
        jest.spyOn(reporter, 'isAssignedBlock').mockReturnValue(true)
        const reportSpy = jest.spyOn(reporter, 'report')

        expect(reporter.reportExpiryTimeMs).toBe(secondsToMs(reportExpirySeconds.toNumber()))

        expect(reporter.lastReportHasExpired()).toBe(false)

        currentTime = lastReportedTime + minutesToMs(3)
        expect(reporter.lastReportHasExpired()).toBe(false)

        currentTime = lastReportedTime + minutesToMs(5)
        expect(reporter.lastReportHasExpired()).toBe(false)

        currentTime = lastReportedTime + minutesToMs(5) + 10
        expect(reporter.lastReportHasExpired()).toBe(true)

        currentTime = lastReportedTime + minutesToMs(6)
        expect(reporter.lastReportHasExpired()).toBe(true)

        await reporter.onBlockHeader(getFakeBlockHeader(2))
        expect(reportSpy).toBeCalledWith(currentPriceValue, ReportTrigger.HEARTBEAT)
      })

      it('calls performBlockHeaderChecks and throws if performBlockHeaderChecks throws before performing any actions', async () => {
        const performBlockHeaderChecksSpy = jest
          .spyOn(reporter, 'performBlockHeaderChecks')
          .mockImplementation(() => {
            throw Error('foo')
          })
        await expect(reporter.onBlockHeader(getFakeBlockHeader(2))).rejects.toThrow('foo')
        expect(performBlockHeaderChecksSpy).toBeCalledTimes(1)
      })
    })

    describe('performBlockHeaderChecks()', () => {
      it('does not throw if a block number is observed that higher than a previously observed block', () => {
        const lowBlockNumber = 100
        const highBlockNumber = 101
        jest.spyOn(reporter, 'highestObservedBlockNumber', 'get').mockReturnValue(lowBlockNumber)
        expect(() =>
          reporter.performBlockHeaderChecks(getFakeBlockHeader(highBlockNumber))
        ).not.toThrow()
      })

      it('throws if a block number is observed that is lower than a previously observed block', () => {
        const highBlockNumber = 100
        const lowBlockNumber = 99
        jest.spyOn(reporter, 'highestObservedBlockNumber', 'get').mockReturnValue(highBlockNumber)
        expect(() => reporter.performBlockHeaderChecks(getFakeBlockHeader(lowBlockNumber))).toThrow(
          `Block number is lower than the highest previously observed block: ${lowBlockNumber} <= ${highBlockNumber}`
        )
      })

      it('does not throw if a block timestamp is at most maxBlockTimestampAgeMs old', () => {
        // Arbitrary timestamp in ms
        const now = 1591461800000
        jest.spyOn(Date, 'now').mockReturnValue(now)
        const blockTimestampSeconds = msToSeconds(now - maxBlockTimestampAgeMs)
        expect(() =>
          reporter.performBlockHeaderChecks(getFakeBlockHeader(1, blockTimestampSeconds))
        ).not.toThrow()
      })

      it('throws if a block timestamp is more than maxBlockTimestampAgeMs old', () => {
        // Arbitrary timestamp in ms
        const now = 1591461800000
        jest.spyOn(Date, 'now').mockReturnValue(now)
        const blockTimestampSeconds = msToSeconds(now - maxBlockTimestampAgeMs - 1)
        expect(() =>
          reporter.performBlockHeaderChecks(getFakeBlockHeader(1, blockTimestampSeconds))
        ).toThrow()
      })
    })

    describe('isAssignedBlock()', () => {
      it('returns true if it is the assigned block', () => {
        // test some assigned blocks
        for (let i = 0; i < 20; i++) {
          expect(
            reporter.isAssignedBlock(
              i * oracleWhitelist.length + oracleWhitelist.indexOf(mockOracleAccount)
            )
          ).toBe(true)
        }
      })
      it('returns false if it is not the assigned block', () => {
        // test some blocks
        for (let i = 0; i < 200; i++) {
          expect(reporter.isAssignedBlock(i)).toBe(
            i % oracleWhitelist.length === oracleWhitelist.indexOf(mockOracleAccount)
          )
        }
      })
    })
  })
})
