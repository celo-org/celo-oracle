import { KrakenAdapter } from '../../src/exchange_adapters/kraken'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { baseLogger } from '../../src/default_config'
import { Exchange, ExternalCurrency } from '../../src/utils'
import BigNumber from 'bignumber.js'

describe('kraken adapter', () => {
  let krakenAdapter: KrakenAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.USDC,
    baseLogger,
    quoteCurrency: ExternalCurrency.USD,
  }

  beforeEach(() => {
    krakenAdapter = new KrakenAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = {
    error: [],
    result: {
      USDCUSD: {
        a: ['1.00000000', '3881916', '3881916.000'],
        b: ['0.99990000', '1158130', '1158130.000'],
        c: ['0.99990000', '20839.31050808'],
        v: ['5847624.42992545', '22093459.42678782'],
        p: ['0.99991974', '0.99994190'],
        t: [694, 3056],
        l: ['0.99990000', '0.99990000'],
        h: ['1.00000000', '1.00000000'],
        o: '1.00000000',
      },
    },
  }

  const inValidMockMultipleTickerJson = {
    error: [],
    result: {
      USDCUSD: {
        a: [],
        b: [],
        c: [],
        v: [],
        p: [],
        t: [],
        l: [],
        h: [],
        o: '',
      },
      FARTBUXUSD: {
        a: [],
        b: [],
        c: [],
        v: [],
        p: [],
        t: [],
        l: [],
        h: [],
        o: '',
      }
    },
  }

  const inValidMockTickerJson = {
    error: [],
    result: {
      USDCUSD: {
        a: [],
        b: [],
        c: [],
        v: [],
        p: [],
        t: [],
        l: [],
        h: [],
        o: '',
      },
    },
  }

  const mockStatusJson = {
    error: [],
    result: {
      status: 'online',
      timestamp: '2023-01-12T14:10:47Z',
    },
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = krakenAdapter.parseTicker(validMockTickerJson)
      expect(ticker).toEqual({
        source: Exchange.KRAKEN,
        symbol: krakenAdapter.standardPairSymbol,
        ask: new BigNumber(1),
        baseVolume: new BigNumber(22093459.42678782),
        bid: new BigNumber(0.9999),
        lastPrice: new BigNumber(0.9999419),
        quoteVolume: new BigNumber('22092175.796795123627658'),
        timestamp: 0,
      })
    })

    it('throws an error when ticker repsonse contains more than one pair', () => {
      expect(() => {
        krakenAdapter.parseTicker(inValidMockMultipleTickerJson)
      }).toThrowError(
        'Unexpected number of pairs in ticker response: 2'
      )
    })

    it('throws an error when a json field mapped to a required ticker field is missing', () => {
      expect(() => {
        krakenAdapter.parseTicker(inValidMockTickerJson)
      }).toThrowError('bid, ask, lastPrice, baseVolume not defined')
    })
  })

  describe('isOrderbookLive', () => { 

    it("returns false when status isn't online", async () => {
       
        const response = {
          error: [],
          result: {
            status: 'maintainance',
            timestamp: '2023-01-12T14:10:47Z',
          },
        }

        jest.spyOn(krakenAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(response))
        expect(await krakenAdapter.isOrderbookLive()).toEqual(false)
     
    })
    it("returns true when status is 'online'", async () => {
      jest.spyOn(krakenAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(mockStatusJson))
      expect(await krakenAdapter.isOrderbookLive()).toEqual(true)
    })
  })
})
