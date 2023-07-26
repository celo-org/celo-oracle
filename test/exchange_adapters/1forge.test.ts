import { Exchange, ExternalCurrency } from '../../src/utils'

import BigNumber from 'bignumber.js'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { OneforgeAdapter } from '../../src/exchange_adapters/1forge'
import { baseLogger } from '../../src/default_config'

describe('1forge adapter', () => {
  let adapter: OneforgeAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.XOF,
    baseLogger,
    quoteCurrency: ExternalCurrency.USD,
  }

  beforeEach(() => {
    adapter = new OneforgeAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = [
    {
      "p": 0.00165,
      "a": 0.00169,
      "b": 0.0016887,
      "s": "XOF/USD",
      "t": 1690370344479
    }
  ]

  const invalidJsonWithMultipleObjects = [
    validMockTickerJson[0],
    validMockTickerJson[0]
  ]

  const invalidJsonWithMissingFields = [
    {
      "p": 0.00165,
      // "a": 0.00169,
      // "b": 0.0016887,
      "s": "XOF/USD",
      // "t": 1690370344479
    }
  ]
  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = adapter.parseTicker(validMockTickerJson)

      expect(ticker).toEqual({
        source: Exchange.ONEFORGE,
        symbol: adapter.standardPairSymbol,
        ask: new BigNumber(0.00169),
        bid: new BigNumber(0.0016887),
        lastPrice: new BigNumber(0.00165),
        baseVolume: new BigNumber(1),
        quoteVolume: new BigNumber(1),
        timestamp: 1690370344479,
      })
    })

    it('throws an error when the response contains more than one object', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithMultipleObjects)
      }).toThrowError('Ticker response returned more than one object: 2')
    })

    it('throws an error when some required fields are missing', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithMissingFields)
      }).toThrowError('timestamp, bid, ask not defined')
    })
  })

  describe('isOrderbookLive', () => {
    it('returns true', async () => {
      expect(await adapter.isOrderbookLive()).toEqual(true)
    })
  })
})
