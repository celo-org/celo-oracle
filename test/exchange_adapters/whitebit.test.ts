import { WhitebitAdapter } from '../../src/exchange_adapters/whitebit'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { baseLogger } from '../../src/default_config'
import { Exchange, ExternalCurrency } from '../../src/utils'
import BigNumber from 'bignumber.js'

describe('Whitebit adapter', () => {
  let whitebitAdapter: WhitebitAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.USDC,
    baseLogger,
    quoteCurrency: ExternalCurrency.USDT,
  }

  beforeEach(() => {
    whitebitAdapter = new WhitebitAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = {
    ask: 0.9,
    base_volume: 23401032.8528,
    bid: 0.98,
    last_price: 0.9998,
    quote_volume: 23399576.58906071,
    timestamp: 0,
  }

  const inValidMockTickerJson = { 
    quote_volume: 23399576.58906071,
    timestamp: 0,
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', async () => {
      const ticker = await whitebitAdapter.parseTicker(validMockTickerJson)

      expect(ticker).toEqual({
        source: Exchange.WHITEBIT,
        symbol: whitebitAdapter.standardPairSymbol,
        ask: new BigNumber(0.9),
        baseVolume: new BigNumber(23401032.8528),
        bid: new BigNumber(0.98),
        lastPrice: new BigNumber(0.9998),
        quoteVolume: new BigNumber('23399576.58906071'),
        timestamp: 0,
      })
    })

    it('throws an error when a json field mapped to a required ticker field is missing', () => {
      expect(() => {
        whitebitAdapter.parseTicker(inValidMockTickerJson)
      }).toThrowError(new Error('bid, ask, lastPrice, baseVolume not defined'))
    })
  })

  describe('isOrderbookLive', () => {
    it("returns false when trading is not enabled", async () => {

      jest.spyOn(whitebitAdapter, 'fetchFromApi').mockReturnValue(
        Promise.resolve([
          {
            name: 'USDC_USDT',
            stock: 'SON',
            money: 'USD',
            stockPrec: '3',
            moneyPrec: '2',
            feePrec: '4',
            makerFee: '0.001',
            takerFee: '0.001',
            minAmount: '0.001',
            minTotal: '0.001',
            tradesEnabled: false,
            isCollateral: true,
            type: 'spot',
          },
        ])
      )
      expect(await whitebitAdapter.isOrderbookLive()).toEqual(false)
    })

    it('returns false when market is not spot', async () => {
      jest.spyOn(whitebitAdapter, 'fetchFromApi').mockReturnValue(
        Promise.resolve([
          {
            name: 'USDC_USDT',
            stock: 'SON',
            money: 'USD',
            stockPrec: '3',
            moneyPrec: '2',
            feePrec: '4',
            makerFee: '0.001',
            takerFee: '0.001',
            minAmount: '0.001',
            minTotal: '0.001',
            tradesEnabled: true,
            isCollateral: true,
            type: 'spotty',
          },
        ])
      )
      expect(await whitebitAdapter.isOrderbookLive()).toEqual(false)
    })

    it("returns true when trades are enabled and market is spot", async () => {
      jest.spyOn(whitebitAdapter, 'fetchFromApi').mockReturnValue(
        Promise.resolve([
          {
            name: 'USDC_USDT',
            stock: 'SON',
            money: 'USD',
            stockPrec: '3',
            moneyPrec: '2',
            feePrec: '4',
            makerFee: '0.001',
            takerFee: '0.001',
            minAmount: '0.001',
            minTotal: '0.001',
            tradesEnabled: true,
            isCollateral: true,
            type: 'spot',
          },
        ])
      )
      expect(await whitebitAdapter.isOrderbookLive()).toEqual(true)
    })
  })
})
