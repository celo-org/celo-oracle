import { Exchange, ExternalCurrency } from '../../src/utils'
import { ExchangeAdapterConfig, ExchangeDataType } from '../../src/exchange_adapters/base'

import BigNumber from 'bignumber.js'
import { CeloContract } from '@celo/contractkit'
import { CoinbaseAdapter } from '../../src/exchange_adapters/coinbase'
import { baseLogger } from '../../src/default_config'
import { CertificateManager } from '../../src/certs_manager'

describe('CoinbaseAdapter', () => {
  let coinbaseAdapter: CoinbaseAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: CeloContract.GoldToken,
    baseLogger,
    certificateManager: new CertificateManager('', 1000, baseLogger),
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
        quoteVolume: new BigNumber(513386.930205),
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

  describe('isOrderbookLive', () => {
    const falseStatusIndicators = [
      { post_only: true },
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
