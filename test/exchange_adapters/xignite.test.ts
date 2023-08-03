import { Exchange, ExternalCurrency } from '../../src/utils'
import { ExchangeAdapterConfig, Ticker } from '../../src/exchange_adapters/base'

import BigNumber from 'bignumber.js'
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
    "Time": "9:55:47 AM",
    "Date": "07/27/2023",
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
        timestamp: 1690451747,
        baseVolume: new BigNumber(1),
        quoteVolume: new BigNumber(1),
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

  describe('toUnixTimestamp', () => {
    it('handles date strings with AM time', () => {
      expect(adapter.toUnixTimestamp('07/26/2023', '10:00:00 AM')).toEqual(1690365600)
      expect(adapter.toUnixTimestamp('01/01/2023', '4:29:03 AM')).toEqual(1672547343)
    })
    it('handles date strins with PM time', () => {
      expect(adapter.toUnixTimestamp('03/15/2023', '4:53:27 PM')).toEqual(1678899207)
      expect(adapter.toUnixTimestamp('07/26/2023', '8:29:37 PM')).toEqual(1690403377)
    })
    it('handles 12 PM edge case', () => {
      expect(adapter.toUnixTimestamp('07/20/2023', '12:53:15 PM')).toEqual(1689857595)
    })
    it('handles 12 AM edge case', () => {
      expect(adapter.toUnixTimestamp('07/20/2023', '12:53:15 AM')).toEqual(1689814395)
    })
  })

  describe.only('isOrderbookLive', () => {
    let adapter2 = new XigniteAdapter(config)
    const mockTime = 1690451747
    const validTicker: Ticker = {
      source: Exchange.XIGNITE,
      symbol: adapter2.standardPairSymbol,
      ask: new BigNumber(1),
      bid: new BigNumber(0.5),
      lastPrice: new BigNumber(0.75),
      timestamp: mockTime,
      baseVolume: new BigNumber(1),
      quoteVolume: new BigNumber(1),
    }

    it('returns true when the ticker is not older than 30 minutes', async () => {
      const fifteenMinutes = 15 * 60
      jest.spyOn(adapter2, 'fetchTicker').mockResolvedValue(validTicker)

      jest.spyOn(Date, 'now').mockImplementation(() => (mockTime + fifteenMinutes) * 1000)
      expect(await adapter2.isOrderbookLive()).toEqual(true)

      jest.spyOn(Date, 'now').mockImplementation(() => (mockTime - fifteenMinutes) * 1000)
      expect(await adapter2.isOrderbookLive()).toEqual(true)

      const thirtyMinutes = fifteenMinutes * 2
      jest.spyOn(Date, 'now').mockImplementation(() => (mockTime + thirtyMinutes) * 1000)
      expect(await adapter2.isOrderbookLive()).toEqual(true)
    })

    it('returns false when the ticker is older 30 minutes', async () => {
      const thirtyOneMinutes = 31 * 60
      jest.spyOn(adapter2, 'fetchTicker').mockResolvedValue(validTicker)

      jest.spyOn(Date, 'now').mockImplementation(() => (mockTime + thirtyOneMinutes) * 1000)
      expect(await adapter2.isOrderbookLive()).toEqual(false)

      // jest.spyOn(Date, 'now').mockImplementation(() => (mockTime - thirtyOneMinutes) * 1000)
      // expect(await adapter2.isOrderbookLive()).toEqual(false)
    })
  })
})
