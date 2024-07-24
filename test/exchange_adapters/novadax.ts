import BigNumber from 'bignumber.js'
import { baseLogger } from '../../src/default_config'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { NovaDaxAdapter } from '../../src/exchange_adapters/novadax'
import { Exchange, ExternalCurrency } from '../../src/utils'
import { MockSSLFingerprintService } from '../services/mock_ssl_fingerprint_service'

describe('NovaDaxAdapter', () => {
  let novadaxAdapter: NovaDaxAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.BTC,
    baseLogger,
    quoteCurrency: ExternalCurrency.USD,
    sslFingerprintService: new MockSSLFingerprintService()
  }
  beforeEach(() => {
    novadaxAdapter = new NovaDaxAdapter(config)
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })
  describe('parseTicker', () => {
    const tickerJson = {
      code: 'A10000',
      data: [
        {
          ask: '658600.01',
          baseVolume24h: '34.08241488',
          bid: '658600.0',
          high24h: '689735.63',
          low24h: '658000.0',
          lastPrice: '658600.01',
          open24h: '658600.01',
          quoteVolume24h: '669760.9564740908',
          symbol: 'BTC_BRL',
          timestamp: 1625205325000,
        },
      ],
      message: 'Success',
    }

    it('handles a response that matches the documentation', () => {
      expect(novadaxAdapter.parseTicker(tickerJson)).toEqual({
        source: Exchange.NOVADAX,
        symbol: novadaxAdapter.standardPairSymbol,
        ask: new BigNumber(658600.01),
        baseVolume: new BigNumber(188.62575176),
        bid: new BigNumber(658600.0),
        high: new BigNumber(689735.63),
        low: new BigNumber(658000.0),
        lastPrice: new BigNumber(658600.01),
        open: new BigNumber(658600.01),
        quoteVolume: new BigNumber(669760.9564740908),
        timestamp: 1625205325000,
      })
    })
    // timestamp, bid, ask, lastPrice, baseVolume
    const requiredFields = ['ask', 'bid', 'last', 'created_at', 'volume']

    for (const field of Object.keys(tickerJson)) {
      // @ts-ignore
      const { [field]: _removed, ...incompleteTickerJson } = tickerJson.payload
      if (requiredFields.includes(field)) {
        it(`throws an error if ${field} is missing`, () => {
          expect(() => {
            novadaxAdapter.parseTicker(incompleteTickerJson)
          }).toThrowError()
        })
      } else {
        it(`parses a ticker if ${field} is missing`, () => {
          expect(() => {
            novadaxAdapter.parseTicker(incompleteTickerJson)
          }).not.toThrowError()
        })
      }
    }
  })
})
