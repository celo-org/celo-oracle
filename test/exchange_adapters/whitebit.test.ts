import { Exchange, ExternalCurrency } from '../../src/utils'
import { ExchangeAdapterConfig, ExchangeDataType } from '../../src/exchange_adapters/base'

import BigNumber from 'bignumber.js'
import { WhitebitAdapter } from '../../src/exchange_adapters/whitebit'
import { baseLogger } from '../../src/default_config'
import { CertificateManager } from '../../src/certs_manager'

// Mock data
const validMockTickerJson = {
  ask: 0.95,
  base_volume: 23401032.8528,
  bid: 0.9,
  last_price: 0.9998,
  quote_volume: 23399576.58906071,
  timestamp: 0,
}

const inValidMockTickerJson = {
  quote_volume: 23399576.58906071,
  timestamp: 0,
}

const mockValidTickerData = {
  '1INCH_BTC': {
    base_id: 8104,
    quote_id: 1,
    last_price: '0.0000246',
    quote_volume: '1.16888304',
    base_volume: '48268',
    isFrozen: false,
    change: '0.94',
  },
  USDC_USDT: {
    base_id: 8104,
    quote_id: 1,
    last_price: '0.9876',
    quote_volume: '1.16888304',
    base_volume: '48268',
    isFrozen: false,
    change: '0.94',
  },
}

const mockValidOrderbookData = {
  timestamp: 1676047317,
  asks: [['1.001', '5486968.7515']],
  bids: [['0.999', '385192']],
}

describe('Whitebit adapter', () => {
  let whitebitAdapter: WhitebitAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.USDC,
    baseLogger,
    certificateManager: new CertificateManager(baseLogger, ''),
    quoteCurrency: ExternalCurrency.USDT,
  }
  beforeEach(() => {
    whitebitAdapter = new WhitebitAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  describe('fetchFromApi', () => {
    let fetchFromApiSpy: jest.SpyInstance
    beforeEach(() => {
      fetchFromApiSpy = jest.spyOn(whitebitAdapter, 'fetchFromApi')
      fetchFromApiSpy
        .mockReturnValueOnce(mockValidTickerData)
        .mockReturnValueOnce(mockValidOrderbookData)
    })

    it('calls correct endpoints on whitebit api', async () => {
      fetchFromApiSpy
        .mockReturnValueOnce(mockValidTickerData)
        .mockReturnValueOnce(mockValidOrderbookData)

      await whitebitAdapter.fetchTicker()
      expect(fetchFromApiSpy).toHaveBeenCalledTimes(2)
      expect(fetchFromApiSpy).toHaveBeenNthCalledWith(1, ExchangeDataType.TICKER, 'ticker')
      expect(fetchFromApiSpy).toHaveBeenNthCalledWith(
        2,
        ExchangeDataType.TICKER,
        'orderbook/USDC_USDT?limit=1&level=2&'
      )
    })

    it('calls parseTicker with the right parameters', async () => {
      const parseTickerSpy = jest.spyOn(whitebitAdapter, 'parseTicker')
      await whitebitAdapter.fetchTicker()

      expect(parseTickerSpy).toHaveBeenCalledTimes(1)
      expect(parseTickerSpy).toHaveBeenCalledWith({
        ...mockValidTickerData.USDC_USDT,
        ask: mockValidOrderbookData.asks[0][0],
        bid: mockValidOrderbookData.bids[0][0],
      })
    })
  })

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', async () => {
      const ticker = await whitebitAdapter.parseTicker(validMockTickerJson)

      expect(ticker).toEqual({
        source: Exchange.WHITEBIT,
        symbol: whitebitAdapter.standardPairSymbol,
        ask: new BigNumber(0.95),
        baseVolume: new BigNumber(23401032.8528),
        bid: new BigNumber(0.9),
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
    const statusResponse = {
      name: 'USDC_USDT',
      tradesEnabled: true,
      type: 'spot',
    }

    it('returns false when trading is not enabled', async () => {
      jest.spyOn(whitebitAdapter, 'fetchFromApi').mockReturnValue(
        Promise.resolve([
          {
            ...statusResponse,
            tradesEnabled: false,
          },
        ])
      )
      expect(await whitebitAdapter.isOrderbookLive()).toEqual(false)
    })

    it('returns false when market is not spot', async () => {
      jest.spyOn(whitebitAdapter, 'fetchFromApi').mockReturnValue(
        Promise.resolve([
          {
            ...statusResponse,
            type: 'spotty',
          },
        ])
      )
      expect(await whitebitAdapter.isOrderbookLive()).toEqual(false)
    })

    it('returns true when trades are enabled and market is spot', async () => {
      jest.spyOn(whitebitAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve([statusResponse]))
      expect(await whitebitAdapter.isOrderbookLive()).toEqual(true)
    })
  })
})
