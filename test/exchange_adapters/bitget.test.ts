import { Exchange, ExternalCurrency } from '../../src/utils'

import BigNumber from 'bignumber.js'
import { BitgetAdapter } from '../../src/exchange_adapters/bitget'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { baseLogger } from '../../src/default_config'
import { CertificateManager } from '../../src/certs_manager'

describe('BitgetAdapter', () => {
  let bitgetAdapter: BitgetAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.BTC,
    baseLogger,
    certificateManager: new CertificateManager(baseLogger, ''),
    quoteCurrency: ExternalCurrency.BRL,
  }
  beforeEach(() => {
    bitgetAdapter = new BitgetAdapter(config)
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const mockPubtickerJson = {
    code: '00000',
    data: {
      baseVol: '9.18503', // (price symbol, e.g. "USD") The volume denominated in the price currency
      buyOne: '121890', // buy one price = bid pice
      close: '121905', // Latest transaction price
      quoteVol: '1119715.23314', // (price symbol, e.g. "USD") The volume denominated in the quantity currency
      sellOne: '122012', // sell one price = ask price
      symbol: 'BTCBRL', // Symbol
      ts: 1677490448241, // Timestamp
    },
    msg: 'success',
    requestTime: '1677490448872', // Request status
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = bitgetAdapter.parseTicker(mockPubtickerJson)
      expect(ticker).toEqual({
        source: Exchange.BITGET,
        symbol: bitgetAdapter.standardPairSymbol,
        ask: new BigNumber(122012),
        baseVolume: new BigNumber(9.18503),
        bid: new BigNumber(121890),
        lastPrice: new BigNumber(121905),
        quoteVolume: new BigNumber(1119715.23314),
        timestamp: 1677490448241,
      })
    })

    it('throws an error when a json field mapped to a required ticker field is missing', () => {
      expect(() => {
        bitgetAdapter.parseTicker({
          ...mockPubtickerJson,
          data: {
            sellOne: undefined,
            buyOne: undefined,
            close: undefined,
            baseVol: undefined,
          },
        })
      }).toThrowError('bid, ask, lastPrice, baseVolume not defined')
    })
  })

  describe('isOrderbookLive', () => {
    const mockStatusJson = {
      code: '00000',
      data: {
        base_coin: 'BTC',
        status: 'online',
        symbol: 'btcbrl_SPBL',
      },
      msg: 'success',
      requestTime: '0',
    }

    it("returns false when status isn't 'online'", async () => {
      const response = { ...mockStatusJson, data: { status: 'closed' } }
      jest.spyOn(bitgetAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(response))
      expect(await bitgetAdapter.isOrderbookLive()).toEqual(false)
    })

    it("returns true when status is 'online'", async () => {
      jest.spyOn(bitgetAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(mockStatusJson))
      expect(await bitgetAdapter.isOrderbookLive()).toEqual(true)
    })
  })
})
