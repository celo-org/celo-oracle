import { ExchangeAdapter, Ticker, Trade } from '../src/exchange_adapters/base'
import BigNumber from 'bignumber.js'
import { Exchange } from '../src/utils'
import {
  ExchangePriceSource,
  OrientedAdapter,
  PairData,
  impliedPair,
} from '../src/exchange_price_source'
import { baseLogger } from '../src/default_config'
import { MetricCollector } from '../src/metric_collector'

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

  async fetchTrades(): Promise<Trade[]> {
    // Trades are not used.
    return [] as Trade[]
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
  })

  describe('middle pair constraining', () => {
    const pairs: PairData[] = [testPair3, testPair1, testPair2]
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
})

describe('ExchangePriceSource', () => {
  const metricCollector = new MetricCollector(baseLogger)

  function sourceFromTickers(tickers: Ticker[]): ExchangePriceSource {
    const adapters = tickers.map(
      (ticker: Ticker): OrientedAdapter => ({ adapter: new MockAdapter(ticker), toInvert: false })
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
