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
    "Realtime Currency Exchange Rate": {
        "1. From_Currency Code": "XOF",
        "2. From_Currency Name": "CFA Franc BCEAO",
        "3. To_Currency Code": "EUR",
        "4. To_Currency Name": "Euro",
        "5. Exchange Rate": "0.00152950",
        "6. Last Refreshed": "2023-08-03 08:13:36",
        "7. Time Zone": "UTC",
        "8. Bid Price": "0.00152900",
        "9. Ask Price": "0.00153000"
    }
  }

  const invalidJsonWithFromCurrencyMissmatch = {
    ...validMockTickerJson,
    "Realtime Currency Exchange Rate": {
      ...validMockTickerJson["Realtime Currency Exchange Rate"],
      "1. From_Currency Code": "USD",
    }
  }

  const invalidJsonWithToCurrencyMissmatch = {
    ...validMockTickerJson,
    "Realtime Currency Exchange Rate": {
      ...validMockTickerJson["Realtime Currency Exchange Rate"],
      "3. To_Currency Code": "USD",
    }
  }

  const invalidJsonWithMissingFields = {
    "Realtime Currency Exchange Rate": {
        "1. From_Currency Code": "XOF",
        "2. From_Currency Name": "CFA Franc BCEAO",
        "3. To_Currency Code": "EUR",
        "4. To_Currency Name": "Euro",
        "5. Exchange Rate": "0.00152950",
        "6. Last Refreshed": "2023-08-03 08:13:36",
        "7. Time Zone": "UTC",
    }
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = adapter.parseTicker(validMockTickerJson)

      expect(ticker).toEqual({
        source: Exchange.ALPHAVANTAGE,
        symbol: adapter.standardPairSymbol,
        ask: new BigNumber(0.00153000),
        bid: new BigNumber(0.00152900),
        lastPrice: new BigNumber(0.00152950),
        timestamp: 1691050416,
        baseVolume: new BigNumber(1),
        quoteVolume: new BigNumber(1),
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

    it('throws an error when some required fields are missing', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithMissingFields as any)
      }).toThrowError('bid, ask not defined')
    })
  })

  describe('toUnixTimestamp', () => {
    it('parses datetime strings correctly', () => {
      expect(adapter.toUnixTimestamp('2023-07-26 10:00:00')).toEqual(1690365600)
      expect(adapter.toUnixTimestamp('2023-01-01 4:29:03')).toEqual(1672547343)
      expect(adapter.toUnixTimestamp('2023-03-15 16:53:27')).toEqual(1678899207)
      expect(adapter.toUnixTimestamp('2023-07-20 12:53:15')).toEqual(1689857595)
      expect(adapter.toUnixTimestamp('2023-07-20 00:53:15')).toEqual(1689814395)
    })
  })

  describe('isOrderbookLive', () => {
    let adapter2 = new AlphavantageAdapter(config)
    const mockTime = 1691050416 // 2023-08-03 08:13:36 as in the mock ticker

    it('returns true when the ticker is not older than 30 minutes', async () => {
      const fifteenMinutes = 15 * 60
      jest.spyOn(adapter2, 'fetchFromApi').mockResolvedValue(validMockTickerJson)

      jest.spyOn(Date, 'now').mockImplementation(() => (mockTime + fifteenMinutes) * 1000)
      expect(await adapter2.isOrderbookLive()).toEqual(true)

      const thirtyMinutes = fifteenMinutes * 2
      jest.spyOn(Date, 'now').mockImplementation(() => (mockTime + thirtyMinutes) * 1000)
      expect(await adapter2.isOrderbookLive()).toEqual(true)
    })

    it('returns false when the ticker is older 30 minutes', async () => {
      const thirtyOneMinutes = 31 * 60
      jest.spyOn(adapter2, 'fetchFromApi').mockResolvedValue(validMockTickerJson)

      jest.spyOn(Date, 'now').mockImplementation(() => (mockTime + thirtyOneMinutes) * 1000)
      expect(await adapter2.isOrderbookLive()).toEqual(false)
    })

    it('throws if the ticker timestamp is older than current time', async () => {
      const thirtyFiveMinutes = 35 * 60

      jest.spyOn(adapter2, 'fetchFromApi').mockResolvedValue(validMockTickerJson)
      jest.spyOn(Date, 'now').mockImplementation(() => (mockTime - thirtyFiveMinutes) * 1000)
      expect(async () => {
        await adapter2.isOrderbookLive()
      }).rejects.toThrowError('Ticker timestamp is in the future: 1691048316 < 1691050416')
    })
  })
})
