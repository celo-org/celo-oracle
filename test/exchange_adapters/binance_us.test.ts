import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import { baseLogger } from '../../src/default_config'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { BinanceUSAdapter } from '../../src/exchange_adapters/binance_us'
import { Exchange, ExternalCurrency } from '../../src/utils'

describe('binanceUSAdapter', () => {
  let binanceUSAdapter: BinanceUSAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: CeloContract.GoldToken,
    baseLogger,
    quoteCurrency: ExternalCurrency.BTC,
  }
  beforeEach(() => {
    binanceUSAdapter = new BinanceUSAdapter(config)
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })
  describe('parseTicker', () => {
    const tickerJson = {
      symbol: 'CELOBTC',
      priceChange: '0.00000115',
      priceChangePercent: '1.427',
      weightedAvgPrice: '0.00008156',
      prevClosePrice: '0.00008051',
      lastPrice: '0.00008174',
      lastQty: '100.00000000',
      bidPrice: '0.00008159',
      bidQty: '18.40000000',
      askPrice: '0.00008185',
      askQty: '100.00000000',
      openPrice: '0.00008059',
      highPrice: '0.00008386',
      lowPrice: '0.00007948',
      volume: '149857.10000000',
      quoteVolume: '12.22296665',
      openTime: 1614604599055,
      closeTime: 1614690999055,
      firstId: 850037,
      lastId: 855106,
      count: 5070,
    }
    it('handles a response that matches the documentation', () => {
      expect(binanceUSAdapter.parseTicker(tickerJson)).toEqual({
        source: Exchange.BINANCEUS,
        symbol: binanceUSAdapter.standardPairSymbol,
        ask: new BigNumber(0.00008185),
        baseVolume: new BigNumber(149857.1),
        bid: new BigNumber(0.00008159),
        high: new BigNumber(0.00008386),
        lastPrice: new BigNumber(0.00008174),
        low: new BigNumber(0.00007948),
        open: new BigNumber(0.00008059),
        quoteVolume: new BigNumber(12.22296665),
        timestamp: 1614690999055,
      })
    })
    // timestamp, bid, ask, lastPrice, baseVolume
    const requiredFields = ['askPrice', 'bidPrice', 'lastPrice', 'closeTime', 'volume']

    for (const field of Object.keys(tickerJson)) {
      // @ts-ignore
      const { [field]: _removed, ...incompleteTickerJson } = tickerJson
      if (requiredFields.includes(field)) {
        it(`throws an error if ${field} is missing`, () => {
          expect(() => {
            binanceUSAdapter.parseTicker(incompleteTickerJson)
          }).toThrowError()
        })
      } else {
        it(`parses a ticker if ${field} is missing`, () => {
          expect(() => {
            binanceUSAdapter.parseTicker(incompleteTickerJson)
          }).not.toThrowError()
        })
      }
    }
  })

  describe('isOrderbookLive', () => {
    // Note: in the real response, these contain much more info. Only relevant
    // fields are included in this test
    const mockCeloUsdInfo = {
      symbol: 'CELOBTC',
      status: 'TRADING',
      orderTypes: ['LIMIT', 'LIMIT_MAKER', 'MARKET', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT_LIMIT'],
      isSpotTradingAllowed: true,
      isMarginTradingAllowed: false,
    }
    const mockOtherInfo = {
      symbol: 'BTCUSD',
      status: 'TRADING',
      orderTypes: ['LIMIT', 'LIMIT_MAKER', 'MARKET', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT_LIMIT'],
      isSpotTradingAllowed: true,
      isMarginTradingAllowed: false,
    }
    const mockStatusJson = {
      timezone: 'UTC',
      serverTime: 1605887014867,
      rateLimits: [],
      exchangeFilters: [],
      symbols: [mockOtherInfo, mockCeloUsdInfo],
    }

    it('returns false if the symbol is not found', async () => {
      jest.spyOn(binanceUSAdapter, 'fetchFromApi').mockReturnValue(
        Promise.resolve({
          ...mockStatusJson,
          symbols: [mockOtherInfo, mockOtherInfo, mockOtherInfo],
        })
      )
      expect(await binanceUSAdapter.isOrderbookLive()).toEqual(false)
    })

    const otherStatuses = [
      'PRE_TRADING',
      'POST_TRADING',
      'END_OF_DAY',
      'HALT',
      'AUCTION_MATCH',
      'BREAK',
    ]
    for (const status of otherStatuses) {
      it(`returns false if the status is ${status}`, async () => {
        jest.spyOn(binanceUSAdapter, 'fetchFromApi').mockReturnValue(
          Promise.resolve({
            ...mockStatusJson,
            symbols: [{ ...mockCeloUsdInfo, status }, mockOtherInfo],
          })
        )
        expect(await binanceUSAdapter.isOrderbookLive()).toEqual(false)
      })
    }

    it('returns false if isSpotTradingAllowed is false', async () => {
      jest.spyOn(binanceUSAdapter, 'fetchFromApi').mockReturnValue(
        Promise.resolve({
          ...mockStatusJson,
          symbols: [{ ...mockCeloUsdInfo, isSpotTradingAllowed: false }, mockOtherInfo],
        })
      )
      expect(await binanceUSAdapter.isOrderbookLive()).toEqual(false)
    })

    it('returns false if both LIMIT or MARKET are not present in orderTypes', async () => {
      const invalidOrderTypesResponses = [
        ['LIMIT_MAKER', 'MARKET', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT_LIMIT'],
        ['LIMIT', 'LIMIT_MAKER', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT_LIMIT'],
        ['LIMIT_MAKER', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT_LIMIT'],
      ]
      for (const orderTypes of invalidOrderTypesResponses) {
        jest.spyOn(binanceUSAdapter, 'fetchFromApi').mockReturnValue(
          Promise.resolve({
            ...mockStatusJson,
            symbols: [{ ...mockCeloUsdInfo, orderTypes }, mockOtherInfo],
          })
        )
        expect(await binanceUSAdapter.isOrderbookLive()).toEqual(false)
      }
    })

    it('returns true if symbol is found, status === TRADING, isSpotTradingAllowed is true and orderTypes contains both LIMIT and MARKET', async () => {
      jest.spyOn(binanceUSAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(mockStatusJson))
      expect(await binanceUSAdapter.isOrderbookLive()).toEqual(true)
    })
  })
})
