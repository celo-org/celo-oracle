import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import { baseLogger } from '../../src/default_config'
import { ExchangeAdapterConfig, ExchangeDataType } from '../../src/exchange_adapters/base'
import { CoinbaseAdapter } from '../../src/exchange_adapters/coinbase'
import { Exchange, ExternalCurrency } from '../../src/utils'

describe('CoinbaseAdapter', () => {
  let coinbaseAdapter: CoinbaseAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: CeloContract.GoldToken,
    baseLogger,
    quoteCurrency: ExternalCurrency.USD,
  }
  beforeEach(() => {
    coinbaseAdapter = new CoinbaseAdapter(config)
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })
  const mockTickerJson = {
    trade_id: 4729088,
    price: '200.81',
    size: '0.193',
    bid: '200.93',
    ask: '200.99',
    volume: '2556.5805',
    time: '2020-05-26T12:49:05.049Z',
  }
  const mockTradeJson = [
    {
      time: '2021-03-02T13:34:31.407Z',
      trade_id: '1461835',
      price: '4913.4',
      size: '0.0099',
      side: 'buy',
    },
    {
      time: '2021-03-02T13:11:48.005Z',
      trade_id: '1461771',
      price: '4913.4',
      size: '0.0099',
      side: 'buy',
    },
    {
      time: '2021-03-02T13:09:47.272Z',
      trade_id: '1461736',
      price: '4913.4',
      size: '0.0099',
      side: 'buy',
    },
  ]

  const mockStatusJson = {
    id: 'CGLD-USD',
    base_currency: 'CGLD',
    quote_currency: 'USD',
    base_min_size: '0.10000000',
    base_max_size: '34000.00000000',
    quote_increment: '0.00010000',
    base_increment: '0.01000000',
    display_name: 'CGLD/USD',
    min_market_funds: '1.0',
    max_market_funds: '100000',
    margin_enabled: false,
    post_only: false,
    limit_only: false,
    cancel_only: false,
    trading_disabled: false,
    status: 'online',
    status_message: '',
  }

  describe('using the non-standard symbol for CELO', () => {
    let fetchFromApiSpy: jest.SpyInstance
    beforeEach(() => {
      fetchFromApiSpy = jest.spyOn(coinbaseAdapter, 'fetchFromApi')
    })
    it('uses the right symbols when fetching the ticker', async () => {
      fetchFromApiSpy.mockReturnValue(Promise.resolve(mockTickerJson))
      await coinbaseAdapter.fetchTicker()
      expect(fetchFromApiSpy).toHaveBeenCalledWith(
        ExchangeDataType.TICKER,
        'products/CGLD-USD/ticker'
      )
    })
    it('uses the right symbols when fetching trades', async () => {
      fetchFromApiSpy.mockReturnValue(Promise.resolve(mockTradeJson))
      await coinbaseAdapter.fetchTrades()
      expect(fetchFromApiSpy).toHaveBeenCalledWith(
        ExchangeDataType.TRADE,
        'products/CGLD-USD/trades'
      )
    })
  })
  describe('fetchTrades', () => {
    it('returns the trades in the right order', async () => {
      let fetchFromApiSpy: jest.SpyInstance
      fetchFromApiSpy = jest.spyOn(coinbaseAdapter, 'fetchFromApi')
      fetchFromApiSpy.mockReturnValue(Promise.resolve(mockTradeJson))

      const sortedTradesResponse = [
        mockTradeJson[2].trade_id,
        mockTradeJson[1].trade_id,
        mockTradeJson[0].trade_id,
      ]
      const tradesFetched = await coinbaseAdapter.fetchTrades()
      expect(tradesFetched.map((t) => t.id)).toEqual(sortedTradesResponse)
    })
  })
  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = coinbaseAdapter.parseTicker(mockTickerJson)
      expect(ticker).toEqual({
        source: Exchange.COINBASE,
        symbol: coinbaseAdapter.standardPairSymbol,
        ask: new BigNumber(200.99),
        baseVolume: new BigNumber(2556.5805),
        bid: new BigNumber(200.93),
        close: new BigNumber(200.81),
        lastPrice: new BigNumber(200.81),
        timestamp: 1590497345049,
      })
    })
    it('throws an error when a json field mapped to a required ticker field is missing', () => {
      expect(() => {
        coinbaseAdapter.parseTicker({
          ...mockTickerJson,
          ask: undefined,
          volume: undefined,
          bid: undefined,
          time: undefined,
          price: undefined,
        })
      }).toThrowError('timestamp, bid, ask, lastPrice, baseVolume not defined')
    })
    it('throws an error when the timestamp is in a bad format and cannot be parsed', () => {
      expect(() => {
        coinbaseAdapter.parseTicker({
          ...mockTickerJson,
          time: 'the 20th of May, 2020 at 1:22 pm',
        })
      }).toThrowError('timestamp not defined')
    })
  })
  describe('parseTrades', () => {
    // Slightly modified example from their docs
    const goodTrade1 = {
      time: '2019-04-12T02:07:30.523Z',
      trade_id: '1296412902',
      price: '4913.4',
      size: '0.0099',
      side: 'buy',
    }
    const goodTrade2 = {
      time: '2019-04-12T02:07:30.455Z',
      trade_id: '1296412899',
      price: '4913.2',
      size: '0.17',
      side: 'sell',
    }
    const goodTradeArray = [goodTrade1, goodTrade2]

    it('handles correctly formatted trades', () => {
      const result = coinbaseAdapter.parseTrades(goodTradeArray)
      expect(result).toEqual([
        {
          amount: new BigNumber(0.0099),
          cost: new BigNumber(48.64266),
          id: '1296412902',
          price: new BigNumber(4913.4),
          side: 'buy',
          source: Exchange.COINBASE,
          symbol: coinbaseAdapter.standardPairSymbol,
          timestamp: 1555034850523,
        },
        {
          amount: new BigNumber(0.17),
          cost: new BigNumber(835.244),
          id: '1296412899',
          price: new BigNumber(4913.2),
          side: 'sell',
          source: Exchange.COINBASE,
          symbol: coinbaseAdapter.standardPairSymbol,
          timestamp: 1555034850455,
        },
      ])
    })
    it('throws an error if a required field is missing on one trade', () => {
      expect(() => {
        coinbaseAdapter.parseTrades([
          {
            ...goodTrade1,
            price: undefined,
            trade_id: undefined,
            size: undefined,
          },
          goodTrade2,
        ])
      }).toThrowError('id, price, amount, cost not defined')
    })
  })
  describe('isOrderbookLive', () => {
    const falseStatusIndicators = [
      { post_only: true },
      { limit_only: true },
      { cancel_only: true },
      { status: 'offline' },
    ]

    it("returns false when status isn't 'online' or any of the 'only' flags are true", async () => {
      for (const indicator of falseStatusIndicators) {
        const response = { ...mockStatusJson, ...indicator }
        jest.spyOn(coinbaseAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(response))
        expect(await coinbaseAdapter.isOrderbookLive()).toEqual(false)
      }
    })
    it("returns true when status is 'online' and all the 'only' flags are false", async () => {
      jest.spyOn(coinbaseAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(mockStatusJson))
      expect(await coinbaseAdapter.isOrderbookLive()).toEqual(true)
    })
  })
})
