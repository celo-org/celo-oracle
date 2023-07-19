import { Exchange, ExternalCurrency } from '../../src/utils'

import BigNumber from 'bignumber.js'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { MercadoAdapter } from '../../src/exchange_adapters/mercado'
import { baseLogger } from '../../src/default_config'

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

  const validOrderbookJson = {
    asks: [
      ['117275.49879111', '0.0256'],
      ['117532.16627745', '0.01449'],
    ],
    bids: [
      ['117223.32117', '0.00001177'],
      ['117200', '0.00002'],
    ],
  }

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

  const inValidOrderbookJson = {
    asks: [[], ['117532.16627745', '0.01449']],
    bids: [[], ['117200', '0.00002']],
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = mercadoAdapter.parseTicker(validMockTickerJson, validOrderbookJson)
      expect(ticker).toEqual({
        source: Exchange.MERCADO,
        symbol: mercadoAdapter.standardPairSymbol,
        ask: new BigNumber(117275.49879111),
        baseVolume: new BigNumber(52.00314436),
        bid: new BigNumber(117223.32117),
        lastPrice: new BigNumber(119548.04744932),
        quoteVolume: new BigNumber(52.00314436).multipliedBy(new BigNumber(119548.04744932)),
        timestamp: 1674561363,
      })
    })

    it('throws an error when a json field mapped to a required ticker field is missing or empty', () => {
      expect(() => {
        mercadoAdapter.parseTicker(inValidMockTickerJson, inValidOrderbookJson)
      }).toThrowError('bid, ask, lastPrice, baseVolume not defined')
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
