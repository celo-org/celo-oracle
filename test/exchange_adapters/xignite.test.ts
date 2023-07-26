import { Exchange, ExternalCurrency } from '../../src/utils'

import BigNumber from 'bignumber.js'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { XigniteAdapter } from '../../src/exchange_adapters/xignite'
import { baseLogger } from '../../src/default_config'

describe('Xignite adapter', () => {
  let adapter: XigniteAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.XOF,
    baseLogger,
    quoteCurrency: ExternalCurrency.EUR,
  }

  beforeEach(() => {
    adapter = new XigniteAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = {
    "Spread": 0.000001459666,
    "Ask": 0.001525165286,
    "Mid": 0.001524435453,
    "Bid": 0.00152370562,
    "Delay": 0.0570077,
    "Outcome": "Success",
    "Source": "Rates calculated by crossing via ZAR(Morningstar,SwissQuote).",
    "Text": "1 West African CFA franc = 0.001524435453 European Union euro",
    "QuoteType": "Calculated",
    "Time": "2:36:48 PM",
    "Date": "07/26/2023",
    "Symbol": "XOFEUR",
    "QuoteCurrency": "EUR",
    "BaseCurrency": "XOF",
    "Identity": "Request",
    "Message": null
  } 

  const invalidJsonWithBaseCurrencyMissmatch = {
    ...validMockTickerJson,
    "BaseCurrency": "USD",
  }

  const invalidJsonWithQuoteCurrencyMissmatch = {
    ...validMockTickerJson,
    "QuoteCurrency": "USD",
  }

  const invalidJsonWithMissingFields = {
    "Spread": 0.000001459666,
    "Mid": 0.001524435453,
    "Delay": 0.0570077,
    "Time": "2:36:48 PM",
    "Date": "07/26/2023",
    "Symbol": "XOFEUR",
    "QuoteCurrency": "EUR",
    "BaseCurrency": "XOF",
  } 

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = adapter.parseTicker(validMockTickerJson)

      expect(ticker).toEqual({
        source: Exchange.XIGNITE,
        symbol: adapter.standardPairSymbol,
        ask: new BigNumber(0.001525165286),
        bid: new BigNumber(0.00152370562),
        lastPrice: new BigNumber(0.001524435453),
        baseVolume: new BigNumber(1),
        quoteVolume: new BigNumber(1),
        timestamp: 0
      })
    })

    it('throws an error when the base currency does not match', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithBaseCurrencyMissmatch)
      }).toThrowError('Base currency mismatch in response: USD != XOF')
    })

    it('throws an error when the quote currency does not match', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithQuoteCurrencyMissmatch)
      }).toThrowError('Quote currency mismatch in response: USD != EUR')
    })

    it('throws an error when some required fields are missing', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithMissingFields)
      }).toThrowError('bid, ask not defined')
    })
  })

  describe('isOrderbookLive', () => {
    it('returns true', async () => {
      expect(await adapter.isOrderbookLive()).toEqual(true)
    })
  })
})
