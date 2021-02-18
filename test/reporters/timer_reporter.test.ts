import { CeloContract, newKit } from '@celo/contractkit'
import { ExchangeWrapper } from '@celo/contractkit/lib/wrappers/Exchange'
import { ReportTarget, SortedOraclesWrapper } from '@celo/contractkit/lib/wrappers/SortedOracles'
import BigNumber from 'bignumber.js'
import { DataAggregator } from '../../src/data_aggregator'
import { baseLogger, defaultDataAggregatorConfig } from '../../src/default_config'
import { Context, MetricCollector, ReportTrigger } from '../../src/metric_collector'
import { TimerReporter, TimerReporterConfig } from '../../src/reporters/timer_reporter'
import * as OracleUtils from '../../src/utils'

jest.mock('@celo/contractkit')
jest.mock('../../src/metric_collector')

jest.setTimeout(10 * 1000)

// When we tell jest to run a pending timer, the timer callback may be asynchronous
// and it's hard to wait for those asynchronous actions to finish. If we await
// this function, we await for any immediately returning async actions from the timer.
// See https://stackoverflow.com/questions/52177631/jest-timer-and-promise-dont-work-well-settimeout-and-async-function
function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('Reporter', () => {
  let currentPriceValue: BigNumber = new BigNumber(12.06)

  jest.mock('@celo/contractkit')
  const currentPriceFn = jest.fn().mockImplementation(() => Promise.resolve(currentPriceValue))

  jest.mock('../../src/utils')

  const kit = newKit('https://')

  // Randomly generated addresss
  const mockOracleAccount = '0x086bb25bFCD323f82a7d1c95E4Cf3807B8831270'
  const circuitBreakerPriceChangeThresholdMax = new BigNumber(0.01)
  const circuitBreakerPriceChangeThresholdMin = new BigNumber(0.01)
  const circuitBreakerPriceChangeThresholdTimeMultiplier = new BigNumber(0.0075)

  let dataAggregator: DataAggregator
  let reporter: TimerReporter
  let metricCollector: MetricCollector
  let defaultConfig: TimerReporterConfig

  async function createAndInitializeReporter(config: TimerReporterConfig): Promise<void> {
    metricCollector = new MetricCollector(baseLogger)
    reporter = new TimerReporter({
      ...config,
      metricCollector,
    })
    await reporter.init()
  }

  beforeEach(() => {
    const dataAggregatorCfg = {
      ...defaultDataAggregatorConfig,
      currencyPair: OracleUtils.OracleCurrencyPair.CELOUSD,
    }
    dataAggregator = new DataAggregator(dataAggregatorCfg)
    jest.spyOn(dataAggregator, 'currentPrice').mockImplementation(currentPriceFn)

    defaultConfig = {
      baseLogger,
      kit,
      circuitBreakerPriceChangeThresholdMax,
      circuitBreakerPriceChangeThresholdMin,
      circuitBreakerPriceChangeThresholdTimeMultiplier,
      dataAggregator,
      gasPriceMultiplier: new BigNumber(5.0),
      transactionRetryLimit: 0,
      transactionRetryGasPriceMultiplier: new BigNumber(0),
      oracleAccount: mockOracleAccount,
      currencyPair: OracleUtils.OracleCurrencyPair.CELOUSD,
      reportTarget: CeloContract.StableToken,
      metricCollector,
      removeExpiredFrequency: OracleUtils.minutesToMs(1),
      unusedOracleAddresses: [],
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  describe('init()', () => {
    let bucketUpdateFrequencyMs: number
    let oracleWhitelist: string[]
    let isOracle: boolean
    let sortedOraclesMock: SortedOraclesWrapper
    let exchangeMock: ExchangeWrapper

    beforeEach(async () => {
      sortedOraclesMock = await kit.contracts.getSortedOracles()
      exchangeMock = await kit.contracts.getExchange()

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

      describe('values set during initialization', () => {
        describe('without schedule overrides', () => {
          beforeEach(async () => {
            bucketUpdateFrequencyMs = OracleUtils.secondsToMs(
              (await exchangeMock.updateFrequency()).toNumber()
            )
          })
          it('sets reportFrequencyMs to be equal to the bucket update frequency', async () => {
            await createAndInitializeReporter(defaultConfig)
            expect(reporter.reportFrequencyMs).toEqual(bucketUpdateFrequencyMs)
          })

          describe('when this account is first in the whitelist', () => {
            beforeEach(async () => {
              oracleWhitelist = [
                mockOracleAccount,
                '0x0000000000000000000000000000000000000111',
                '0x0000000000000000000000000000000000000222',
                '0x0000000000000000000000000000000000000333',
              ]
              await createAndInitializeReporter(defaultConfig)
            })

            it('sets the offsets to 0', () => {
              expect(reporter.reportOffsetMs).toEqual(0)
              expect(reporter.removeExpiredOffsetMs).toEqual(0)
            })
          })

          describe('when this account 3rd (index 2) in the whitelist', () => {
            beforeEach(async () => {
              oracleWhitelist = [
                '0x0000000000000000000000000000000000000111',
                '0x0000000000000000000000000000000000000222',
                mockOracleAccount,
                '0x0000000000000000000000000000000000000333',
              ]
              await createAndInitializeReporter(defaultConfig)
            })

            it('sets the offsets correctly', () => {
              expect(reporter.reportOffsetMs).toEqual((2 / 4) * reporter.reportFrequencyMs)
              expect(reporter.removeExpiredOffsetMs).toEqual(
                (2 / 4) * reporter.removeExpiredFrequencyMs
              )
            })
          })
        })

        describe('schedule overrides', () => {
          describe('when frequency overrides are set', () => {
            const reportFrequencyOverride = OracleUtils.minutesToMs(9)

            beforeEach(async () => {
              const config = {
                ...defaultConfig,
                reportFrequencyOverride,
              }

              await createAndInitializeReporter(config)
            })

            it('sets the frequencies using the overrides', () => {
              expect(reporter.reportFrequencyMs).toEqual(reportFrequencyOverride)
            })

            it('does not call the exchange contract', () => {
              expect(exchangeMock.updateFrequency).not.toHaveBeenCalled()
            })
          })

          describe('when offset overrides are set to 0', () => {
            beforeEach(async () => {
              const config = {
                ...defaultConfig,
                reportOffsetOverride: 0,
                removeExpiredOffsetOverride: 0,
              }
              await createAndInitializeReporter(config)
            })

            it('uses 0 as the offsets', () => {
              expect(reporter.reportOffsetMs).toEqual(0)
              expect(reporter.removeExpiredOffsetMs).toEqual(0)
            })
          })

          describe('when offset overrides are set to a non-zero number', () => {
            const reportOffsetOverride = 12300
            const removeExpiredOffsetOverride = 45600

            beforeEach(async () => {
              const config = {
                ...defaultConfig,
                reportOffsetOverride,
                removeExpiredOffsetOverride,
              }
              await createAndInitializeReporter(config)
            })
            it('uses the overrides as the offsets', () => {
              expect(reporter.reportOffsetMs).toEqual(reportOffsetOverride)
              expect(reporter.removeExpiredOffsetMs).toEqual(removeExpiredOffsetOverride)
            })
          })

          describe('when only one offset override is set', () => {
            const removeExpiredOffsetOverride = 11111
            beforeEach(async () => {
              const config = {
                ...defaultConfig,
                removeExpiredOffsetOverride: 11111,
              }
              await createAndInitializeReporter(config)
            })

            it('uses the override that is given', () => {
              expect(reporter.removeExpiredOffsetMs).toEqual(removeExpiredOffsetOverride)
            })
            it('gets the whitelist from the SortedOracles contract', () => {
              expect(sortedOraclesMock.getOracles).toBeCalledTimes(1)
            })
          })
        })
      })
    })
  })

  describe('when initialized correctly', () => {
    let sortedOraclesMock: SortedOraclesWrapper
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
    })

    describe('start()', () => {
      let setupReportSpy: jest.SpyInstance
      let setupRemovalSpy: jest.SpyInstance

      describe('loops', () => {
        beforeEach(() => {
          setupReportSpy = jest
            .spyOn(reporter, 'setupNextReport')
            .mockImplementation(() => undefined)
          setupRemovalSpy = jest
            .spyOn(reporter, 'setupNextExpiredReportRemoval')
            .mockImplementation(() => undefined)
        })

        it('kicks off the report loop', () => {
          expect(setupReportSpy).not.toBeCalled()
          reporter.start()
          expect(setupReportSpy).toHaveBeenCalledTimes(1)
        })

        it('kicks off the removeExpiredReports loop', () => {
          expect(setupRemovalSpy).not.toBeCalled()
          reporter.start()
          expect(setupRemovalSpy).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe('setupNextReport()', () => {
      let reportSpy: jest.SpyInstance
      beforeEach(async () => {
        reportSpy = jest.spyOn(reporter, 'report').mockImplementation(async () => undefined)
      })

      it('calls report and sets up the next report', async () => {
        expect(reportSpy).not.toBeCalled()

        reporter.setupNextReport()

        jest.runOnlyPendingTimers()
        await flushPromises()
        expect(reportSpy).toHaveBeenCalledTimes(1)

        // The next report should be set up
        expect(jest.getTimerCount()).toEqual(1)
      })

      it('uses the value from msToNextReport to setup the next one', async () => {
        const msToNext = 123456
        jest.spyOn(reporter, 'msToNextReport', 'get').mockReturnValue(msToNext)
        reporter.setupNextReport()
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), msToNext)
      })

      it('still schedules the next report if a report throws', async () => {
        reportSpy = jest
          .spyOn(reporter, 'report')
          .mockImplementationOnce(() => {
            throw Error('foo')
          })
          .mockImplementationOnce(async () => undefined)
        expect(reportSpy).toHaveBeenCalledTimes(0)
        reporter.setupNextReport()
        jest.advanceTimersToNextTimer()
        await flushPromises()
        expect(reportSpy).toHaveBeenCalledTimes(1)
        // Ensure that it threw an error and did not return
        expect(reportSpy).not.toHaveReturned()

        // On the second call, no error is thrown
        jest.advanceTimersToNextTimer()
        await flushPromises()
        // Show that the non-throwing implementation has run
        expect(reportSpy).toHaveBeenCalledTimes(2)
        expect(reportSpy).toHaveReturned()
      })

      it('collects metrics on report errors', async () => {
        reporter.setupNextReport()
        jest.advanceTimersToNextTimer()
        // No errors reported when there is no error
        expect(metricCollector.error).not.toBeCalled()
        // Then throw an error on the next report
        jest.spyOn(reporter, 'report').mockImplementation(() => {
          throw Error('foo')
        })
        jest.advanceTimersToNextTimer()
        await flushPromises()
        expect(metricCollector.error).toBeCalledWith(Context.REPORT)
      })
    })

    describe('setupNextExpiredReportRemoval()', () => {
      let expireSpy: jest.SpyInstance
      beforeEach(() => {
        expireSpy = jest.spyOn(reporter, 'expire')
      })

      it('setupNextExpiredReportRemoval() calls removeExpiredReports and sets up next', () => {
        expect(expireSpy).not.toBeCalled()

        reporter.setupNextExpiredReportRemoval()

        jest.runOnlyPendingTimers()
        expect(expireSpy).toHaveBeenCalledTimes(1)

        // The next expired report removal should be set up
        expect(jest.getTimerCount()).toEqual(1)
      })

      it('uses the value from msToNextRemoveExpired to setup the next one', () => {
        const msToNext = 123123
        jest.spyOn(reporter, 'msToNextRemoveExpired', 'get').mockReturnValue(msToNext)
        reporter.setupNextExpiredReportRemoval()
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), msToNext)
      })

      it('still schedules the next expire call if expire throws', async () => {
        expireSpy = jest
          .spyOn(reporter, 'expire')
          .mockImplementationOnce(() => {
            throw Error('foo')
          })
          .mockImplementationOnce(async () => undefined)
        expect(expireSpy).toHaveBeenCalledTimes(0)
        reporter.setupNextExpiredReportRemoval()
        jest.advanceTimersToNextTimer()
        expect(expireSpy).toHaveBeenCalledTimes(1)
        // Ensure that it threw an error and did not return
        expect(expireSpy).not.toHaveReturned()

        // On the second call, no error is thrown
        jest.advanceTimersToNextTimer()
        // Show that the non-throwing implementation has run
        expect(expireSpy).toHaveBeenCalledTimes(2)
        expect(expireSpy).toHaveReturned()
      })

      it('collects metrics on expire errors', async () => {
        reporter.setupNextExpiredReportRemoval()
        jest.advanceTimersToNextTimer()
        // No errors reported when there is no error
        expect(metricCollector.error).not.toBeCalled()
        // Then throw an error on the next expiry
        jest.spyOn(reporter, 'expire').mockImplementation(() => {
          throw Error('foo')
        })
        jest.advanceTimersToNextTimer()
        expect(metricCollector.error).toBeCalledWith(Context.EXPIRY)
      })
    })

    describe('doReport()', () => {
      beforeEach(async () => {
        currentPriceValue = new BigNumber(12)
        jest.spyOn(reporter, 'priceToReport').mockImplementation(currentPriceFn)
        sortedOraclesMock = await reporter.config.kit.contracts.getSortedOracles()
      })

      it('calls priceToReport to get the current price', async () => {
        expect(currentPriceFn).toHaveBeenCalledTimes(0)
        await reporter.doReport()
        expect(currentPriceFn).toHaveBeenCalledTimes(1)
      })

      it('calls BaseReporter report() with the right params if priceToReport does not throw', async () => {
        currentPriceValue = new BigNumber(12.12)
        const reportSpy = jest.spyOn(reporter, 'report')
        await reporter.doReport()
        expect(reportSpy).toHaveBeenCalledWith(currentPriceValue, ReportTrigger.TIMER)
      })

      it('throws and does not call SortedOracles.report if priceToReport throws', async () => {
        jest.spyOn(reporter, 'priceToReport').mockImplementation(() => {
          throw Error('foo')
        })
        await expect(() => reporter.doReport()).rejects.toThrow()
        expect(sortedOraclesMock.report).toHaveBeenCalledTimes(0)
      })

      it('updates the last reported price after a report is made', async () => {
        expect(reporter.lastReportedPrice).toBe(undefined)
        await reporter.doReport()
        expect(reporter.lastReportedPrice).toBe(currentPriceValue)
      })

      describe('metrics', () => {
        it('collects metrics on successful reports', async () => {
          await reporter.doReport()
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
    })

    describe('interval calculations', () => {
      let msToNextActionSpy: jest.SpyInstance

      beforeEach(() => {
        msToNextActionSpy = jest.spyOn(OracleUtils, 'msToNextAction')
      })

      it('passes the right frequency and offset for msToNextReport', () => {
        const reportFrequencyMs = OracleUtils.minutesToMs(5)
        const reportOffsetMs = 1500
        jest.spyOn(reporter, 'reportFrequencyMs', 'get').mockReturnValue(reportFrequencyMs)
        jest.spyOn(reporter, 'reportOffsetMs', 'get').mockReturnValue(reportOffsetMs)

        // tslint:disable-next-line: no-unused-expression
        reporter.msToNextReport

        expect(msToNextActionSpy).toHaveBeenCalledWith(reportFrequencyMs, reportOffsetMs)
      })

      it('passes the right frequency and offset for msToNextRemoveExpired', () => {
        const removeExpiredFrequencyMs = OracleUtils.minutesToMs(5)
        const removeExpiredOffsetMs = 1500
        jest
          .spyOn(reporter, 'removeExpiredFrequencyMs', 'get')
          .mockReturnValue(removeExpiredFrequencyMs)
        jest.spyOn(reporter, 'removeExpiredOffsetMs', 'get').mockReturnValue(removeExpiredOffsetMs)

        // tslint:disable-next-line: no-unused-expression
        reporter.msToNextRemoveExpired

        expect(msToNextActionSpy).toHaveBeenCalledWith(
          removeExpiredFrequencyMs,
          removeExpiredOffsetMs
        )
      })
    })
  })
})
