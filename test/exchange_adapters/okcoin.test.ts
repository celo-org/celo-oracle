import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import { baseLogger } from '../../src/default_config'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { OKCoinAdapter } from '../../src/exchange_adapters/okcoin'
import { Exchange, ExternalCurrency } from '../../src/utils'

describe('OKCoinAdapter', () => {
  let okcoinAdapter: OKCoinAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: CeloContract.GoldToken,
    baseLogger,
    quoteCurrency: ExternalCurrency.USD,
  }
  beforeEach(() => {
    okcoinAdapter = new OKCoinAdapter(config)
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })
  describe('parseTicker', () => {
    const correctlyFormattedJson = {
      best_ask: '200.99',
      best_bid: '200.93',
      instrument_id: 'CELO-USD',
      product_id: 'CELO-USD',
      last: '200.81',
      last_qty: '0',
      ask: '200.99',
      best_ask_size: '62.09',
      bid: '200.93',
      best_bid_size: '2.46',
      open_24h: '203.43',
      high_24h: '205.33',
      low_24h: '200.36',
      base_volume_24h: '2556.5805',
      timestamp: '2020-05-26T12:49:05.049Z',
      quote_volume_24h: '519342.82',
    }
    it('handles a response that matches the documentation', () => {
      const ticker = okcoinAdapter.parseTicker(correctlyFormattedJson)
      expect(ticker).toEqual({
        source: Exchange.OKCOIN,
        symbol: okcoinAdapter.standardPairSymbol,
        ask: new BigNumber(200.99),
        baseVolume: new BigNumber(2556.5805),
        bid: new BigNumber(200.93),
        high: new BigNumber(205.33),
        lastPrice: new BigNumber(200.81),
        low: new BigNumber(200.36),
        open: new BigNumber(203.43),
        timestamp: 1590497345049,
      })
    })
    it('throws an error when a json field mapped to a required ticker field is missing', () => {
      expect(() => {
        okcoinAdapter.parseTicker({
          ...correctlyFormattedJson,
          ask: undefined,
          base_volume_24h: undefined,
          bid: undefined,
          last: undefined,
          timestamp: undefined,
        })
      }).toThrowError('timestamp, bid, ask, lastPrice, baseVolume not defined')
    })
    it('throws an error when the timestamp is in a bad format and cannot be parsed', () => {
      expect(() => {
        okcoinAdapter.parseTicker({
          ...correctlyFormattedJson,
          timestamp: 'the 20th of May, 2020 at 1:22 pm',
        })
      }).toThrowError('timestamp not defined')
    })
  })
  describe('parseTrades', () => {
    // Slightly modified example from their docs
    const goodTrade1 = {
      time: '2019-04-12T02:07:30.523Z',
      timestamp: '2019-04-12T02:07:30.523Z',
      trade_id: '1296412902',
      price: '4913.4',
      size: '0.0099',
      side: 'buy',
    }
    const goodTrade2 = {
      time: '2019-04-12T02:07:30.455Z',
      timestamp: '2019-04-12T02:07:30.455Z',
      trade_id: '1296412899',
      price: '4913.2',
      size: '0.17',
      side: 'sell',
    }
    const goodTradeArray = [goodTrade1, goodTrade2]

    it('handles correctly formatted trades', () => {
      const result = okcoinAdapter.parseTrades(goodTradeArray)
      expect(result).toEqual([
        {
          amount: new BigNumber(0.0099),
          cost: new BigNumber(48.64266),
          id: '1296412902',
          price: new BigNumber(4913.4),
          side: 'buy',
          source: Exchange.OKCOIN,
          symbol: okcoinAdapter.standardPairSymbol,
          timestamp: 1555034850523,
        },
        {
          amount: new BigNumber(0.17),
          cost: new BigNumber(835.244),
          id: '1296412899',
          price: new BigNumber(4913.2),
          side: 'sell',
          source: Exchange.OKCOIN,
          symbol: okcoinAdapter.standardPairSymbol,
          timestamp: 1555034850455,
        },
      ])
    })
    it('throws an error if a required field is missing on one trade', () => {
      expect(() => {
        okcoinAdapter.parseTrades([
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
})
