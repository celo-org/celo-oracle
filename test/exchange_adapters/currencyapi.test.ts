import { Exchange, ExternalCurrency } from '../../src/utils'

import BigNumber from 'bignumber.js'
import { CurrencyApiAdapter } from '../../src/exchange_adapters/currencyapi'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { baseLogger } from '../../src/default_config'

describe('CurrencyApi adapter', () => {
  let adapter: CurrencyApiAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.EUR,
    baseLogger,
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
    meta: {
      last_updated_at: '2023-09-08T10:26:59Z',
    },
    data: {
      XOF: {
        code: 'XOF',
        value: 655.9185006503,
      },
    },
  }

  const invalidJsonWithNoQuoteCurrency = {
    ...validMockTickerJson,
    data: {
      USD: {
        code: 'USD',
        value: 1.0,
      },
    },
  }

  const invalidJsonWithNoTimestamp = {
    ...validMockTickerJson,
    meta: {
      last_updated_at: undefined,
    },
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = adapter.parseTicker(validMockTickerJson)

      expect(ticker).toEqual({
        source: Exchange.CURRENCYAPI,
        symbol: adapter.standardPairSymbol,
        ask: new BigNumber(655.9185006503),
        bid: new BigNumber(655.9185006503),
        lastPrice: new BigNumber(655.9185006503),
        timestamp: 1694168819,
        baseVolume: new BigNumber(1),
        quoteVolume: new BigNumber(655.9185006503),
      })
    })

    it('throws an error when the quote currency is not in the response', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithNoQuoteCurrency)
      }).toThrowError('CurrencyApi response does not contain quote currency')
    })

    it('throws an error when the timestamp is not in the response', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithNoTimestamp as any)
      }).toThrowError('CurrencyApi response does not contain timestamp')
    })
  })
})
