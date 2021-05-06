import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import { baseLogger } from '../../src/default_config'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { BittrexAdapter } from '../../src/exchange_adapters/bittrex'
import { Exchange, ExternalCurrency } from '../../src/utils'

describe('BittrexAdapter', () => {
  let bittrexAdapter: BittrexAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: CeloContract.GoldToken,
    baseLogger,
    quoteCurrency: ExternalCurrency.USD,
  }
  beforeEach(() => {
    bittrexAdapter = new BittrexAdapter(config)
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })
  describe('parseTicker', () => {
    const correctlyFormattedSummaryJson = {
      symbol: 'CELO-USD',
      high: '215.83000000',
      low: '210.33300000',
      volume: '3335.48514449',
      quoteVolume: '711062.81323057',
      percentChange: '0.2',
      updatedAt: '2020-05-20T10:12:41.393Z',
    }
    const correctlyFormattedTickerJson = {
      symbol: 'CELO-USD',
      lastTradeRate: '213.76200000',
      bidRate: '213.56500000',
      askRate: '213.83400000',
    }

    it('handles a response that matches the documentation', () => {
      const ticker = bittrexAdapter.parseTicker(
        correctlyFormattedTickerJson,
        correctlyFormattedSummaryJson
      )

      expect(ticker).toEqual({
        source: Exchange.BITTREX,
        symbol: bittrexAdapter.standardPairSymbol,
        timestamp: 1589969561393,
        high: new BigNumber(215.83),
        low: new BigNumber(210.333),
        bid: new BigNumber(213.565),
        ask: new BigNumber(213.834),
        lastPrice: new BigNumber(213.762),
        baseVolume: new BigNumber(3335.48514449),
        quoteVolume: new BigNumber(711062.81323057),
      })
    })
    it('throws an error when a required BigNumber field is missing', () => {
      expect(() => {
        bittrexAdapter.parseTicker(
          {
            ...correctlyFormattedTickerJson,
            lastTradeRate: undefined,
          },
          correctlyFormattedSummaryJson
        )
      }).toThrowError('lastPrice not defined')
    })
    it('throws an error when the date could not be parsed', () => {
      expect(() => {
        bittrexAdapter.parseTicker(correctlyFormattedTickerJson, {
          ...correctlyFormattedSummaryJson,
          updatedAt: 'the 20th of May, 2020 at 1:22 pm',
        })
      }).toThrowError('timestamp not defined')
    })
  })
  describe('parseTrades', () => {
    const goodTrade1 = {
      id: '8b9fc1be-3f62-480a-bb06-d91cac27fed9',
      executedAt: '2020-05-20T12:45:03.71Z',
      quantity: '1.00000000',
      rate: '214.30100000',
      takerSide: 'BUY',
    }
    const goodTrade2 = {
      id: '81993afb-06f3-4f41-a32b-60f0d4ec9d4c',
      executedAt: '2020-05-20T12:39:09.85Z',
      quantity: '0.04824285',
      rate: '214.02100000',
      takerSide: 'SELL',
    }
    const goodTradeArray = [goodTrade1, goodTrade2]

    it('handles correctly formatted trades', () => {
      const result = bittrexAdapter.parseTrades(goodTradeArray)
      expect(result).toEqual([
        {
          source: Exchange.BITTREX,
          id: '8b9fc1be-3f62-480a-bb06-d91cac27fed9',
          timestamp: 1589978703710,
          symbol: bittrexAdapter.standardPairSymbol,
          side: 'BUY',
          price: new BigNumber(214.301),
          amount: new BigNumber(1),
          cost: new BigNumber(214.301),
        },
        {
          source: Exchange.BITTREX,
          id: '81993afb-06f3-4f41-a32b-60f0d4ec9d4c',
          timestamp: 1589978349850,
          symbol: bittrexAdapter.standardPairSymbol,
          side: 'SELL',
          price: new BigNumber(214.021),
          amount: new BigNumber(0.04824285),
          cost: new BigNumber(10.32498299985),
        },
      ])
    })
    it('throws an error if a number field was not reasonably parsed', () => {
      expect(() => {
        bittrexAdapter.parseTrades([
          {
            ...goodTrade1,
            rate: 'two_hundred_something!',
          },
          goodTrade2,
        ])
      }).toThrow('price, cost not defined')
    })
    it('throws an error if the date could not be parsed', () => {
      expect(() => {
        bittrexAdapter.parseTrades([
          {
            ...goodTrade2,
            executedAt: '71st March, 2020, 25:06',
          },
        ])
      }).toThrowError('timestamp not defined')
    })
  })
  describe('isOrderbookLive', () => {
    const mockStatusJson = {
      symbol: 'CELO-USD',
      baseCurrencySymbol: 'CELO',
      quoteCurrencySymbol: 'USD',
      minTradeSize: '3.00000000',
      precision: 3,
      status: 'ONLINE',
      createdAt: '2020-05-21T16:43:29.013Z',
      notice: '',
      prohibitedIn: [],
      associatedTermsOfService: [],
    }

    it('returns true if status is online', async () => {
      jest.spyOn(bittrexAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(mockStatusJson))
      expect(await bittrexAdapter.isOrderbookLive()).toEqual(true)
    })
    it('returns false if status is offline', async () => {
      jest.spyOn(bittrexAdapter, 'fetchFromApi').mockReturnValue(
        Promise.resolve({
          ...mockStatusJson,
          status: 'OFFLINE',
        })
      )
      expect(await bittrexAdapter.isOrderbookLive()).toEqual(false)
    })
  })
})
