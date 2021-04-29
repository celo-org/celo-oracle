import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import * as aggregators from '../src/aggregator_functions'
import { DataAggregator } from '../src/data_aggregator'
import { baseLogger } from '../src/default_config'
import { Ticker } from '../src/exchange_adapters/base'
import { BinanceAdapter } from '../src/exchange_adapters/binance'
import { BittrexAdapter } from '../src/exchange_adapters/bittrex'
import { CoinbaseAdapter } from '../src/exchange_adapters/coinbase'
import { OKCoinAdapter } from '../src/exchange_adapters/okcoin'
import { MetricCollector } from '../src/metric_collector'
import {
  AggregationMethod,
  Exchange,
  ExternalCurrency,
  minutesToMs,
  OracleCurrencyPair,
  secondsToMs,
} from '../src/utils'
import { generateGoodTicker, testTickerArray } from './data_aggregator_testdata_utils'

jest.mock('../src/metric_collector')

jest.mock('../src/exchange_adapters/binance')
jest.mock('../src/exchange_adapters/bittrex')
jest.mock('../src/exchange_adapters/coinbase')
jest.mock('../src/exchange_adapters/okcoin')

describe('DataAggregator', () => {
  const aggregationWindowDuration = minutesToMs(6)
  const apiRequestTimeout = secondsToMs(5)
  const maxNoTradeDuration = secondsToMs(10)
  const metricCollector = new MetricCollector(baseLogger)

  let currencyPair = OracleCurrencyPair.CELOUSD
  let minExchangeCount = 1
  const minAggregatedVolume = new BigNumber(1000)

  let dataAggregator: DataAggregator

  let aggregationMethod = AggregationMethod.MIDPRICES
  let testTickers: Ticker[]

  const askMaxPercentageDeviation = new BigNumber(0.2)
  const bidMaxPercentageDeviation = new BigNumber(0.2)
  const maxExchangeVolumeShare = new BigNumber(0.99)
  const maxPercentageBidAskSpread = new BigNumber(0.1)

  let exchanges: Exchange[] | undefined

  function resetDefaults() {
    exchanges = undefined
    minExchangeCount = 1
  }

  function setupDataAggregatorWithCurrentConfig(): void {
    dataAggregator = new DataAggregator({
      aggregationMethod,
      aggregationWindowDuration,
      apiRequestTimeout,
      askMaxPercentageDeviation,
      baseLogger,
      bidMaxPercentageDeviation,
      currencyPair,
      exchanges,
      maxExchangeVolumeShare,
      maxNoTradeDuration,
      maxPercentageBidAskSpread,
      metricCollector,
      minExchangeCount,
      minAggregatedVolume,
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
    const configsToTest: [OracleCurrencyPair, CeloContract, ExternalCurrency][] = [
      [OracleCurrencyPair.CELOUSD, CeloContract.GoldToken, ExternalCurrency.USD],
      [OracleCurrencyPair.CELOBTC, CeloContract.GoldToken, ExternalCurrency.BTC],
      [OracleCurrencyPair.CELOEUR, CeloContract.GoldToken, ExternalCurrency.EUR],
    ]
    for (const [currencyPairToTest, expectedBaseCurrency, expectedQuoteCurrency] of configsToTest) {
      describe(`for ${currencyPairToTest}`, () => {
        const expectedConfig = {
          apiRequestTimeout,
          baseCurrency: expectedBaseCurrency,
          baseLogger: expect.anything(),
          metricCollector: expect.anything(),
          quoteCurrency: expectedQuoteCurrency,
        }

        describe('when no adapters are specified in the config', () => {
          beforeEach(() => {
            exchanges = undefined
            currencyPair = currencyPairToTest
            setupDataAggregatorWithCurrentConfig()
          })

          it('initializes all possible exchange adapters', () => {
            expect(BinanceAdapter).toHaveBeenCalledWith(expectedConfig)
            expect(BittrexAdapter).toHaveBeenCalledWith(expectedConfig)
            expect(CoinbaseAdapter).toHaveBeenCalledWith(expectedConfig)
            expect(OKCoinAdapter).toHaveBeenCalledWith(expectedConfig)
          })

          it('adds the adapters to the set belonging to the aggregator', () => {
            expect(dataAggregator.exchangeAdapters.length).toEqual(4)
          })
        })

        describe('when a subset of adapters are specified', () => {
          beforeEach(() => {
            exchanges = [Exchange.BITTREX, Exchange.OKCOIN]
            currencyPair = currencyPairToTest
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
          currencyPair = currencyPairToTest
          setupDataAggregatorWithCurrentConfig()
          expect(BittrexAdapter).toHaveBeenCalledTimes(1)
          expect(dataAggregator.exchangeAdapters.length).toEqual(2)
        })
      })
    }
  })

  describe('fetchAllTickers()', () => {
    beforeAll(() => {
      aggregationMethod = AggregationMethod.MIDPRICES
      exchanges = [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX, Exchange.BINANCE]
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
