import BigNumber from 'bignumber.js'
import { baseLogger } from '../../src/default_config'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { GeminiAdapter } from '../../src/exchange_adapters/gemini'
import { Exchange, ExternalCurrency } from '../../src/utils'

describe('GeminiAdapter', () => {
  let geminiAdapter: GeminiAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.BTC,
    baseLogger,
    quoteCurrency: ExternalCurrency.USD,
  }
  beforeEach(() => {
    geminiAdapter = new GeminiAdapter(config)
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const mockPubtickerJson = {
    ask: '9347.67',
    bid: '9345.70',
    last: '9346.20',
    volume: {
      BTC: '2210.50',
      USD: '2135477.46',
      timestamp: 1483018200000,
    },
  }

  describe('fetchTrades', () => {
    it('returns an empty array', async () => {
      const tradesFetched = await geminiAdapter.fetchTrades()
      expect(tradesFetched).toEqual([])
    })
  })

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = geminiAdapter.parseTicker(mockPubtickerJson)
      expect(ticker).toEqual({
        source: Exchange.GEMINI,
        symbol: geminiAdapter.standardPairSymbol,
        ask: new BigNumber(9347.67),
        baseVolume: new BigNumber(2210.5),
        bid: new BigNumber(9345.7),
        lastPrice: new BigNumber(9346.2),
        quoteVolume: new BigNumber(2135477.46),
        timestamp: 1483018200000,
      })
    })

    it('throws an error when a json field mapped to a required ticker field is missing', () => {
      expect(() => {
        geminiAdapter.parseTicker({
          ...mockPubtickerJson,
          volume: undefined,
          last: undefined,
          ask: undefined,
          bid: undefined,
        })
      }).toThrowError('timestamp, bid, ask, lastPrice, baseVolume not defined')
    })
  })

  describe('isOrderbookLive', () => {
    it('returns true', async () => {
      expect(await geminiAdapter.isOrderbookLive()).toEqual(true)
    })
  })
})
