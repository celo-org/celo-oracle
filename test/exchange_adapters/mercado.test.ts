import { MercadoAdapter } from '../../src/exchange_adapters/mercado'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { baseLogger } from '../../src/default_config'
import { Exchange, ExternalCurrency } from '../../src/utils'
import BigNumber from 'bignumber.js'

describe(' adapter', () => {
  let mercadoAdapter: MercadoAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: ExternalCurrency.USDC,
    baseLogger,
    quoteCurrency: ExternalCurrency.USD,
  }

  beforeEach(() => {
    mercadoAdapter = new MercadoAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = [
    {
      pair: 'BTC-BRL',
      high: '120700.00000000',
      low: '117000.00001000',
      vol: '52.00314436',
      last: '119548.04744932',
      buy: '119457.96889001',
      sell: '119546.04397687',
      open: '119353.86994450',
      date: 1674561363,
    },
  ]

  const inValidMockTickerJson = [
    {
      pair: 'BTC-BRL',
      high: '120700.00000000',
      low: '117000.00001000',
      vol: undefined,
      last: undefined,
      buy: '',
      sell: '',
      open: '119353.86994450',
      date: undefined,
    },
  ]

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = mercadoAdapter.parseTicker(validMockTickerJson)
      expect(ticker).toEqual({
        source: Exchange.MERCADO,
        symbol: mercadoAdapter.standardPairSymbol,
        ask: new BigNumber(119546.04397687),
        baseVolume: new BigNumber(52.00314436),
        bid: new BigNumber(119457.96889001),
        lastPrice: new BigNumber(119548.04744932),
        quoteVolume: new BigNumber(52.00314436).multipliedBy(new BigNumber(119548.04744932)),
        timestamp: 1674561363,
      })
    })

    it('throws an error when a json field mapped to a required ticker field is missing or empty', () => {
      expect(() => {
        mercadoAdapter.parseTicker(inValidMockTickerJson)
      }).toThrowError('bid, ask, lastPrice, baseVolume not defined')
    })
  })

  describe('fetchTrades', () => {
    it('returns empty array', async () => {
      expect(await mercadoAdapter.fetchTrades()).toEqual([])
    })
  })

  const mockStatusJson = {
    symbol: ['BTC-BRL'],
    description: ['Bitcoin'],
    currency: ['BRL'],
    'base-currency': ['BTC'],
    'exchange-listed': [true],
    'exchange-traded': [true],
    minmovement: ['1'],
    pricescale: [100000000],
    type: ['CRYPTO'],
    timezone: ['America/Sao_Paulo'],
    'session-regular': ['24x7'],
    'withdrawal-fee': ['0.0004'],
    'withdraw-minimum': ['0.001'],
    'deposit-minimum': ['0.00001'],
  }

  const mockWrongStatusJson = {
    symbol: ['BTC-BRL'],
    description: ['Bitcoin'],
    currency: ['BRL'],
    'base-currency': ['BTC'],
    'exchange-listed': [true],
    'exchange-traded': [false],
    minmovement: ['1'],
    pricescale: [100000000],
    type: ['CRYPTO'],
    timezone: ['America/Sao_Paulo'],
    'session-regular': ['24x7'],
    'withdrawal-fee': ['0.0004'],
    'withdraw-minimum': ['0.001'],
    'deposit-minimum': ['0.00001'],
  }

  describe('isOrderbookLive', () => {
    it('returns true', async () => {
      jest.spyOn(mercadoAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(mockStatusJson))
      expect(await mercadoAdapter.isOrderbookLive()).toEqual(true)
    })

    it('returns false when Orderbook is not live', async () => {
      jest
        .spyOn(mercadoAdapter, 'fetchFromApi')
        .mockReturnValue(Promise.resolve(mockWrongStatusJson))
      expect(await mercadoAdapter.isOrderbookLive()).toEqual(false)
    })
  })
})
