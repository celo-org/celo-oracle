import { Exchange, ExternalCurrency } from '../../src/utils'

import BigNumber from 'bignumber.js'
import { CurrencyApiAdapter } from '../../src/exchange_adapters/currencyapi'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { baseLogger } from '../../src/default_config'
import { CertificateManager } from '../../src/certs_manager'

describe('CurrencyApi adapter', () => {
  let adapter: CurrencyApiAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.EUR,
    baseLogger,
    certificateManager: new CertificateManager(baseLogger, ''),
    quoteCurrency: ExternalCurrency.XOF,
  }

  beforeEach(() => {
    adapter = new CurrencyApiAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = {
    valid: true,
    updated: 1695168063,
    conversion: {
      amount: 1,
      from: 'EUR',
      to: 'XOF',
      result: 655.315694,
    },
  }

  const invalidJsonWithFalseValid = {
    ...validMockTickerJson,
    valid: false,
  }

  const invalidJsonWithAmountNotOne = {
    ...validMockTickerJson,
    conversion: {
      ...validMockTickerJson.conversion,
      amount: 2,
    },
  }

  const invalidJsonWithInvalidFrom = {
    ...validMockTickerJson,
    conversion: {
      ...validMockTickerJson.conversion,
      from: 'USD',
    },
  }

  const invalidJsonWithInvalidTo = {
    ...validMockTickerJson,
    conversion: {
      ...validMockTickerJson.conversion,
      to: 'USD',
    },
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = adapter.parseTicker(validMockTickerJson)

      expect(ticker).toEqual({
        source: Exchange.CURRENCYAPI,
        symbol: adapter.standardPairSymbol,
        ask: new BigNumber(655.315694),
        bid: new BigNumber(655.315694),
        lastPrice: new BigNumber(655.315694),
        timestamp: 1695168063,
        baseVolume: new BigNumber(1),
        quoteVolume: new BigNumber(655.315694),
      })
    })

    it('throws an error when the valid field in the response is false', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithFalseValid)
      }).toThrowError('CurrencyApi response object contains false valid field')
    })

    it('throws an error when the amount in the response is not 1', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithAmountNotOne)
      }).toThrowError('CurrencyApi response object amount field is not 1')
    })

    it('throws an error when the from field in the response is not the base currency', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithInvalidFrom)
      }).toThrowError('CurrencyApi response object from field does not match base currency')
    })

    it('throws an error when the to field in the response is not the quote currency', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithInvalidTo)
      }).toThrowError('CurrencyApi response object to field does not match quote currency')
    })
  })
})
