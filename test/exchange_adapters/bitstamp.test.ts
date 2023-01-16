import { BitstampAdapter } from '../../src/exchange_adapters/bitstamp'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { baseLogger } from '../../src/default_config'
import { Exchange, ExternalCurrency } from '../../src/utils'
import BigNumber from 'bignumber.js'

describe('Bitstamp adapter', () => {
  let bitstampAdapter: BitstampAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.USDC,
    baseLogger,
    quoteCurrency: ExternalCurrency.USD,
  }

  beforeEach(() => {
    bitstampAdapter = new BitstampAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = {
    timestamp: '0',
    open: '1.00083',
    high: '1.00100',
    low: '0.99865',
    last: '1.00031',
    volume: '949324.40769',
    vwap: '1.00013',
    bid: '1.00005',
    ask: '1.00031',
    open_24: '0.99961',
    percent_change_24: '0.07',
  }

  const inValidMockTickerJson = {
    open: '',
    high: '',
    low: '',
    last: '',
    volume: '',
    vwap: '',
    ask: '',
    open_24: '',
    percent_change_24: '',
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = bitstampAdapter.parseTicker(validMockTickerJson)
      expect(ticker).toEqual({
        source: Exchange.BITSTAMP,
        symbol: bitstampAdapter.standardPairSymbol,
        ask: new BigNumber(1.00031),
        baseVolume: new BigNumber(949324.40769),
        bid: new BigNumber(1.00005),
        high: new BigNumber(1.001),
        lastPrice: new BigNumber(1.00031),
        low: new BigNumber(0.99865),
        open: new BigNumber(0.99961),
        quoteVolume: new BigNumber(949324.40769).multipliedBy(new BigNumber(1.00013)),
        timestamp: 0,
      })
    })

    it('throws an error when a json field mapped to a required ticker field is missing or empty', () => {
      expect(() => {
        bitstampAdapter.parseTicker(inValidMockTickerJson)
      }).toThrowError('bid, ask, lastPrice, baseVolume not defined')
    })
  })

  describe('fetchTrades', () => {
    it('returns empty array', async () => {
      expect(await bitstampAdapter.fetchTrades()).toEqual([])
    })
  })

  describe('isOrderbookLive', () => {
    it("returns true'", async () => {
      expect(await bitstampAdapter.isOrderbookLive()).toEqual(true)
    })
  })
})
