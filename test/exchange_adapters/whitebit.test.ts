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
    source: 'WHITEBIT',
    symbol: 'USDC/USDT',
    ask: 0,
    base_volume: 23401032.8528,
    bid: 0,
    last_price: 0.9998,
    quote_volume: 23399576.58906071,
    timestamp: 0,
  }
  
  const inValidMockTickerJson = {
    source: 'WHITEBIT',
    symbol: 'USDC/USDT',
    quote_volume: 23399576.58906071,
    timestamp: 0,
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', async () => {
      const ticker = await whitebitAdapter.parseTicker(validMockTickerJson)
      
      expect(ticker).toEqual({
        source: Exchange.WHITEBIT,
        symbol: whitebitAdapter.standardPairSymbol,
        ask: new BigNumber(0),
        baseVolume: new BigNumber(23401032.8528),
        bid: new BigNumber(0),
        lastPrice: new BigNumber(0.9998),
        quoteVolume: new BigNumber('23399576.58906071'),
        timestamp: 0,
      })
    })

    // it('throws an error when ticker repsonse contains more than one pair', () => {
    //   expect(() => {
    //     krakenAdapter.parseTicker(inValidMockMultipleTickerJson)
    //   }).toThrowError('Unexpected number of pairs in ticker response: 2')
    // })

    it('throws an error when a json field mapped to a required ticker field is missing', () => {
      expect(() => {
        whitebitAdapter.parseTicker(inValidMockTickerJson)
      }).toThrowError('lastPrice, baseVolume not defined') //TODO: update me
    })
  })

  describe('isOrderbookLive', () => {
    it("returns false when status isn't pong", async () => {
      jest.spyOn(whitebitAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(['pang']))
      expect(await whitebitAdapter.isOrderbookLive()).toEqual(false)
    })

    it("returns true when status is 'pong'", async () => {
      jest.spyOn(whitebitAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(['pong']))
      expect(await whitebitAdapter.isOrderbookLive()).toEqual(true)
    })
  })
})
