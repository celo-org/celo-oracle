import { Exchange, ExternalCurrency } from '../../src/utils'

import BigNumber from 'bignumber.js'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { OpenexchangeratesAdapter } from '../../src/exchange_adapters/openexchangerates'
import { baseLogger } from '../../src/default_config'

describe('Xignite adapter', () => {
  let adapter: OpenexchangeratesAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.XOF,
    baseLogger,
    quoteCurrency: ExternalCurrency.EUR,
  }

  beforeEach(() => {
    adapter = new OpenexchangeratesAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = {
    "disclaimer": "Usage subject to terms: https://openexchangerates.org/terms",
    "license": "https://openexchangerates.org/license",
    "timestamp": 1690380000,
    "base": "XOF",
    "rates": {
      "EUR": 0.001524
    }
  }

  const invalidJsonWithBaseCurrencyMissmatch = {
    ...validMockTickerJson,
    "base": "USD",
  }

  const invalidJsonWithoutQuoteInRate = {
    "base": "XOF",
    "rates": {
      "USD": 0.001524
    }
  }

  const invalidJsonWithMissingFields = {
    //"timestamp": 1690380000,
    "base": "XOF",
    "rates": {
      "EUR": 0.001524
    }
  } 

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = adapter.parseTicker(validMockTickerJson)

      expect(ticker).toEqual({
        source: Exchange.OPENEXCHANGERATES,
        symbol: adapter.standardPairSymbol,
        ask: new BigNumber(0.001524),
        bid: new BigNumber(0.001524),
        lastPrice: new BigNumber(0.001524),
        baseVolume: new BigNumber(1),
        quoteVolume: new BigNumber(1),
        timestamp: 1690380000
      })
    })

    it('throws an error when the base currency does not match', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithBaseCurrencyMissmatch)
      }).toThrowError('Base currency mismatch in response: USD != XOF')
    })

    it('throws an error when the quote currency is not in resposne', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithoutQuoteInRate)
      }).toThrowError('Quote currency not found inside of rates')
    })

    it('throws an error when some required fields are missing', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithMissingFields)
      }).toThrowError('timestamp not defined')
    })
  })

  describe('isOrderbookLive', () => {
    it('returns true', async () => {
      expect(await adapter.isOrderbookLive()).toEqual(true)
    })
  })
})
