import { Exchange, ExternalCurrency } from '../../src/utils'

import { AlphavantageAdapter } from '../../src/exchange_adapters/alphavantage'
import BigNumber from 'bignumber.js'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { baseLogger } from '../../src/default_config'

describe('Alphavantage adapter', () => {
  let adapter: AlphavantageAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.XOF,
    baseLogger,
    quoteCurrency: ExternalCurrency.EUR,
  }

  beforeEach(() => {
    adapter = new AlphavantageAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = {
    'Realtime Currency Exchange Rate': {
      '1. From_Currency Code': 'XOF',
      '2. From_Currency Name': 'CFA Franc BCEAO',
      '3. To_Currency Code': 'EUR',
      '4. To_Currency Name': 'Euro',
      '5. Exchange Rate': '0.00152950',
      '6. Last Refreshed': '2023-08-03 08:13:36',
      '7. Time Zone': 'UTC',
      '8. Bid Price': '0.00152900',
      '9. Ask Price': '0.00153000',
    },
  }

  const invalidJsonWithFromCurrencyMissmatch = {
    ...validMockTickerJson,
    'Realtime Currency Exchange Rate': {
      ...validMockTickerJson['Realtime Currency Exchange Rate'],
      '1. From_Currency Code': 'USD',
    },
  }

  const invalidJsonWithToCurrencyMissmatch = {
    ...validMockTickerJson,
    'Realtime Currency Exchange Rate': {
      ...validMockTickerJson['Realtime Currency Exchange Rate'],
      '3. To_Currency Code': 'USD',
    },
  }

  const invalidJsonWithNonUtcTimezone = {
    ...validMockTickerJson,
    'Realtime Currency Exchange Rate': {
      ...validMockTickerJson['Realtime Currency Exchange Rate'],
      '7. Time Zone': 'CET',
    },
  }

  const invalidJsonWithMissingFields = {
    'Realtime Currency Exchange Rate': {
      '1. From_Currency Code': 'XOF',
      '2. From_Currency Name': 'CFA Franc BCEAO',
      '3. To_Currency Code': 'EUR',
      '4. To_Currency Name': 'Euro',
      '5. Exchange Rate': '0.00152950',
      '6. Last Refreshed': '2023-08-03 08:13:36',
      '7. Time Zone': 'UTC',
    },
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = adapter.parseTicker(validMockTickerJson)

      expect(ticker).toEqual({
        source: Exchange.ALPHAVANTAGE,
        symbol: adapter.standardPairSymbol,
        ask: new BigNumber(0.00153),
        bid: new BigNumber(0.001529),
        lastPrice: new BigNumber(0.0015295),
        timestamp: 1691050416,
        baseVolume: new BigNumber(1),
        quoteVolume: new BigNumber(0.0015295),
      })
    })

    it('throws an error when the from currency does not match the base currency', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithFromCurrencyMissmatch)
      }).toThrowError('From currency mismatch in response: USD != XOF')
    })

    it('throws an error when the quote currency does not match', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithToCurrencyMissmatch)
      }).toThrowError('To currency mismatch in response: USD != EUR')
    })

    it('throws an error when the timezone is non UTC', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithNonUtcTimezone)
      }).toThrowError('Timezone mismatch in response: CET != UTC')
    })

    it('throws an error when some required fields are missing', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithMissingFields as any)
      }).toThrowError('bid, ask not defined')
    })
  })
})
