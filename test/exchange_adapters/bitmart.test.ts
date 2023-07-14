import { BitMartAdapter } from '../../src/exchange_adapters/bitmart'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { baseLogger } from '../../src/default_config'
import { Exchange, ExternalCurrency } from '../../src/utils'
import BigNumber from 'bignumber.js'

describe('BitMart adapter', () => {
  let bitmartAdapter: BitMartAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.EUROC,
    baseLogger,
    quoteCurrency: ExternalCurrency.USDC,
  }

  beforeEach(() => {
    bitmartAdapter = new BitMartAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = {
    message: 'OK',
    code: 1000,
    trace: '48cff315816f4e1aa26ca72cccb46051.58.16892401718550155',
    data: {
      symbol: 'EUROC_USDC',
      last_price: '1.10806017',
      quote_volume_24h: '91361.42293780',
      base_volume_24h: '82758.2',
      high_24h: '1.10872025',
      low_24h: '1.09676936',
      open_24h: '1.09735661',
      close_24h: '1.10806017',
      best_ask: '1.11109875',
      best_ask_size: '51.1',
      best_bid: '1.10756051',
      best_bid_size: '55.2',
      fluctuation: '+0.0098',
      timestamp: 1689239976811,
      url: 'https://www.bitmart.com/trade?symbol=EUROC_USDC',
    },
  }

  const inValidMockTickerJson = {
    message: 'OK',
    code: 1000,
    trace: '48cff315816f4e1aa26ca72cccb46051.58.16892401718550155',
    data: {
      symbol: 'EUROC_USDC',
      last_price: undefined,
      quote_volume_24h: '91361.42293780',
      base_volume_24h: undefined,
      high_24h: '1.10872025',
      low_24h: '1.09676936',
      open_24h: '1.09735661',
      close_24h: '1.10806017',
      best_ask: undefined,
      best_ask_size: '51.1',
      best_bid: undefined,
      best_bid_size: '55.2',
      fluctuation: '+0.0098',
      timestamp: undefined,
      url: 'https://www.bitmart.com/trade?symbol=EUROC_USDC',
    },
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = bitmartAdapter.parseTicker(validMockTickerJson)
      expect(ticker).toEqual({
        source: Exchange.BITMART,
        symbol: bitmartAdapter.standardPairSymbol,
        ask: new BigNumber(1.11109875),
        baseVolume: new BigNumber(82758.2),
        bid: new BigNumber(1.10756051),
        lastPrice: new BigNumber(1.10806017),
        quoteVolume: new BigNumber(91361.4229378),
        timestamp: 1689239976811,
      })
    })

    it('throws an error when a json field mapped to a required ticker field is missing or empty', () => {
      expect(() => {
        bitmartAdapter.parseTicker(inValidMockTickerJson)
      }).toThrowError('timestamp, bid, ask, lastPrice, baseVolume not defined')
    })
  })

  describe('fetchTrades', () => {
    it('returns empty array', async () => {
      expect(await bitmartAdapter.fetchTrades()).toEqual([])
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
          symbol: 'EUROC_USDC',
          symbol_id: 2632,
          base_currency: 'EUROC',
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
          symbol: 'EUROC_XOF',
          symbol_id: 2632,
          base_currency: 'EUROC',
          quote_currency: 'USDC',
          quote_increment: '0.1',
          base_min_size: '0.100000000000000000000000000000',
          price_min_precision: 5,
          price_max_precision: 8,
          expiration: 'NA',
          min_buy_amount: '5.000000000000000000000000000000',
          min_sell_amount: '5.000000000000000000000000000000',
          trade_status: '',
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
  })
})
