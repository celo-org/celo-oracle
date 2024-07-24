import BigNumber from 'bignumber.js'
import { baseLogger } from '../../src/default_config'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { BitsoAdapter } from '../../src/exchange_adapters/bitso'
import { Exchange, ExternalCurrency } from '../../src/utils'
import { MockSSLFingerprintService } from '../services/mock_ssl_fingerprint_service'

describe('BitsoAdapter', () => {
  let bitsoAdapter: BitsoAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.BTC,
    baseLogger,
    quoteCurrency: ExternalCurrency.USD,
    sslFingerprintService: new MockSSLFingerprintService()
  }
  beforeEach(() => {
    bitsoAdapter = new BitsoAdapter(config)
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })
  describe('parseTicker', () => {
    const tickerJson = {
      success: true,
      payload: {
        high: '689735.63',
        last: '658600.01',
        created_at: '2021-07-02T05:55:25+00:00',
        book: 'btc_mxn',
        volume: '188.62575176',
        vwap: '669760.9564740908',
        low: '658000.00',
        ask: '658600.01',
        bid: '658600.00',
        change_24: '-29399.96',
      },
    }

    it('handles a response that matches the documentation', () => {
      expect(bitsoAdapter.parseTicker(tickerJson.payload)).toEqual({
        source: Exchange.BITSO,
        symbol: bitsoAdapter.standardPairSymbol,
        ask: new BigNumber(658600.01),
        baseVolume: new BigNumber(188.62575176),
        bid: new BigNumber(658600.0),
        high: new BigNumber(689735.63),
        lastPrice: new BigNumber(658600.01),
        low: new BigNumber(658000.0),
        open: new BigNumber(658600.01),
        quoteVolume: new BigNumber(669760.9564740908),
        timestamp: 1625205325000,
      })
    })
    // timestamp, bid, ask, lastPrice, baseVolume
    const requiredFields = ['ask', 'bid', 'last', 'created_at', 'volume']

    for (const field of Object.keys(tickerJson.payload)) {
      // @ts-ignore
      const { [field]: _removed, ...incompleteTickerJson } = tickerJson.payload
      if (requiredFields.includes(field)) {
        it(`throws an error if ${field} is missing`, () => {
          expect(() => {
            bitsoAdapter.parseTicker(incompleteTickerJson)
          }).toThrowError()
        })
      } else {
        it(`parses a ticker if ${field} is missing`, () => {
          expect(() => {
            bitsoAdapter.parseTicker(incompleteTickerJson)
          }).not.toThrowError()
        })
      }
    }
  })
})
