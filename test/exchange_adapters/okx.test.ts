import BigNumber from 'bignumber.js'
import { baseLogger } from '../../src/default_config'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { OKXAdapter } from '../../src/exchange_adapters/okx'
import { Exchange, ExternalCurrency } from '../../src/utils'
import { CeloContract } from '@celo/contractkit'

describe('OKXAdapter', () => {
  let okxAdapter: OKXAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: CeloContract.GoldToken,
    baseLogger,
    quoteCurrency: ExternalCurrency.USDT,
  }
  beforeEach(() => {
    okxAdapter = new OKXAdapter(config)
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })


  const mockTickerJson = {
      code:"0",
      msg:"",
      data:[
         {
            instType:"SPOT",
            instId:"CELO-USDT",
            last:"0.792",
            lastSz:"193.723363",
            askPx:"0.793",
            askSz:"802.496954",
            bidPx:"0.792",
            bidSz:"55.216944",
            open24h:"0.691",
            high24h:"0.828",
            low24h:"0.665",
            volCcy24h:"1642445.37682",
            vol24h:"2177089.719932",
            ts:"1674479195109",
            sodUtc0:"0.685",
            sodUtc8:"0.698"
         }
      ]
   }
   const mockFalseTickerJson = {
    code:"0",
    msg:"",
    data:[
       {
          instType:"SPOT",
          instId:"CELO-USDT",
          last: undefined,
          lastSz:"193.723363",
          askPx: undefined,
          askSz:"802.496954",
          bidPx: undefined,
          bidSz:"55.216944",
          open24h:"0.691",
          high24h:"0.828",
          low24h:"0.665",
          volCcy24h:undefined,
          vol24h:undefined,
          ts:undefined,
          sodUtc0:"0.685",
          sodUtc8:"0.698"
       }
    ]
 }

  describe('fetchTrades', () => {
    it('returns an empty array', async () => {
      const tradesFetched = await okxAdapter.fetchTrades()
      expect(tradesFetched).toEqual([])
    })
  })

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = okxAdapter.parseTicker(mockTickerJson)
      expect(ticker).toEqual({
        source: Exchange.OKX,
        symbol: okxAdapter.standardPairSymbol,
        ask: new BigNumber(0.793),
        baseVolume: new BigNumber(2177089.719932),
        bid: new BigNumber(0.792),
        lastPrice: new BigNumber(0.792),
        quoteVolume: new BigNumber(1642445.37682),
        timestamp: 1674479195109,
      })
    })

    it('throws an error when a json field mapped to a required ticker field is missing', () => {
      expect(() => {
        okxAdapter.parseTicker(mockFalseTickerJson,)
      }).toThrowError("timestamp, bid, ask, lastPrice, baseVolume not defined")
    })
  })

 describe('isOrderbookLive', () => {
    const mockStatusJson = {
      code:"0",
      "msg":"",
      "data":[]
   }

   it("returns false when code isn't 0", async () => {
    const response = { ...mockStatusJson, code: '1' }
    jest.spyOn(okxAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(response))
    expect(await okxAdapter.isOrderbookLive()).toEqual(false)
  })

  it("returns true when  code is 0", async () => {
    jest.spyOn(okxAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(mockStatusJson))
    expect(await okxAdapter.isOrderbookLive()).toEqual(true)
  })
  })
})
