import * as utils from '../../src/utils'

import { BaseReporter, BaseReporterConfig } from '../../src/reporters/base'
import { CeloContract, newKit } from '@celo/contractkit'
import { Context, MetricCollector, ReportTrigger } from '../../src/metric_collector'
import { ReportTarget, SortedOraclesWrapper } from '@celo/contractkit/lib/wrappers/SortedOracles'
import { baseLogger, defaultDataAggregatorConfig } from '../../src/default_config'

import BigNumber from 'bignumber.js'
import { DataAggregator, DataAggregatorConfig } from '../../src/data_aggregator'
import { GasPriceMinimumWrapper } from '@celo/contractkit/lib/wrappers/GasPriceMinimum'
import { MockSSLFingerprintService } from '../services/mock_ssl_fingerprint_service'

const { ReportStrategy } = utils

jest.mock('../../src/metric_collector')

export class MockReporter extends BaseReporter {
  _reportStrategy = ReportStrategy.BLOCK_BASED
}

describe('BaseReporter', () => {
  const defaultReportTrigger = ReportTrigger.HEARTBEAT

  let currentPriceValue: BigNumber = new BigNumber(12.06)
  const fixedMinGasPrice: BigNumber = new BigNumber(2e6)

  jest.mock('@celo/contractkit')
  const currentPriceFn = jest.fn(async () => currentPriceValue)

  jest.mock('../../src/utils')

  const kit = newKit('https://')

  // Randomly generated addresss
  const mockOracleAccount = '0x086bb25bFCD323f82a7d1c95E4Cf3807B8831270'
  const circuitBreakerPriceChangeThresholdMax = new BigNumber(0.01)
  const circuitBreakerPriceChangeThresholdMin = new BigNumber(0.01)
  const circuitBreakerPriceChangeThresholdTimeMultiplier = new BigNumber(0.0075)
  const circuitBreakerDurationTimeMs = 20 * 60 * 1000 // 20 minutes.

  let dataAggregator: DataAggregator
  let reporter: BaseReporter
  let metricCollector: MetricCollector
  let defaultConfig: BaseReporterConfig
  const sslFingerprintService = new MockSSLFingerprintService()

  async function createAndInitializeReporter(config: BaseReporterConfig): Promise<void> {
    metricCollector = new MetricCollector(baseLogger)
    reporter = new MockReporter({
      ...config,
      metricCollector,
    })
    await reporter.init()
  }

  beforeEach(async () => {
    const dataAggregatorCfg: DataAggregatorConfig = {
      ...defaultDataAggregatorConfig,
      apiKeys: {},
      currencyPair: utils.OracleCurrencyPair.CELOUSD,
      sslFingerprintService
    }
    dataAggregator = new DataAggregator(dataAggregatorCfg)
    jest.spyOn(dataAggregator, 'currentPrice').mockImplementation(currentPriceFn)

    defaultConfig = {
      baseLogger,
      devMode: false,
      kit,
      circuitBreakerPriceChangeThresholdMax,
      circuitBreakerPriceChangeThresholdMin,
      circuitBreakerPriceChangeThresholdTimeMultiplier,
      circuitBreakerDurationTimeMs,
      dataAggregator,
      gasPriceMultiplier: new BigNumber(5.0),
      transactionRetryLimit: 0,
      transactionRetryGasPriceMultiplier: new BigNumber(0),
      oracleAccount: mockOracleAccount,
      currencyPair: utils.OracleCurrencyPair.CELOUSD,
      reportTarget: CeloContract.StableToken,
      metricCollector,
      unusedOracleAddresses: [],
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('init()', () => {
    let oracleWhitelist: string[]
    let isOracle: boolean
    let sortedOraclesMock: SortedOraclesWrapper

    beforeEach(async () => {
      sortedOraclesMock = await kit.contracts.getSortedOracles()

      jest.spyOn(sortedOraclesMock, 'isOracle').mockImplementation(async () => isOracle)
      jest.spyOn(sortedOraclesMock, 'getOracles').mockImplementation(async () => oracleWhitelist)
    })

    describe('when the state of the world on-chain allows successful initialization', () => {
      beforeEach(() => {
        isOracle = true
        oracleWhitelist = [
          '0x0000000000000000000000000000000000000111',
          '0x0000000000000000000000000000000000000222',
          mockOracleAccount,
          '0x0000000000000000000000000000000000000333',
        ]
      })

      it('gets the correct index of this oracle', async () => {
        await createAndInitializeReporter(defaultConfig)
        expect(reporter.oracleIndex).toBe(oracleWhitelist.indexOf(mockOracleAccount))
      })

      it('gets the correct total number of oracle oracles', async () => {
        await createAndInitializeReporter(defaultConfig)
        expect(reporter.totalOracleCount).toBe(oracleWhitelist.length)
      })
    })

    describe('when the account is not whitelisted for this token', () => {
      beforeEach(() => {
        isOracle = false
        oracleWhitelist = [
          '0x0000000000000000000000000000000000000111',
          '0x0000000000000000000000000000000000000222',
        ]
      })

      it('does not throw an error', async () => {
        await expect(createAndInitializeReporter(defaultConfig)).resolves.not.toThrow()
      })
    })

    function newConfig(
      unusedAddress: string[],
      indexOverride?: number,
      totalCountOverride?: number
    ) {
      const config: BaseReporterConfig = {
        baseLogger,
        devMode: false,
        kit,
        circuitBreakerPriceChangeThresholdMax,
        circuitBreakerPriceChangeThresholdMin,
        circuitBreakerPriceChangeThresholdTimeMultiplier,
        circuitBreakerDurationTimeMs,
        dataAggregator,
        gasPriceMultiplier: new BigNumber(5.0),
        transactionRetryLimit: 0,
        transactionRetryGasPriceMultiplier: new BigNumber(0),
        oracleAccount: mockOracleAccount,
        currencyPair: utils.OracleCurrencyPair.CELOUSD,
        reportTarget: CeloContract.StableToken,
        metricCollector,
        unusedOracleAddresses: unusedAddress,
        overrideIndex: indexOverride,
        overrideTotalOracleCount: totalCountOverride,
      }
      return config
    }

    beforeEach(() => {
      isOracle = true
      oracleWhitelist = [
        '0x0000000000000000000000000000000000000111',
        '0x0000000000000000000000000000000000000222',
        mockOracleAccount,
        '0x0000000000000000000000000000000000000333',
        '0x0000000000000000000000000000000000000444',
        '0x0000000000000000000000000000000000000555',
        '0x0000000000000000000000000000000000000666',
        '0x0000000000000000000000000000000000000777',
        '0x0000000000000000000000000000000000000888',
        '0x0000000000000000000000000000000000000999',
      ]
    })

    it('gets the correct index of this oracle and correct whitelist length: None in whitelist', async () => {
      // Addresses in unusedAddress not in whitelist
      const unusedAddress = [
        '0x1123456774309589028590300000000000000111',
        '0x8971239712938718923789700000000000000333',
        '0x6478361828950381023390300000000000000444',
      ]
      await createAndInitializeReporter(newConfig(unusedAddress))
      expect(reporter.oracleIndex).toBe(oracleWhitelist.indexOf(mockOracleAccount))
      expect(reporter.totalOracleCount).toBe(oracleWhitelist.length)
    })

    it('gets the correct index of this oracle and correct whitelist length: mixed address location, all in whitelist', async () => {
      // Addresses in unusedAddress are before and after Oracle Account index
      // All of unusedAddresses are in whitelist
      const unusedAddress = [
        '0x0000000000000000000000000000000000000111',
        '0x0000000000000000000000000000000000000333',
        '0x0000000000000000000000000000000000000444',
      ]
      await createAndInitializeReporter(newConfig(unusedAddress))
      expect(reporter.oracleIndex).toBe(oracleWhitelist.indexOf(mockOracleAccount) - 1)
      expect(reporter.totalOracleCount).toBe(oracleWhitelist.length - unusedAddress.length)
    })

    it('gets the correct index of this oracle and correct whitelist length: mixed address location, 3 in whitelist', async () => {
      // Addresses in unusedAddress are before and after Oracle Account index
      // Two unusedAddresses NOT in whitelist
      const unusedAddress = [
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000111',
        '0x0000000000000000000000000000000000000333',
        '0x0000000000000000000000000000000000000444',
        '0x1000000000000000000000000000000000000000',
      ]
      await createAndInitializeReporter(newConfig(unusedAddress))
      expect(reporter.oracleIndex).toBe(oracleWhitelist.indexOf(mockOracleAccount) - 1) // remove 0x0...0111
      expect(reporter.totalOracleCount).toBe(oracleWhitelist.length - 3) // ignore 0x...000, 0x100...000
    })

    it('gets the correct index of this oracle and correct whitelist length: before address location', async () => {
      // Addresses in unusedAddress are before Oracle Account index
      // All of unusedAddresses are in whitelist
      const unusedAddress = [
        '0x0000000000000000000000000000000000000111',
        '0x0000000000000000000000000000000000000222',
      ]
      await createAndInitializeReporter(newConfig(unusedAddress))
      expect(reporter.oracleIndex).toBe(0)
      expect(reporter.totalOracleCount).toBe(oracleWhitelist.length - unusedAddress.length)
    })

    it('gets the correct index of this oracle and correct whitelist length: after address location', async () => {
      // Addresses in unusedAddress are after Oracle Account index
      // All of unusedAddresses are in whitelist
      const unusedAddress = [
        '0x0000000000000000000000000000000000000333',
        '0x0000000000000000000000000000000000000444',
        '0x0000000000000000000000000000000000000555',
        '0x0000000000000000000000000000000000000666',
        '0x0000000000000000000000000000000000000777',
        '0x0000000000000000000000000000000000000888',
        '0x0000000000000000000000000000000000000999',
      ]
      await createAndInitializeReporter(newConfig(unusedAddress))
      expect(reporter.oracleIndex).toBe(oracleWhitelist.indexOf(mockOracleAccount))
      expect(reporter.totalOracleCount).toBe(3)
    })

    it('gets the correct OVERRIDEN index and total oracle count of this oracle', async () => {
      // None of unusedAddresses are in whitelist
      // Typical index is 2. New index should override this
      const unusedAddress = [
        '0x0000000000000000000000000000001231232111',
        '0x0000000000000000000000000000001231233333',
        '0x0000000000000000000000000000000321332444',
      ]
      const indexOverride = 5
      const totalOracleCountOverride = 8

      await createAndInitializeReporter(newConfig(unusedAddress))
      expect(reporter.oracleIndex).toBe(2)
      expect(reporter.totalOracleCount).toBe(oracleWhitelist.length)

      await createAndInitializeReporter(
        newConfig(unusedAddress, indexOverride, totalOracleCountOverride)
      )
      expect(reporter.oracleIndex).toBe(5)
      expect(reporter.totalOracleCount).toBe(8)
    })

    it('gets the correct OVERRIDEN index & total with unusedAddresses in whitelist', async () => {
      // Addresses in unusedAddress are before and after Oracle Account index
      // All of unusedAddresses are in whitelist
      const unusedAddress = [
        '0x0000000000000000000000000000000000000111',
        '0x0000000000000000000000000000000000000333',
        '0x0000000000000000000000000000000000000444',
      ]
      const indexOverride = 5
      const totalCountOverride = 9

      await createAndInitializeReporter(newConfig(unusedAddress))
      expect(reporter.oracleIndex).toBe(oracleWhitelist.indexOf(mockOracleAccount) - 1)
      expect(reporter.totalOracleCount).toBe(oracleWhitelist.length - unusedAddress.length)

      await createAndInitializeReporter(newConfig(unusedAddress, indexOverride, totalCountOverride))
      expect(reporter.oracleIndex).toBe(5)
      expect(reporter.totalOracleCount).toBe(9)
    })

    it('gets the correct OVERRIDEN index & total with accountNo in unusedAddress', async () => {
      // Addresses in unusedAddress are before and after Oracle Account index
      // All of unusedAddresses are in whitelist
      const unusedAddress = [
        '0x0000000000000000000000000000000000000111',
        mockOracleAccount,
        '0x0000000000000000000000000000000000000333',
        '0x0000000000000000000000000000000000000444',
      ]
      const indexOverride = 3
      const totalCountOverride = 5

      await createAndInitializeReporter(newConfig(unusedAddress, indexOverride, totalCountOverride))
      expect(reporter.oracleIndex).toBe(3)
      expect(reporter.totalOracleCount).toBe(5)
    })

    it('gets the correct OVERRIDEN index & total with accountNo in unusedAddress. 0 test', async () => {
      // Addresses in unusedAddress are before and after Oracle Account index
      // All of unusedAddresses are in whitelist
      const unusedAddress = [
        '0x0000000000000000000000000000000000000111',
        mockOracleAccount,
        '0x0000000000000000000000000000000000000333',
        '0x0000000000000000000000000000000000000444',
      ]
      const indexOverride = 0
      const totalCountOverride = 0

      await createAndInitializeReporter(newConfig(unusedAddress, indexOverride, totalCountOverride))
      expect(reporter.oracleIndex).toBe(0)
      expect(reporter.totalOracleCount).toBe(0)
    })
  })

  describe('when initialized correctly', () => {
    let sortedOraclesMock: SortedOraclesWrapper
    let minGasPriceMock: GasPriceMinimumWrapper
    const oracleWhitelist: string[] = [
      '0x0000000000000000000000000000000000000111',
      '0x0000000000000000000000000000000000000222',
      mockOracleAccount,
      '0x0000000000000000000000000000000000000333',
    ]

    beforeEach(async () => {
      sortedOraclesMock = await kit.contracts.getSortedOracles()
      jest.spyOn(sortedOraclesMock, 'isOracle').mockImplementation(async () => true)
      jest.spyOn(sortedOraclesMock, 'getOracles').mockImplementation(async () => oracleWhitelist)
      await createAndInitializeReporter(defaultConfig)
      minGasPriceMock = await kit.contracts.getGasPriceMinimum()
      jest
        .spyOn(minGasPriceMock, 'gasPriceMinimum')
        .mockImplementation(async () => new BigNumber(fixedMinGasPrice))
    })

    describe('correctly calculates the gas price with the default multiplier', () => {
      it('correctly by default', async () => {
        const gasPrice = await reporter.calculateGasPrice()
        expect(gasPrice).toBe(fixedMinGasPrice.times(5).toNumber())
      })
      it('correctly calculates the gas price with the an increased multiplier of 10', async () => {
        reporter.config.gasPriceMultiplier = new BigNumber(10)
        const gasPrice = await reporter.calculateGasPrice()
        expect(gasPrice).toBe(fixedMinGasPrice.times(10).toNumber())
      })
      it('correctly calculates the gas price with the a multiplier of 0', async () => {
        reporter.config.gasPriceMultiplier = new BigNumber(0)
        const gasPrice = await reporter.calculateGasPrice()
        expect(gasPrice).toBe(0)
      })
      it('correctly calculates the gas price with an adjust multiplier after the first call', async () => {
        let gasPrice = await reporter.calculateGasPrice()
        expect(gasPrice).toBe(fixedMinGasPrice.times(5).toNumber())
        reporter.config.gasPriceMultiplier = new BigNumber(5.3)
        gasPrice = await reporter.calculateGasPrice()
        expect(gasPrice).toBe(fixedMinGasPrice.times(5.3).toNumber())
      })
    })

    describe('report()', () => {
      beforeEach(async () => {
        currentPriceValue = new BigNumber(12)
        jest.spyOn(reporter, 'priceToReport').mockImplementation(currentPriceFn)
        sortedOraclesMock = await reporter.config.kit.contracts.getSortedOracles()
      })

      it('calls SortedOracles.report with the right params if priceToReport does not throw', async () => {
        currentPriceValue = new BigNumber(12.12)
        await reporter.report(currentPriceValue, defaultReportTrigger)
        expect(sortedOraclesMock.report).toHaveBeenCalledWith(
          CeloContract.StableToken,
          currentPriceValue.toFixed(),
          mockOracleAccount
        )
      })

      it('updates the last reported price after a report is made', async () => {
        expect(reporter.lastReportedPrice).toBe(undefined)
        await reporter.report(currentPriceValue, defaultReportTrigger)
        expect(reporter.lastReportedPrice).toBe(currentPriceValue)
      })

      describe('metrics', () => {
        it('collects metrics on time between reports', async () => {
          let lastReportedTime: number | undefined
          let currentTime = 900000000000

          jest.spyOn(global.Date, 'now').mockImplementation(() => currentTime)

          jest
            .spyOn(reporter, 'lastReportedTimeMs', 'get')
            .mockImplementation(() => lastReportedTime)

          await reporter.report(currentPriceValue, defaultReportTrigger)
          expect(metricCollector.timeBetweenReports).toBeCalledWith(defaultConfig.currencyPair, 0)

          lastReportedTime = currentTime - 1000
          await reporter.report(currentPriceValue, defaultReportTrigger)
          expect(metricCollector.timeBetweenReports).toBeCalledWith(defaultConfig.currencyPair, 1)

          lastReportedTime = currentTime
          currentTime = currentTime + 1000000
          await reporter.report(currentPriceValue, defaultReportTrigger)
          expect(metricCollector.timeBetweenReports).toBeCalledWith(
            defaultConfig.currencyPair,
            1000
          )
        })

        it('collects metrics on successful reports', async () => {
          await reporter.report(currentPriceValue, defaultReportTrigger)
          // transaction information
          expect(metricCollector!.reportTransaction).toBeCalled()
          // duration of various async actions
          const durationActions = [
            'getSortedOracles',
            'report',
            'send',
            'waitReceipt',
            'total',
            'getTransaction',
          ]
          for (const durationAction of durationActions) {
            expect(metricCollector!.reportDuration).toBeCalledWith(
              durationAction,
              'CELOUSD',
              expect.anything()
            )
          }
        })
      })
    })

    describe('setOracleBalanceMetric()', () => {
      it('should set the account balance metric', async () => {
        const mockBalanceInWei = '1000000000000000000'
        const mockBalance = 1
        await reporter.setOracleBalanceMetric()

        expect(reporter.config.kit.web3.eth.getBalance).toHaveBeenLastCalledWith(mockOracleAccount)
        expect(reporter.config.kit.web3.utils.fromWei).toHaveBeenCalledWith(mockBalanceInWei)
        expect(metricCollector!.oracleBalanceValue).toHaveBeenCalledWith(
          mockOracleAccount,
          mockBalance
        )
      })
    })

    describe('expire()', () => {
      it('collects metrics', async () => {
        jest
          .spyOn(sortedOraclesMock, 'isOldestReportExpired')
          .mockImplementation(async (_target: ReportTarget) => [
            true,
            '0x0000000000000000000000000000000000000111',
          ])

        await reporter.expire()
        // transaction information
        expect(metricCollector!.expiryTransaction).toBeCalled()
        // duration of various async actions
        const durationActions = [
          'getSortedOracles',
          'isOldestReportExpired',
          'removeExpiredReports',
          'send',
          'waitReceipt',
          'getTransaction',
        ]
        for (const durationAction of durationActions) {
          expect(metricCollector!.expiryDuration).toBeCalledWith(
            durationAction,
            'CELOUSD',
            expect.anything()
          )
        }
      })
    })

    describe('removeExpiredReports()', () => {
      beforeEach(async () => {
        sortedOraclesMock = await kit.contracts.getSortedOracles()
      })

      it('checks if it needs to remove anything by calling `isOldestReportExpired`', async () => {
        await reporter.removeExpiredReports()
        expect(sortedOraclesMock.isOldestReportExpired).toHaveBeenCalledWith(
          CeloContract.StableToken
        )
      })

      describe('different responses for `isOldestReportExpired`', () => {
        let isOldestReportExpiredReturnValue: [boolean, string]

        beforeEach(() => {
          jest
            .spyOn(sortedOraclesMock, 'isOldestReportExpired')
            .mockImplementation(async (_target: ReportTarget) => isOldestReportExpiredReturnValue)
        })

        it('sends a `removeExpiredReports` tx if there are any to remove', async () => {
          isOldestReportExpiredReturnValue = [true, '0x1234']

          await reporter.removeExpiredReports()
          expect(sortedOraclesMock.removeExpiredReports).toHaveBeenCalledWith(
            CeloContract.StableToken
          )
        })

        it('does not send a `removeExpiredReports` tx when none are expired', async () => {
          isOldestReportExpiredReturnValue = [false, '0x1234']

          await reporter.removeExpiredReports()
          expect(sortedOraclesMock.removeExpiredReports).toHaveBeenCalledTimes(0)
        })
      })

      it('does not send expire transaction if number of reports is 1 (or less)', async () => {
        let numberOfReportsValue: number
        jest
          .spyOn(sortedOraclesMock, 'numRates')
          .mockImplementation(async (_target: ReportTarget) => numberOfReportsValue)
        jest
          .spyOn(sortedOraclesMock, 'isOldestReportExpired')
          .mockImplementation(async (_target: ReportTarget) => [true, '0x1234'])
        numberOfReportsValue = 1

        await reporter.removeExpiredReports()
        expect(sortedOraclesMock.removeExpiredReports).toHaveBeenCalledTimes(0)

        numberOfReportsValue = 2
        await reporter.removeExpiredReports()
        expect(sortedOraclesMock.removeExpiredReports).toHaveBeenCalledTimes(1)

        numberOfReportsValue = 3
        await reporter.removeExpiredReports()
        expect(sortedOraclesMock.removeExpiredReports).toHaveBeenCalledTimes(2)
      })
    })

    describe('calculateCircuitBreakerPriceChangeThreshold', () => {
      let lastReportedTime: number
      const testThreshMin = new BigNumber(0.15)
      const testThreshMax = new BigNumber(0.25)

      beforeEach(async () => {
        const config: BaseReporterConfig = {
          baseLogger,
          devMode: false,
          kit,
          circuitBreakerPriceChangeThresholdMax: testThreshMax,
          circuitBreakerPriceChangeThresholdMin: testThreshMin,
          circuitBreakerPriceChangeThresholdTimeMultiplier,
          circuitBreakerDurationTimeMs,
          dataAggregator,
          gasPriceMultiplier: new BigNumber(5.0),
          transactionRetryLimit: 0,
          transactionRetryGasPriceMultiplier: new BigNumber(0),
          oracleAccount: mockOracleAccount,
          currencyPair: utils.OracleCurrencyPair.CELOUSD,
          reportTarget: CeloContract.StableToken,
          metricCollector,
          unusedOracleAddresses: [],
        }
        await createAndInitializeReporter(config)
        jest.spyOn(reporter, 'lastReportedTimeMs', 'get').mockImplementation(() => lastReportedTime)
      })

      it('gets threshold close to base', async () => {
        lastReportedTime = Date.now() - utils.secondsToMs(1)
        expect(reporter.calculateCircuitBreakerPriceChangeThreshold().toNumber()).toBeCloseTo(
          testThreshMin.toNumber(),
          2
        )
      })

      it('gets max threshold', async () => {
        lastReportedTime = Date.now() - utils.minutesToMs(120)
        expect(reporter.calculateCircuitBreakerPriceChangeThreshold().toNumber()).toBe(
          testThreshMax.toNumber()
        )
      })

      it('gets a threshold that is not close to base or max', async () => {
        lastReportedTime = Date.now() - utils.minutesToMs(15)
        expect(
          reporter.calculateCircuitBreakerPriceChangeThreshold().toNumber()
        ).toBeGreaterThanOrEqual(0.19)
        expect(reporter.calculateCircuitBreakerPriceChangeThreshold().toNumber()).toBeLessThan(0.21)

        lastReportedTime = Date.now() - utils.minutesToMs(30)
        expect(
          reporter.calculateCircuitBreakerPriceChangeThreshold().toNumber()
        ).toBeGreaterThanOrEqual(0.21)
        expect(
          reporter.calculateCircuitBreakerPriceChangeThreshold().toNumber()
        ).toBeLessThanOrEqual(0.23)

        lastReportedTime = Date.now() - utils.minutesToMs(45)
        expect(
          reporter.calculateCircuitBreakerPriceChangeThreshold().toNumber()
        ).toBeGreaterThanOrEqual(0.23)
        expect(
          reporter.calculateCircuitBreakerPriceChangeThreshold().toNumber()
        ).toBeLessThanOrEqual(0.245)
      })
    })

    describe('priceToReport', () => {
      let lastReportedPrice: BigNumber

      beforeEach(async () => {
        // create a new reporter for each test so that by default circuitBreakerOpen is false
        await createAndInitializeReporter(defaultConfig)
        lastReportedPrice = new BigNumber(currentPriceValue)
        jest.spyOn(reporter, 'lastReportedPrice', 'get').mockReturnValue(lastReportedPrice)
        jest.spyOn(reporter, 'lastReportedTimeMs', 'get').mockImplementation(() => Date.now() - 500)
        jest.spyOn(dataAggregator, 'currentPrice').mockImplementation(currentPriceFn)
      })

      it('gets the currentPrice from the dataAggregator', async () => {
        expect(currentPriceFn).toBeCalledTimes(0)
        const price = await reporter.priceToReport()
        expect(currentPriceFn).toBeCalledTimes(1)
        expect(price).toBe(currentPriceValue)
      })

      it('throws if the currentPrice from the dataAggregator throws', async () => {
        jest.spyOn(dataAggregator, 'currentPrice').mockImplementation(async () => {
          throw Error('foo')
        })
        await expect(async () => reporter.priceToReport()).rejects.toThrow()
      })

      it('does not throw if there is no last reported price', () => {
        jest.spyOn(reporter, 'lastReportedPrice', 'get').mockReturnValue(undefined)
        expect(() => reporter.priceToReport).not.toThrow()
      })

      it('does not throw if the new price is greater and close enough to the last reported price', () => {
        // the maximum value
        currentPriceValue = lastReportedPrice.times(circuitBreakerPriceChangeThresholdMin.plus(1))
        expect(() => reporter.priceToReport).not.toThrow()
      })

      it('does not throw if the new price is less and close enough to the last reported price', () => {
        // the minimum value
        currentPriceValue = lastReportedPrice.times(
          circuitBreakerPriceChangeThresholdMin.negated().plus(1)
        )
        expect(() => reporter.priceToReport).not.toThrow()
      })

      it('throws if the new price is greater and not close enough to the last reported price', async () => {
        currentPriceValue = lastReportedPrice.times(circuitBreakerPriceChangeThresholdMin.plus(1.1))
        await expect(() => reporter.priceToReport()).rejects.toThrow('Circuit breaker is open')
      })

      it('throws if the new price is less and not close enough to the last reported price', async () => {
        currentPriceValue = lastReportedPrice.times(
          circuitBreakerPriceChangeThresholdMin.negated().plus(0.9)
        )
        await expect(() => reporter.priceToReport()).rejects.toThrow('Circuit breaker is open')
      })

      it('does not throw if the new price is less and not close enough to the last reported price but enough time has elapsed', async () => {
        currentPriceValue = lastReportedPrice.times(
          circuitBreakerPriceChangeThresholdMin.negated().plus(0.9)
        )
        jest
          .spyOn(reporter, 'lastReportedTimeMs', 'get')
          .mockImplementation(
            () => Date.now() - reporter.config.circuitBreakerDurationTimeMs - 20000
          )
        await expect(() => reporter.priceToReport()).not.toThrow()
      })

      it('uses doWithErrorContext to track thrown errors', async () => {
        jest.spyOn(dataAggregator, 'currentPrice').mockImplementation(() => {
          throw Error('foo')
        })
        const spy = jest.spyOn(utils, 'doAsyncFnWithErrorContext')
        expect(spy).toBeCalledTimes(0)
        await expect(() => reporter.priceToReport()).rejects.toThrow(`foo`)
        expect(spy).toBeCalledTimes(1)
        expect(reporter.config.metricCollector!.error).toBeCalledWith(Context.REPORT_PRICE)
      })
    })
  })
})
