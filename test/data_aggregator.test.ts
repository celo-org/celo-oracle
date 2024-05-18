import * as aggregators from '../src/aggregator_functions'

import {
  AggregationMethod,
  Exchange,
  ExternalCurrency,
  OracleCurrencyPair,
  minutesToMs,
  secondsToMs,
} from '../src/utils'

import BigNumber from 'bignumber.js'
import { BittrexAdapter } from '../src/exchange_adapters/bittrex'
import { CeloContract } from '@celo/contractkit'
import { CoinbaseAdapter } from '../src/exchange_adapters/coinbase'
import { DataAggregator } from '../src/data_aggregator'
import { ExchangePriceSourceConfig } from '../src/exchange_price_source'
import { MetricCollector } from '../src/metric_collector'
import { OKCoinAdapter } from '../src/exchange_adapters/okcoin'
import { WeightedPrice } from '../src/price_source'
import { baseLogger } from '../src/default_config'

jest.mock('../src/metric_collector')

jest.mock('../src/exchange_adapters/binance')
jest.mock('../src/exchange_adapters/bittrex')
jest.mock('../src/exchange_adapters/coinbase')
jest.mock('../src/exchange_adapters/okcoin')
jest.mock('../src/exchange_adapters/bitso')
jest.mock('../src/certs_manager')

describe('DataAggregator', () => {
  const aggregationWindowDuration = minutesToMs(6)
  const apiRequestTimeout = secondsToMs(5)
  const metricCollector = new MetricCollector(baseLogger)

  const apiKeys: Partial<Record<Exchange, string>> = {
    BINANCE: 'mockBinanceApiKey',
    COINBASE: 'mockCoinbaseApiKey',
  }
  let currencyPair = OracleCurrencyPair.CELOUSD
  let minPriceSourceCount = 1
  const minAggregatedVolume = new BigNumber(1000)

  let dataAggregator: DataAggregator

  let aggregationMethod = AggregationMethod.MIDPRICES
  let testWeightedPrices: WeightedPrice[]

  const maxSourceWeightShare = new BigNumber(0.99)
  const maxPercentageBidAskSpread = new BigNumber(0.1)
  const maxPercentageDeviation = new BigNumber(0.2)

  let priceSourceConfigs: ExchangePriceSourceConfig[] | undefined
  const devMode = false

  function resetDefaults() {
    priceSourceConfigs = undefined
    minPriceSourceCount = 1
  }

  function setupDataAggregatorWithCurrentConfig(): void {
    dataAggregator = new DataAggregator({
      aggregationMethod,
      aggregationWindowDuration,
      apiKeys,
      apiRequestTimeout,
      baseLogger,
      certificateManagerSource: '',
      currencyPair,
      devMode,
      maxSourceWeightShare,
      maxPercentageBidAskSpread,
      maxPercentageDeviation,
      metricCollector,
      minPriceSourceCount,
      minAggregatedVolume,
      priceSourceConfigs,
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
        it('should throw if fetchAllPrices throws due to no successful tickers', async () => {
          for (const priceSource of Array.from(dataAggregator.priceSources)) {
            jest.spyOn(priceSource, 'fetchWeightedPrice').mockImplementation(async () => {
              throw Error('foo')
            })
          }
          await expect(async () => dataAggregator.currentPrice()).rejects.toThrow(
            'All price requests failed'
          )
        })

        it('should throw if fetchAllPrices throws for any reason', async () => {
          jest.spyOn(dataAggregator, 'fetchAllPrices').mockImplementation(async () => {
            throw Error('foo')
          })
          await expect(async () => dataAggregator.currentPrice()).rejects.toThrow('foo')
        })
      })

      describe('cross-checks for weighted prices', () => {
        beforeEach(() => {
          jest
            .spyOn(dataAggregator, 'fetchAllPrices')
            .mockImplementation(async () => Promise.resolve(testWeightedPrices))
        })

        it('prices should not deviate more than maxPercentageDeviation', () => {
          const prices: WeightedPrice[] = [
            { price: new BigNumber(0.7), weight: new BigNumber(1000) },
            { price: new BigNumber(1.0), weight: new BigNumber(1000) },
            { price: new BigNumber(1.3), weight: new BigNumber(1000) },
          ]
          expect(() => aggregators.crossCheckPriceData(prices, dataAggregator.config)).toThrow(
            'Max price cross-sectional deviation too large'
          )
        })

        it('no price source should have a total weight share bigger than maxSourceVolumeShare', () => {
          const prices: WeightedPrice[] = [
            { price: new BigNumber(10.0), weight: new BigNumber(1) },
            { price: new BigNumber(11.0), weight: new BigNumber(1000) },
          ]
          expect(() => aggregators.crossCheckPriceData(prices, dataAggregator.config)).toThrow(
            'The weight share of one source is too large'
          )
        })

        it('ticker with too low of volume throws', () => {
          dataAggregator.config.minAggregatedVolume = new BigNumber(5000)
          const prices: WeightedPrice[] = [
            { price: new BigNumber(10.0), weight: new BigNumber(2000) },
            { price: new BigNumber(11.0), weight: new BigNumber(2000) },
          ]
          expect(() => aggregators.crossCheckPriceData(prices, dataAggregator.config)).toThrow(
            `Aggregate volume 4000 is less than minimum threshold 5000`
          )
        })

        it('should fail if less than minPriceSourceCount are provided', () => {
          dataAggregator.config.minPriceSourceCount = 3
          const prices: WeightedPrice[] = [
            { price: new BigNumber(10.0), weight: new BigNumber(2000) },
            { price: new BigNumber(11.0), weight: new BigNumber(2000) },
          ]
          expect(() => aggregators.crossCheckPriceData(prices, dataAggregator.config)).toThrow(
            `The number of price sources available (2) is less than the minimum required (3)`
          )
        })
      })

      describe('price calculation', () => {
        beforeEach(() => {
          jest
            .spyOn(dataAggregator, 'fetchAllPrices')
            .mockImplementation(async () => Promise.resolve(testWeightedPrices))
        })

        it('weighted avg mid price should be 10.5 if all prices are 10.5', async () => {
          const prices: WeightedPrice[] = [
            { price: new BigNumber(10.5), weight: new BigNumber(1000) },
            { price: new BigNumber(10.5), weight: new BigNumber(1000) },
            { price: new BigNumber(10.5), weight: new BigNumber(1000) },
          ]
          testWeightedPrices = prices
          await expect(dataAggregator.currentPrice()).resolves.toStrictEqual(new BigNumber(10.5))
        })

        it('weighted avg price should be correctly calcuated if weights and prices differ', async () => {
          const prices: WeightedPrice[] = [
            { price: new BigNumber(2.0), weight: new BigNumber(100000) },
            { price: new BigNumber(2.1), weight: new BigNumber(60000) },
            { price: new BigNumber(2.15), weight: new BigNumber(40000) },
          ]
          testWeightedPrices = prices
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
          apiKey: undefined,
          apiRequestTimeout,
          baseCurrency: expectedBaseCurrency,
          baseLogger: expect.anything(),
          certificateManager: expect.anything(),
          metricCollector: expect.anything(),
          quoteCurrency: expectedQuoteCurrency,
        }

        describe('when a subset of adapters are specified', () => {
          beforeEach(() => {
            priceSourceConfigs = [
              {
                pairs: [
                  {
                    exchange: Exchange.BITTREX,
                    symbol: currencyPairToTest,
                    toInvert: false,
                    ignoreVolume: false,
                  },
                ],
              },
              {
                pairs: [
                  {
                    exchange: Exchange.OKCOIN,
                    symbol: currencyPairToTest,
                    toInvert: false,
                    ignoreVolume: false,
                  },
                ],
              },
            ]
            currencyPair = currencyPairToTest
            setupDataAggregatorWithCurrentConfig()
          })

          it('initializes only those adapters', () => {
            expect(BittrexAdapter).toHaveBeenCalledWith(expectedConfig)
            expect(OKCoinAdapter).toHaveBeenCalledWith(expectedConfig)

            expect(CoinbaseAdapter).not.toHaveBeenCalled()
          })
          it('adds only those price sources to the set', () => {
            expect(dataAggregator.priceSources.length).toEqual(2)
          })
        })

        describe('when the adapter has available api keys', () => {
          beforeEach(() => {
            priceSourceConfigs = [
              {
                pairs: [
                  {
                    exchange: Exchange.COINBASE,
                    symbol: currencyPairToTest,
                    toInvert: false,
                    ignoreVolume: false,
                  },
                ],
              },
            ]
            currencyPair = currencyPairToTest
            setupDataAggregatorWithCurrentConfig()
          })

          it('initializes the adapter with the api key', () => {
            expect(CoinbaseAdapter).toHaveBeenCalledWith({
              ...expectedConfig,
              apiKey: apiKeys.COINBASE,
            })
          })
        })
      })
    }
  })

  describe('fetchAllPrices()', () => {
    const goodWeightedPrice: WeightedPrice = {
      price: new BigNumber(1.07),
      weight: new BigNumber(1000),
    }

    beforeAll(() => {
      aggregationMethod = AggregationMethod.MIDPRICES
      priceSourceConfigs = [
        {
          pairs: [
            {
              exchange: Exchange.COINBASE,
              symbol: OracleCurrencyPair.CELOUSD,
              toInvert: false,
              ignoreVolume: false,
            },
          ],
        },
        {
          pairs: [
            {
              exchange: Exchange.OKCOIN,
              symbol: OracleCurrencyPair.CELOUSD,
              toInvert: false,
              ignoreVolume: false,
            },
          ],
        },
        {
          pairs: [
            {
              exchange: Exchange.BITTREX,
              symbol: OracleCurrencyPair.CELOUSD,
              toInvert: false,
              ignoreVolume: false,
            },
          ],
        },
        {
          pairs: [
            {
              exchange: Exchange.BINANCE,
              symbol: OracleCurrencyPair.CELOUSD,
              toInvert: false,
              ignoreVolume: false,
            },
          ],
        },
        {
          pairs: [
            {
              exchange: Exchange.BITSO,
              symbol: OracleCurrencyPair.CELOUSD,
              toInvert: false,
              ignoreVolume: false,
            },
          ],
        },
      ]
      setupDataAggregatorWithCurrentConfig()
    })

    it('gives price data from all sources when all succeed', async () => {
      const priceSourceSpies: jest.SpyInstance[] = []
      for (const priceSource of dataAggregator.priceSources) {
        priceSourceSpies.push(
          jest
            .spyOn(priceSource, 'fetchWeightedPrice')
            .mockImplementation(async () => goodWeightedPrice)
        )
      }
      const allPrices = await dataAggregator.fetchAllPrices()
      expect(allPrices.length).toBe(dataAggregator.priceSources.length)
      // Ensure each fetchWeightedPrice was called once.
      for (const spy of priceSourceSpies) {
        expect(spy).toHaveBeenCalledTimes(1)
      }
      // Ensure price source metrics are collected.
      for (const price of allPrices) {
        expect(metricCollector.priceSource).toBeCalledWith(
          expect.any(String),
          expect.any(String),
          price
        )
      }
      expect(metricCollector.error).not.toBeCalled()
    })

    it('gives price data only from sources whose calls succeeded', async () => {
      // Test when only a source is successful.
      const successfulPriceSource: number = 0
      const priceSourceSpies: jest.SpyInstance[] = []
      dataAggregator.priceSources.forEach((priceSource, i) => {
        let fetchWeightedPriceImplementation: () => Promise<WeightedPrice>
        if (i === successfulPriceSource) {
          fetchWeightedPriceImplementation = async () => goodWeightedPrice
        } else {
          fetchWeightedPriceImplementation = async () => {
            throw Error('foo')
          }
        }
        priceSourceSpies.push(
          jest
            .spyOn(priceSource, 'fetchWeightedPrice')
            .mockImplementation(fetchWeightedPriceImplementation)
        )
      })
      const allPrices = await dataAggregator.fetchAllPrices()
      expect(allPrices.length).toBe(1)
      // Ensure each fetchWeightedPrice was called.
      for (const spy of priceSourceSpies) {
        expect(spy).toHaveBeenCalledTimes(1)
      }
      // Ensure price source metrics are collected.
      for (const price of allPrices) {
        expect(metricCollector.priceSource).toBeCalledWith(
          expect.any(String),
          expect.any(String),
          price
        )
      }
      dataAggregator.priceSources.forEach((priceSource, i) => {
        if (i !== successfulPriceSource) {
          expect(metricCollector.error).toBeCalledWith(priceSource.name())
        }
      })
    })

    it('rejects when all sources reject', async () => {
      const priceSourceSpies: jest.SpyInstance[] = []
      for (const priceSource of dataAggregator.priceSources) {
        priceSourceSpies.push(
          jest.spyOn(priceSource, 'fetchWeightedPrice').mockImplementation(async () => {
            throw Error('foo')
          })
        )
      }
      await expect(dataAggregator.fetchAllPrices()).rejects.toThrow('All price requests failed')
      // Ensure each fetchWeightedPrice was called.
      for (const spy of priceSourceSpies) {
        expect(spy).toHaveBeenCalledTimes(1)
      }
      // Ensure price source metrics was not called.
      expect(metricCollector.priceSource).not.toBeCalled()
      // Ensure that errors were emitted for the failed price sources.
      for (const priceSource of Array.from(dataAggregator.priceSources)) {
        expect(metricCollector.error).toBeCalledWith(priceSource.name())
      }
    })
  })
})
