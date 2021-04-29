import { ExchangeAdapter, Ticker, Trade } from '../src/exchange_adapters/base'
import BigNumber from 'bignumber.js'
import { Exchange } from '../src/utils'
import {
  MultiPairExchangePriceSource,
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

describe('implicitPair', () => {
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

  describe('singlePair', () => {
    it('calculates implied pair', () => {
      const implied = impliedPair([testPair1])
      expect(implied).toEqual(testPair1)
    })
  })

  describe('twoPairs', () => {
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

  describe('middleConstrained', () => {
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

describe('MultiPairExchangePriceSource', () => {
  const metricCollector = new MetricCollector(baseLogger)

  function sourceFromTickers(tickers: Ticker[]): MultiPairExchangePriceSource {
    const adapters = tickers.map(
      (ticker: Ticker): OrientedAdapter => [new MockAdapter(ticker), false]
    )
    return new MultiPairExchangePriceSource(adapters, new BigNumber(0.2), metricCollector)
  }

  const goodTicker: Ticker = {
    bid: new BigNumber(9.99),
    ask: new BigNumber(10.01),
    source: Exchange.BINANCE,
    symbol: 'CELOUSD',
    baseVolume: new BigNumber(100),
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
