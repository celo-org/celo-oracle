import { Exchange, ExternalCurrency } from '../../src/utils'

import BigNumber from 'bignumber.js'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { XigniteAdapter } from '../../src/exchange_adapters/xignite'
import { baseLogger } from '../../src/default_config'
import { CertificateManager } from '../../src/certs_manager'

describe('Xignite adapter', () => {
  let adapter: XigniteAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.EUR,
    baseLogger,
    certificateManager: new CertificateManager(baseLogger, ''),
    quoteCurrency: ExternalCurrency.XOF,
  }

  beforeEach(() => {
    adapter = new XigniteAdapter(config)
  })

  const validMockTickerJson = {
    BaseCurrency: 'EUR',
    QuoteCurrency: 'XOF',
    Symbol: 'EURXOF',
    Date: '09/29/2023',
    Time: '9:59:50 PM',
    QuoteType: 'Calculated',
    Bid: 653.626,
    Mid: 654.993,
    Ask: 656.36,
    Spread: 2.734,
    Text: '1 European Union euro = 654.993 West African CFA francs',
    Source: 'Rates calculated by crossing via ZAR(Morningstar).',
    Outcome: 'Success',
    Message: null,
    Identity: 'Request',
    Delay: 0.0032363,
  }

  const invalidJsonWithBaseCurrencyMissmatch = {
    ...validMockTickerJson,
    BaseCurrency: 'USD',
  }

  const invalidJsonWithQuoteCurrencyMissmatch = {
    ...validMockTickerJson,
    QuoteCurrency: 'USD',
  }

  const invalidJsonWithMissingFields = {
    Spread: 0.000001459666,
    Mid: 0.001524435453,
    Delay: 0.0570077,
    Time: '2:36:48 PM',
    Date: '07/26/2023',
    Symbol: 'EURXOF',
    QuoteCurrency: 'XOF',
    BaseCurrency: 'EUR',
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = adapter.parseTicker(validMockTickerJson)

      expect(ticker).toEqual({
        source: Exchange.XIGNITE,
        symbol: adapter.standardPairSymbol,
        ask: new BigNumber(656.36),
        bid: new BigNumber(653.626),
        lastPrice: new BigNumber(654.993),
        timestamp: 1696024790,
        baseVolume: new BigNumber(1),
        quoteVolume: new BigNumber(1),
      })
    })

    it('throws an error when the base currency does not match', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithBaseCurrencyMissmatch)
      }).toThrowError('Base currency mismatch in response: USD != EUR')
    })

    it('throws an error when the quote currency does not match', () => {
      expect(() => {
        adapter.parseTicker(invalidJsonWithQuoteCurrencyMissmatch)
      }).toThrowError('Quote currency mismatch in response: USD != XOF')
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
})
