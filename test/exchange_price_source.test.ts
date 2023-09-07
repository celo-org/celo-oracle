import { ExchangeAdapter, Ticker } from '../src/exchange_adapters/base'
import {
  ExchangePriceSource,
  OrientedAdapter,
  PairData,
  impliedPair,
} from '../src/exchange_price_source'

import BigNumber from 'bignumber.js'
import { Exchange } from '../src/utils'
import { MetricCollector } from '../src/metric_collector'
import { baseLogger } from '../src/default_config'

jest.mock('../src/metric_collector')

class MockAdapter implements ExchangeAdapter {
  ticker: Ticker
  pairSymbol: string
  exchangeName: Exchange

  constructor(ticker: Ticker) {
    this.ticker = ticker
    this.pairSymbol = ticker.symbol
    this.exchangeName = ticker.source
  }

  async fetchTicker(): Promise<Ticker> {
    return this.ticker
  }
}

describe('impliedPair()', () => {
  const testPair1: PairData = {
    bid: new BigNumber(10.0),
    ask: new BigNumber(10.01),
    baseVolume: new BigNumber(10),
    quoteVolume: new BigNumber(10),
  }
  const testPair2: PairData = {
    bid: new BigNumber(2.0),
    ask: new BigNumber(3.0),
    baseVolume: new BigNumber(100),
    quoteVolume: new BigNumber(100),
  }
  const testPair3: PairData = {
    bid: new BigNumber(1.0),
    ask: new BigNumber(1.0),
    baseVolume: new BigNumber(100000),
    quoteVolume: new BigNumber(100000),
  }
  const testCELOEUR: PairData = {
    bid: new BigNumber(4.2),
    ask: new BigNumber(4.21),
    baseVolume: new BigNumber(5000),
    quoteVolume: new BigNumber(21000),
  }
  const testEURUSD: PairData = {
    bid: new BigNumber(1.21),
    ask: new BigNumber(1.22),
    baseVolume: new BigNumber(10000),
    quoteVolume: new BigNumber(12100),
  }

  const testCELOBTC: PairData = {
    bid: new BigNumber(0.00009877),
    ask: new BigNumber(0.00009896),
    baseVolume: new BigNumber(626670.7),
    quoteVolume: new BigNumber(62.5492893),
  }

  const testBTCUSD: PairData = {
    bid: new BigNumber(35454.22),
    ask: new BigNumber(35491.83),
    baseVolume: new BigNumber(9.90406756),
    quoteVolume: new BigNumber(343601.1800347895),
  }

  describe('single pair', () => {
    it('calculates implied pair', () => {
      const implied = impliedPair([testPair1])
      expect(implied).toEqual(testPair1)
    })
  })

  describe('two pairs', () => {
    describe('test pairs', () => {
      const pairs: PairData[] = [testPair1, testPair2]
      it('calculates implied pair', () => {
        const implied = impliedPair(pairs)
        expect(implied).toEqual({
          bid: new BigNumber(20.0),
          ask: new BigNumber(30.03),
          baseVolume: new BigNumber(10),
          quoteVolume: new BigNumber(10),
        })
      })
    })

    describe('CELO/USD via EUR', () => {
      const pairs: PairData[] = [testCELOEUR, testEURUSD]
      it('calculates implied pair', () => {
        const implied = impliedPair(pairs)
        expect(implied.bid.precision(5)).toEqual(new BigNumber(5.082))
        expect(implied.ask.precision(5)).toEqual(new BigNumber(5.1362))
        expect(implied.baseVolume.precision(9)).toEqual(new BigNumber(2380.95238))
        expect(implied.quoteVolume.precision(9)).toEqual(new BigNumber(12100))
      })
    })

    describe('CELO/USD via BTC', () => {
      const pairs: PairData[] = [testCELOBTC, testBTCUSD]
      it('calculates implied pair', () => {
        const implied = impliedPair(pairs)
        expect(implied.bid.precision(5)).toEqual(new BigNumber(3.5018))
        expect(implied.ask.precision(5)).toEqual(new BigNumber(3.5123))
        expect(implied.baseVolume.precision(9)).toEqual(new BigNumber(99227.1698))
        expect(implied.quoteVolume.precision(9)).toEqual(new BigNumber(343601.18))
      })
    })
  })

  describe('volume constraints', () => {
    it('correctly caps the volume of the implied pair to the smallest overall', () => {
      const pairs: PairData[] = [testPair3, testPair1, testPair2]
      const implied = impliedPair(pairs)
      expect(implied).toEqual({
        bid: new BigNumber(20.0),
        ask: new BigNumber(30.03),
        baseVolume: new BigNumber(10),
        quoteVolume: new BigNumber(10),
      })
    })

    it('correctly caps the volume of the implied pair to the smallest with ignoreVolume=false', () => {
      const pairs: PairData[] = [testPair3, { ...testPair1, ignoreVolume: true }, testPair2]
      const implied = impliedPair(pairs)
      expect(implied).toEqual({
        bid: new BigNumber(20.0),
        ask: new BigNumber(30.03),
        baseVolume: new BigNumber(100),
        quoteVolume: new BigNumber(100),
      })
    })

    it('ignores volume data from pairs with ignoreVolume=true', () => {
      const p1: PairData = {
        bid: new BigNumber(0.00001638),
        ask: new BigNumber(0.00001642),
        baseVolume: new BigNumber(11520.69),
        quoteVolume: new BigNumber(0.1881328677),
      }
      const p2: PairData = {
        bid: new BigNumber(25236.28),
        ask: new BigNumber(25236.29),
        baseVolume: new BigNumber(990.60368),
        quoteVolume: new BigNumber(24999151.8375104),
      }
      const p3: PairData = {
        bid: new BigNumber(1.088705),
        ask: new BigNumber(1.088785),
        baseVolume: new BigNumber(1),
        quoteVolume: new BigNumber(1.08874),
        ignoreVolume: true,
      }

      const implied = impliedPair([p1, p2, p3])
      expect(implied.bid).toEqual(new BigNumber(0.450038275881012))
      expect(implied.ask).toEqual(new BigNumber(0.451170599605613))

      // base volumes after conversion
      // [11520.69, 60661584.8132271892222902590969984, 2.4265457167313368034292711109654493463624]
      // quote volumes after conversion
      // [5169.09116696800504344, 27217576.571571072896, 1.08874]
      expect(implied.baseVolume).toEqual(new BigNumber(11520.69))
      expect(implied.quoteVolume.precision(9)).toEqual(new BigNumber(5169.09117))
    })
  })
})

describe('ExchangePriceSource', () => {
  const metricCollector = new MetricCollector(baseLogger)

  function sourceFromTickers(tickers: Ticker[]): ExchangePriceSource {
    const adapters = tickers.map(
      (ticker: Ticker): OrientedAdapter => ({
        adapter: new MockAdapter(ticker),
        toInvert: false,
        ignoreVolume: false,
      })
    )
    return new ExchangePriceSource(adapters, new BigNumber(0.2), metricCollector)
  }

  const goodTicker: Ticker = {
    bid: new BigNumber(9.99),
    ask: new BigNumber(10.01),
    source: Exchange.BINANCE,
    symbol: 'CELOUSD',
    baseVolume: new BigNumber(100),
    quoteVolume: new BigNumber(100),
    lastPrice: new BigNumber(10),
    timestamp: 100000,
  }

  // Invalid, as bid > ask.
  const invalidTicker: Ticker = {
    bid: new BigNumber(10.01),
    ask: new BigNumber(9.99),
    source: Exchange.BITTREX,
    symbol: 'CELOEUR',
    baseVolume: new BigNumber(100),
    quoteVolume: new BigNumber(100),
    lastPrice: new BigNumber(10),
    timestamp: 100000,
  }

  describe('name()', () => {
    it('renders the name for a single adapter', () => {
      const priceSource = sourceFromTickers([goodTicker])
      expect(priceSource.name()).toEqual('BINANCE:CELOUSD:false')
    })

    it('renders the name for multiple adapters', () => {
      const priceSource = sourceFromTickers([goodTicker, invalidTicker])
      expect(priceSource.name()).toEqual('BINANCE:CELOUSD:false|BITTREX:CELOEUR:false')
    })
  })

  describe('fetchWeightedPrice()', () => {
    it('fetches the price', async () => {
      const ticker = goodTicker
      const priceSource = sourceFromTickers([ticker])
      const weightedPrice = await priceSource.fetchWeightedPrice()
      expect(weightedPrice).toEqual({
        price: ticker.bid.plus(ticker.ask).dividedBy(2),
        weight: ticker.baseVolume,
      })
      expect(metricCollector.ticker).toBeCalledWith(ticker)
    })

    it('throws if a ticker is invalid', async () => {
      const priceSource = sourceFromTickers([goodTicker, invalidTicker])
      await expect(priceSource.fetchWeightedPrice()).rejects.toThrow()
    })
  })
})
