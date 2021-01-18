import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import * as aggregators from '../src/aggregator_functions'
import { DataAggregator } from '../src/data_aggregator'
import { baseLogger } from '../src/default_config'
import { Ticker, Trade } from '../src/exchange_adapters/base'
import { BittrexAdapter } from '../src/exchange_adapters/bittrex'
import { CoinbaseAdapter } from '../src/exchange_adapters/coinbase'
import { OKCoinAdapter } from '../src/exchange_adapters/okcoin'
import { MetricCollector } from '../src/metric_collector'
import {
  AggregationMethod,
  Exchange,
  ExternalCurrency,
  minutesToMs,
  secondsToMs,
} from '../src/utils'
import {
  generateGoodTicker,
  halfWeightExponentialScaling,
  testArrayBig1,
  testArrayBig2,
  testArrayBig3,
  testArrayLarge1,
  testArrayLarge2,
  testArrayLarge3,
  testArrayLarge4,
  testArrayLarge5,
  testArraySmallAmounts1,
  testArraySmallAmounts2,
  testTickerArray,
} from './data_aggregator_testdata_utils'

jest.mock('../src/metric_collector')

jest.mock('../src/exchange_adapters/bittrex')
jest.mock('../src/exchange_adapters/coinbase')
jest.mock('../src/exchange_adapters/okcoin')

describe('DataAggregator', () => {
  const aggregationWindowDuration = minutesToMs(6)
  const apiRequestTimeout = secondsToMs(5)
  const baseCurrency = CeloContract.GoldToken
  const fetchFrequency = secondsToMs(30)
  const maxNoTradeDuration = secondsToMs(10)
  const quoteCurrency = ExternalCurrency.USD
  const metricCollector = new MetricCollector(baseLogger)

  let minExchangeCount = 1
  let minTradeCount = 10
  let scalingRate = new BigNumber(0.1 / 1000) // ~36% scaling factor per 10 seconds
  const minAggregatedVolume = new BigNumber(1000)

  let dataAggregator: DataAggregator
  let testTrades: Trade[][]
  let testFetchingTime = 40000

  let aggregationMethod = AggregationMethod.TRADES
  let testTickers: Ticker[]

  const allowNotCGLD = false
  const askMaxPercentageDeviation = new BigNumber(0.2)
  const bidMaxPercentageDeviation = new BigNumber(0.2)
  const maxExchangeVolumeShare = new BigNumber(0.99)
  const maxPercentageBidAskSpread = new BigNumber(0.1)

  let exchanges: Exchange[] | undefined

  function resetDefaults() {
    exchanges = undefined
    minExchangeCount = 1
    scalingRate = new BigNumber(0.1 / 1000) // ~36% scaling factor per 10 seconds
    minTradeCount = 10
    dataAggregator.config.minAggregatedVolume = minAggregatedVolume
  }

  function setupDataAggregatorWithCurrentConfig(): void {
    dataAggregator = new DataAggregator({
      allowNotCGLD,
      aggregationMethod,
      aggregationWindowDuration,
      apiRequestTimeout,
      askMaxPercentageDeviation,
      baseCurrency,
      baseLogger,
      bidMaxPercentageDeviation,
      exchanges,
      fetchFrequency,
      maxExchangeVolumeShare,
      maxNoTradeDuration,
      maxPercentageBidAskSpread,
      metricCollector,
      minExchangeCount,
      minTradeCount,
      quoteCurrency,
      scalingRate,
      minAggregatedVolume,
    })
    Object.defineProperty(dataAggregator, 'fetchingTime', { value: testFetchingTime })
    jest.spyOn(dataAggregator, 'tradesPerExchange', 'get').mockImplementation(() => {
      return testTrades
    })
  }

  beforeEach(() => {
    resetDefaults()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  describe('currentPrice()', () => {
    describe('trades', () => {
      beforeAll(() => {
        aggregationMethod = AggregationMethod.TRADES
        setupDataAggregatorWithCurrentConfig()
      })

      it('should throw if the number of exchanges that have trades is below minExchangeCount', async () => {
        testTrades = [[], []]
        await expect(dataAggregator.currentPrice()).rejects.toThrow(
          `An insufficient number of exchanges provided data: 0 < ${minExchangeCount}`
        )
      })

      it('should throw if the number of trades is below minTradeCount', async () => {
        testTrades = [testArrayBig1, []]
        await expect(dataAggregator.currentPrice()).rejects.toThrow(
          `An insufficient number of total trades has been provided: ${testArrayBig1.length} < ${minTradeCount}`
        )
      })

      describe('when the number of trades is equal to minTradeCount', () => {
        beforeEach(() => {
          minTradeCount = testArrayBig1.length
          setupDataAggregatorWithCurrentConfig()
        })

        it('should return 255 if the number of trades is equal to minTradeCount', async () => {
          testTrades = [testArrayBig1, []]
          await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(new BigNumber(255))
        })
      })

      it('should throw if the most recent trade has been executed before lastFetchTime - mostRecentTradeTimestamp', async () => {
        testTrades = [testArrayBig1, testArrayBig2]
        const lastFetchTime = 100000
        Object.defineProperty(dataAggregator, 'lastFetchTime', { value: lastFetchTime })
        const mostRecentTradeTimestamp = Math.max(
          ...[...testArrayBig1, ...testArrayBig2].map((trade: Trade) => trade.timestamp)
        )
        await expect(dataAggregator.currentPrice()).rejects.toThrow(
          `The most recent trade was executed too far in the past: ${
            lastFetchTime - mostRecentTradeTimestamp
          } > ${maxNoTradeDuration}`
        )
      })

      describe('time scaling', () => {
        describe('when scaling is set to ~36% scaling factor per 10 seconds', () => {
          beforeEach(() => {
            scalingRate = new BigNumber(0.1 / 1000)
            setupDataAggregatorWithCurrentConfig()
          })
          it('should return 230', async () => {
            testTrades = [testArrayBig1, testArrayBig2]
            await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(new BigNumber(230))
          })

          it('should return 230, dealing with small amounts without problems', async () => {
            testTrades = [testArraySmallAmounts1, testArraySmallAmounts2]
            await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(new BigNumber(230))
          })
          it('should return testArrayBig3 as the amount is scaled with an exponential scaling factor', () => {
            testTrades = [testArrayBig1]
            expect(dataAggregator.timeScalingVolume(testTrades, 30000)).toStrictEqual([
              testArrayBig3,
            ])
          })
        })
        describe('when the time scaling is set very high', () => {
          beforeEach(() => {
            scalingRate = new BigNumber(100000)
            setupDataAggregatorWithCurrentConfig()
          })

          it('should return the price (255) of the most recent trade as past trades are scaled down', async () => {
            testTrades = [testArrayBig1, testArrayBig2]
            await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(new BigNumber(255))
          })
        })
        describe('with a small scaling rate', () => {
          beforeEach(() => {
            scalingRate = new BigNumber(0.005 / 1000)
            setupDataAggregatorWithCurrentConfig()
          })
          /* The expected price in the test can be calculated as the price of the trade array is depending
           * linearly on the index and the trade amounts are all the same. Therefore, the index half of the total amount
           * falls into can be determined. Using this index the price corresponding to the weighted median can be calculated.
           */
          it('should pass as data from five exchanges with 10000 trades each should not cause a problem', async () => {
            testTrades = [
              testArrayLarge1,
              testArrayLarge2,
              testArrayLarge3,
              testArrayLarge4,
              testArrayLarge5,
            ]
            await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(
              new BigNumber(halfWeightExponentialScaling(scalingRate, 300000, 10000) * 0.0001 + 160)
            )
          })
        })
      })

      describe('weightedMedian', () => {
        const testMinTradeCount = 1
        const testScalingRate = new BigNumber(0)
        beforeEach(() => {
          minTradeCount = testMinTradeCount
          scalingRate = testScalingRate
          setupDataAggregatorWithCurrentConfig()
        })

        it('should return 220 as weighted median falls between 210 and 230 and should be the average of both', async () => {
          testTrades = [testArrayBig1]
          await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(new BigNumber(220))
        })

        it('should return 210 as there is only one entry in the trade array.', async () => {
          testTrades = [[testArrayBig1[2]]]
          // Next line resets lastFetchTime to be adjusted to testTrades; otherwise requireValidTrades would throw
          testFetchingTime = testTrades[0][0].timestamp
          Object.defineProperty(dataAggregator, 'lastFetchTime', { value: testFetchingTime })
          await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(new BigNumber(210))
        })

        it('should return 225 as dealing with small amounts should not cause problems ', async () => {
          testTrades = [testArraySmallAmounts1, testArraySmallAmounts2]
          await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(new BigNumber(225))
        })

        it('should reject if an amount is negative', async () => {
          testTrades = [
            [
              {
                source: Exchange.OKCOIN,
                id: 'blah',
                symbol: 'CELO-USD',
                timestamp: 0,
                price: new BigNumber(0),
                amount: new BigNumber(0),
                cost: new BigNumber(0),
              },
              {
                source: Exchange.OKCOIN,
                id: 'blah',
                symbol: 'CELO-USD',
                timestamp: 0,
                price: new BigNumber(0),
                amount: new BigNumber(0),
                cost: new BigNumber(0),
              },
              {
                source: Exchange.OKCOIN,
                id: 'blah',
                symbol: 'CELO-USD',
                timestamp: 0,
                price: new BigNumber(0),
                amount: new BigNumber(0),
                cost: new BigNumber(0),
              },
              {
                source: Exchange.OKCOIN,
                id: 'blah',
                symbol: 'CELO-USD',
                timestamp: 0,
                price: new BigNumber(0),
                amount: new BigNumber(-1),
                cost: new BigNumber(0),
              },
              {
                source: Exchange.OKCOIN,
                id: 'blah',
                symbol: 'CELO-USD',
                timestamp: 0,
                price: new BigNumber(0),
                amount: new BigNumber(0),
                cost: new BigNumber(0),
              },
            ],
          ]
          await expect(dataAggregator.currentPrice()).rejects.toThrow()
        })
      })
    })

    describe('midprices', () => {
      beforeAll(() => {
        aggregationMethod = AggregationMethod.MIDPRICES
      })

      beforeEach(() => {
        setupDataAggregatorWithCurrentConfig()
      })

      describe('exception handling', () => {
        it('should throw if fetchAllTickers throws due to no successful tickers', async () => {
          for (const exchangeAdapter of Array.from(dataAggregator.exchangeAdapters)) {
            jest.spyOn(exchangeAdapter, 'fetchTicker').mockImplementation(async () => {
              throw Error('foo')
            })
          }
          await expect(async () => dataAggregator.currentPrice()).rejects.toThrow(
            'All ticker requests failed'
          )
        })

        it('should throw if fetchAllTickers throws for any reason', async () => {
          jest.spyOn(dataAggregator, 'fetchAllTickers').mockImplementation(async () => {
            throw Error('foo')
          })
          await expect(async () => dataAggregator.currentPrice()).rejects.toThrow('foo')
        })
      })

      describe('checkIndividualTickerData()', () => {
        it('ticker with a symbol different to CELO/USD throws', () => {
          const wrongSymbolTestTicker = testTickerArray[13]
          const symbolPlaceholder = wrongSymbolTestTicker[1].symbol
          wrongSymbolTestTicker[1].symbol = 'USD/CELO'
          expect(() =>
            aggregators.checkIndividualTickerData(
              wrongSymbolTestTicker,
              dataAggregator.config,
              baseLogger
            )
          ).toThrow(`USD/CELO does not equal CELO/USD`)
          // Revert value in case it's used in other tests
          wrongSymbolTestTicker[1].symbol = symbolPlaceholder
        })

        it('tickers with zero ask are removed', () => {
          expect(
            aggregators.checkIndividualTickerData(
              testTickerArray[3],
              dataAggregator.config,
              baseLogger
            )
          ).toStrictEqual(testTickerArray[3].slice(1))
        })

        it('all tickers with zero ask throws', () => {
          expect(() =>
            aggregators.checkIndividualTickerData(
              testTickerArray[15],
              dataAggregator.config,
              baseLogger
            )
          ).toThrow(`No valid tickers available`)
        })

        it('ticker with negative bids are removed', () => {
          expect(
            aggregators.checkIndividualTickerData(
              testTickerArray[4],
              dataAggregator.config,
              baseLogger
            )
          ).toStrictEqual(testTickerArray[4].slice(0, 2))
        })

        it('all tickers with negative volume throws', () => {
          expect(() =>
            aggregators.checkIndividualTickerData(
              testTickerArray[14],
              dataAggregator.config,
              baseLogger
            )
          ).toThrow(`No valid tickers available`)
        })

        it('ticker with too low of volume throws', () => {
          dataAggregator.config.minAggregatedVolume = new BigNumber(5000)
          const tickerData = aggregators.checkIndividualTickerData(
            testTickerArray[5],
            dataAggregator.config,
            baseLogger
          )
          expect(() => aggregators.crossCheckTickerData(tickerData, dataAggregator.config)).toThrow(
            `Aggregate volume 4000 is less than minimum threshold 5000`
          )
        })

        it('tickers with ask < bid are removed', () => {
          expect(
            aggregators.checkIndividualTickerData(
              testTickerArray[6],
              dataAggregator.config,
              baseLogger
            )
          ).toStrictEqual(testTickerArray[6].slice(1))
        })

        it('tickers with a too large bid-ask spread are removed', () => {
          expect(
            aggregators.checkIndividualTickerData(
              testTickerArray[7],
              dataAggregator.config,
              baseLogger
            )
          ).toStrictEqual(testTickerArray[7].slice(1))
        })
      })

      describe('cross-checks for tickers', () => {
        beforeEach(() => {
          jest
            .spyOn(dataAggregator, 'fetchAllTickers')
            .mockImplementation(async () => Promise.resolve(testTickers))
        })

        it('asks should not deviate more than askMaxPercentageDeviation', () => {
          expect(() =>
            aggregators.crossCheckTickerData(testTickerArray[8], dataAggregator.config)
          ).toThrow('Max ask price cross-sectional deviation too large')
        })

        it('bids should not deviate more than bidMaxPercentageDeviation', () => {
          expect(() =>
            aggregators.crossCheckTickerData(testTickerArray[9], dataAggregator.config)
          ).toThrow('Max bid price cross-sectional deviation too large')
        })

        it('no exchange should have a volume share bigger than maxExchangeVolumeShare', () => {
          expect(() =>
            aggregators.crossCheckTickerData(testTickerArray[10], dataAggregator.config)
          ).toThrow('The volume share of one exchange is too large')
        })

        it('no exchange should be represented by more than one ticker', async () => {
          testTickers = testTickerArray[12]
          await expect(async () => dataAggregator.currentPrice()).rejects.toThrow(
            'Received multiple tickers for the same exchange'
          )
        })
      })

      describe('price calculation', () => {
        beforeEach(() => {
          jest
            .spyOn(dataAggregator, 'fetchAllTickers')
            .mockImplementation(async () => Promise.resolve(testTickers))
        })

        it('weighted avg mid price should be 10.5 if all mid prices are 10.5', async () => {
          testTickers = testTickerArray[0]
          await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(new BigNumber(10.5))
        })

        it('weighted avg mid price should be correctly calcuated if weights and prices differ', async () => {
          testTickers = testTickerArray[11]
          await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(new BigNumber(2.06))
        })
      })
    })
  })

  describe('setup', () => {
    const expectedConfig = {
      apiRequestTimeout,
      baseCurrency,
      baseLogger: expect.anything(),
      dataRetentionWindow: aggregationWindowDuration * 2,
      fetchFrequency,
      metricCollector: expect.anything(),
      quoteCurrency,
    }

    describe('when no adapters are specified in the config', () => {
      beforeEach(() => {
        exchanges = undefined
        setupDataAggregatorWithCurrentConfig()
      })

      it('initializes all possible exchange adapters', () => {
        expect(BittrexAdapter).toHaveBeenCalledWith(expectedConfig)
        expect(CoinbaseAdapter).toHaveBeenCalledWith(expectedConfig)
        expect(OKCoinAdapter).toHaveBeenCalledWith(expectedConfig)
      })

      it('adds the adapters to the set belonging to the aggregator', () => {
        expect(dataAggregator.exchangeAdapters.length).toEqual(3)
      })
    })
    describe('when a subset of adapters are specified', () => {
      beforeEach(() => {
        exchanges = [Exchange.BITTREX, Exchange.OKCOIN]
        setupDataAggregatorWithCurrentConfig()
      })

      it('initializes only those adapters', () => {
        expect(BittrexAdapter).toHaveBeenCalledWith(expectedConfig)
        expect(OKCoinAdapter).toHaveBeenCalledWith(expectedConfig)

        expect(CoinbaseAdapter).not.toHaveBeenCalled()
      })
      it('adds only those adapters to the set', () => {
        expect(dataAggregator.exchangeAdapters.length).toEqual(2)
      })
    })
    it('prevents duplicate adapters from being added', () => {
      exchanges = [Exchange.BITTREX, Exchange.BITTREX, Exchange.COINBASE, Exchange.BITTREX]
      setupDataAggregatorWithCurrentConfig()
      expect(BittrexAdapter).toHaveBeenCalledTimes(1)
      expect(dataAggregator.exchangeAdapters.length).toEqual(2)
    })
  })

  describe('data collection', () => {
    describe('trades', () => {
      beforeEach(() => {
        aggregationMethod = AggregationMethod.TRADES
        setupDataAggregatorWithCurrentConfig()
      })
      it('startDataCollection() starts collecting trade data from each exchange', () => {
        dataAggregator.startDataCollection()
        for (const adapter of dataAggregator.exchangeAdapters) {
          expect(adapter.startCollectingTrades).toHaveBeenCalled()
        }
      })
      it('stopDataCollection() stops all exchanges from collecting trades', () => {
        dataAggregator.stopDataCollection()
        for (const adapter of dataAggregator.exchangeAdapters) {
          expect(adapter.stopCollectingTrades).toHaveBeenCalled()
        }
      })
    })

    describe('midprices', () => {
      beforeEach(() => {
        aggregationMethod = AggregationMethod.MIDPRICES
        setupDataAggregatorWithCurrentConfig()
      })
      // Midprice method gets data on-demand, rather than collecting on an ongoing basis
      it('startDataCollection() does not start collecting trades', () => {
        dataAggregator.startDataCollection()
        for (const adapter of dataAggregator.exchangeAdapters) {
          expect(adapter.startCollectingTrades).not.toHaveBeenCalled()
        }
      })
      it('stopDataCollection() does not do anything', () => {
        dataAggregator.stopDataCollection()
        for (const adapter of dataAggregator.exchangeAdapters) {
          expect(adapter.stopCollectingTrades).not.toHaveBeenCalled()
        }
      })
    })
  })

  describe('fetchAllTickers()', () => {
    beforeAll(() => {
      aggregationMethod = AggregationMethod.MIDPRICES
      exchanges = [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX]
      setupDataAggregatorWithCurrentConfig()
      // 'exchangeName' is undefined because the exchange adapters are mocks,
      // so we set them here when they are needed
      for (let i = 0; i < exchanges.length; i++) {
        const exchangeAdapter = dataAggregator.exchangeAdapters[i]
        const exchange = exchanges[i]
        Object.defineProperty(exchangeAdapter, 'exchangeName', {
          get: () => exchange,
        })
      }
    })

    it('gives ticker data from all exchanges when all succeed', async () => {
      const exchangeAdapterSpies: { [key: string]: jest.SpyInstance } = {}
      for (const exchangeAdapter of dataAggregator.exchangeAdapters) {
        exchangeAdapterSpies[exchangeAdapter.exchangeName] = jest
          .spyOn(exchangeAdapter, 'fetchTicker')
          .mockImplementation(async () => generateGoodTicker(exchangeAdapter.exchangeName))
      }
      const allTickers = await dataAggregator.fetchAllTickers()
      expect(allTickers.length).toBe(dataAggregator.exchangeAdapters.length)
      // Ensure each fetchTicker was called
      for (const exchangeAdapter of dataAggregator.exchangeAdapters) {
        expect(exchangeAdapterSpies[exchangeAdapter.exchangeName]).toHaveBeenCalledTimes(1)
      }
      // Ensure ticker metrics are collected
      for (const ticker of allTickers) {
        expect(metricCollector.ticker).toBeCalledWith(ticker)
      }
      expect(metricCollector.error).not.toBeCalled()
    })

    it('gives ticker data only from exchanges whose API call succeeded', async () => {
      // Test when only Coinbase is successful
      const successfulExchange = Exchange.COINBASE
      const exchangeAdapterSpies: { [key: string]: jest.SpyInstance } = {}
      for (const exchangeAdapter of dataAggregator.exchangeAdapters) {
        let fetchTickerImplementation: () => Promise<Ticker>
        if (exchangeAdapter.exchangeName === successfulExchange) {
          fetchTickerImplementation = async () => generateGoodTicker(exchangeAdapter.exchangeName)
        } else {
          fetchTickerImplementation = async () => {
            throw Error('foo')
          }
        }
        exchangeAdapterSpies[exchangeAdapter.exchangeName] = jest
          .spyOn(exchangeAdapter, 'fetchTicker')
          .mockImplementation(fetchTickerImplementation)
      }
      const allTickers = await dataAggregator.fetchAllTickers()
      expect(allTickers.length).toBe(1)
      expect(allTickers[0].source).toBe(successfulExchange)
      // Ensure each fetchTicker was called
      for (const ticker of allTickers) {
        expect(exchangeAdapterSpies[ticker.source]).toHaveBeenCalledTimes(1)
      }
      // Ensure ticker metrics are collected
      for (const ticker of allTickers) {
        expect(metricCollector.ticker).toBeCalledWith(ticker)
      }
      for (const exchangeAdapter of dataAggregator.exchangeAdapters) {
        if (exchangeAdapter.exchangeName !== successfulExchange) {
          expect(metricCollector.error).toBeCalledWith(exchangeAdapter.exchangeName)
        }
      }
    })

    it('rejects when all exchanges reject', async () => {
      const exchangeAdapterSpies: { [key: string]: jest.SpyInstance } = {}
      for (const exchangeAdapter of dataAggregator.exchangeAdapters) {
        exchangeAdapterSpies[exchangeAdapter.exchangeName] = jest
          .spyOn(exchangeAdapter, 'fetchTicker')
          .mockImplementation(async () => {
            throw Error('foo')
          })
      }
      await expect(dataAggregator.fetchAllTickers()).rejects.toThrow('All ticker requests failed')
      // Ensure each fetchTicker was called
      for (const exchangeAdapter of Array.from(dataAggregator.exchangeAdapters)) {
        expect(exchangeAdapterSpies[exchangeAdapter.exchangeName]).toHaveBeenCalledTimes(1)
      }
      // Ensure ticker metrics was not called
      expect(metricCollector.ticker).not.toBeCalled()
      for (const exchangeAdapter of Array.from(dataAggregator.exchangeAdapters)) {
        expect(metricCollector.error).toBeCalledWith(exchangeAdapter.exchangeName)
      }
    })
  })
})
