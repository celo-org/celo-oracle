import { Exchange, ExternalCurrency } from '../../src/utils'

import BigNumber from 'bignumber.js'
import { BitMartAdapter } from '../../src/exchange_adapters/bitmart'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { baseLogger } from '../../src/default_config'
import { MockSSLFingerprintService } from '../services/mock_ssl_fingerprint_service'

describe('BitMart adapter', () => {
  let bitmartAdapter: BitMartAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.EUROC,
    baseLogger,
    quoteCurrency: ExternalCurrency.USDC,
    sslFingerprintService: new MockSSLFingerprintService(),
  }

  beforeEach(() => {
    bitmartAdapter = new BitMartAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = {
    code: 1000,
    trace: 'cb71f71e25c3455bb1cb79d0f4a5193f.80.17266561640857171',
    message: 'success',
    data: {
      symbol: 'EURC_USDT',
      last: '1.10865893',
      v_24h: '285133.6',
      qv_24h: '316205.69052193',
      open_24h: '1.10995877',
      high_24h: '1.11513918',
      low_24h: '1.10571015',
      fluctuation: '-0.00117',
      bid_px: '1.10865891',
      bid_sz: '108.8',
      ask_px: '1.11484809',
      ask_sz: '57.6',
      ts: '1726656163973',
    },
  }

  const inValidMockTickerJson = {
    code: 1000,
    trace: 'cb71f71e25c3455bb1cb79d0f4a5193f.80.17266561640857171',
    message: 'success',
    data: {
      symbol: 'EURC_USDT',
      last: undefined,
      v_24h: undefined,
      qv_24h: '316205.69052193',
      open_24h: '1.10995877',
      high_24h: '1.11513918',
      low_24h: '1.10571015',
      fluctuation: '-0.00117',
      bid_px: undefined,
      bid_sz: '108.8',
      ask_px: undefined,
      ask_sz: '57.6',
      ts: undefined,
    },
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = bitmartAdapter.parseTicker(validMockTickerJson)
      expect(ticker).toEqual({
        source: Exchange.BITMART,
        symbol: bitmartAdapter.standardPairSymbol,
        ask: new BigNumber(1.11484809),
        baseVolume: new BigNumber(285133.6),
        bid: new BigNumber(1.10865891),
        lastPrice: new BigNumber(1.10865893),
        quoteVolume: new BigNumber(316205.69052193),
        timestamp: 1726656163973,
      })
    })

    it('throws an error when a json field mapped to a required ticker field is missing or empty', () => {
      expect(() => {
        bitmartAdapter.parseTicker(inValidMockTickerJson)
      }).toThrowError('timestamp, bid, ask, lastPrice, baseVolume not defined')
    })
  })

  const validMockStatusJson = {
    message: 'OK',
    code: 1000,
    trace: '48cff315816f4e1aa26ca72cccb46051.69.16892383896653019',
    data: {
      symbols: [
        {
          symbol: 'SOLAR_USDT',
          symbol_id: 2342,
          base_currency: 'SOLAR',
          quote_currency: 'USDT',
          quote_increment: '1',
          base_min_size: '1.000000000000000000000000000000',
          price_min_precision: 3,
          price_max_precision: 6,
          expiration: 'NA',
          min_buy_amount: '5.000000000000000000000000000000',
          min_sell_amount: '5.000000000000000000000000000000',
          trade_status: '',
        },
        {
          symbol: 'EURC_USDC',
          symbol_id: 2632,
          base_currency: 'EURC',
          quote_currency: 'USDC',
          quote_increment: '0.1',
          base_min_size: '0.100000000000000000000000000000',
          price_min_precision: 5,
          price_max_precision: 8,
          expiration: 'NA',
          min_buy_amount: '5.000000000000000000000000000000',
          min_sell_amount: '5.000000000000000000000000000000',
          trade_status: 'trading',
        },
      ],
    },
  }

  const inValidMockStatusJson = {
    message: 'OK',
    code: 1000,
    trace: '48cff315816f4e1aa26ca72cccb46051.69.16892383896653019',
    data: {
      symbols: [
        {
          symbol: 'SOLAR_USDT',
          symbol_id: 2342,
          base_currency: 'SOLAR',
          quote_currency: 'USDT',
          quote_increment: '1',
          base_min_size: '1.000000000000000000000000000000',
          price_min_precision: 3,
          price_max_precision: 6,
          expiration: 'NA',
          min_buy_amount: '5.000000000000000000000000000000',
          min_sell_amount: '5.000000000000000000000000000000',
          trade_status: 'trading',
        },
        {
          symbol: 'EURC_USDC',
          symbol_id: 2632,
          base_currency: 'EURC',
          quote_currency: 'USDC',
          quote_increment: '0.1',
          base_min_size: '0.100000000000000000000000000000',
          price_min_precision: 5,
          price_max_precision: 8,
          expiration: 'NA',
          min_buy_amount: '5.000000000000000000000000000000',
          min_sell_amount: '5.000000000000000000000000000000',
          trade_status: 'notTrading',
        },
      ],
    },
  }

  const inValidMockStatusJson2 = {
    message: 'OK',
    code: 1000,
    trace: '48cff315816f4e1aa26ca72cccb46051.69.16892383896653019',
    data: {
      symbols: [
        {
          symbol: 'SOLAR_USDT',
          symbol_id: 2342,
          base_currency: 'SOLAR',
          quote_currency: 'USDT',
          quote_increment: '1',
          base_min_size: '1.000000000000000000000000000000',
          price_min_precision: 3,
          price_max_precision: 6,
          expiration: 'NA',
          min_buy_amount: '5.000000000000000000000000000000',
          min_sell_amount: '5.000000000000000000000000000000',
          trade_status: 'trading',
        },
        {
          symbol: 'EURC_XOF',
          symbol_id: 2632,
          base_currency: 'EURC',
          quote_currency: 'USDC',
          quote_increment: '0.1',
          base_min_size: '0.100000000000000000000000000000',
          price_min_precision: 5,
          price_max_precision: 8,
          expiration: 'NA',
          min_buy_amount: '5.000000000000000000000000000000',
          min_sell_amount: '5.000000000000000000000000000000',
          trade_status: 'trading',
        },
      ],
    },
  }

  describe('isOrderbookLive', () => {
    it('returns true if trade_status is trading', async () => {
      jest
        .spyOn(bitmartAdapter, 'fetchFromApi')
        .mockReturnValue(Promise.resolve(validMockStatusJson))
      expect(await bitmartAdapter.isOrderbookLive()).toEqual(true)
    })

    it('returns false if trade_status is not trading', async () => {
      jest
        .spyOn(bitmartAdapter, 'fetchFromApi')
        .mockReturnValue(Promise.resolve(inValidMockStatusJson))
      expect(await bitmartAdapter.isOrderbookLive()).toEqual(false)
    })

    it('returns false if pair is not in response', async () => {
      jest
        .spyOn(bitmartAdapter, 'fetchFromApi')
        .mockReturnValue(Promise.resolve(inValidMockStatusJson2))
      expect(await bitmartAdapter.isOrderbookLive()).toEqual(false)
    })
  })
})
