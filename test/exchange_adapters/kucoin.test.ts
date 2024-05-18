import { Exchange, ExternalCurrency } from '../../src/utils'

import BigNumber from 'bignumber.js'
import { CeloContract } from '@celo/contractkit'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { KuCoinAdapter } from '../../src/exchange_adapters/kucoin'
import { baseLogger } from '../../src/default_config'
import { CertificateManager } from '../../src/certs_manager'

describe('KuCoin adapter', () => {
  let kucoinAdapter: KuCoinAdapter

  const config: ExchangeAdapterConfig = {
    baseCurrency: CeloContract.GoldToken,
    baseLogger,
    certificateManager: new CertificateManager(baseLogger, ''),
    quoteCurrency: ExternalCurrency.USDT,
  }

  beforeEach(() => {
    kucoinAdapter = new KuCoinAdapter(config)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  const validMockTickerJson = {
    code: '200000',
    data: {
      time: 1674501725001,
      ticker: [
        {
          symbol: 'NKN-USDT',
          symbolName: 'NKN-USDT',
          buy: '0.105492',
          sell: '0.105599',
          changeRate: '0.0243',
          changePrice: '0.00251',
          high: '0.107398',
          low: '0.100304',
          vol: '935258.2908',
          volValue: '97271.9733359816',
          last: '0.10551',
          averagePrice: '0.10380346',
          takerFeeRate: '0.001',
          makerFeeRate: '0.001',
          takerCoefficient: '1',
          makerCoefficient: '1',
        },
        {
          symbol: 'CELO-USDT',
          symbolName: 'CELO-USDT',
          buy: '0.7555',
          sell: '0.7563',
          changeRate: '0.0907',
          changePrice: '0.0629',
          high: '0.8281',
          low: '0.6654',
          vol: '1598294.854',
          volValue: '1213224.94637127',
          last: '0.7561',
          averagePrice: '0.75703415',
          takerFeeRate: '0.001',
          makerFeeRate: '0.001',
          takerCoefficient: '1',
          makerCoefficient: '1',
        },
      ],
    },
  }

  const inValidMockTickerJson = {
    code: '200000',
    data: {
      time: undefined,
      ticker: [
        {
          symbol: 'NKN-USDT',
          symbolName: 'NKN-USDT',
          buy: '0.105492',
          sell: '0.105599',
          changeRate: '0.0243',
          changePrice: '0.00251',
          high: '0.107398',
          low: '0.100304',
          vol: '935258.2908',
          volValue: '97271.9733359816',
          last: '0.10551',
          averagePrice: '0.10380346',
          takerFeeRate: '0.001',
          makerFeeRate: '0.001',
          takerCoefficient: '1',
          makerCoefficient: '1',
        },
        {
          symbol: 'CELO-USDT',
          symbolName: 'CELO-USDT',
          buy: undefined,
          sell: undefined,
          changeRate: '0.0907',
          changePrice: '0.0629',
          high: '0.8281',
          low: '0.6654',
          vol: undefined,
          volValue: undefined,
          last: undefined,
          averagePrice: '0.75703415',
          takerFeeRate: '0.001',
          makerFeeRate: '0.001',
          takerCoefficient: '1',
          makerCoefficient: '1',
        },
      ],
    },
  }

  describe('parseTicker', () => {
    it('handles a response that matches the documentation', () => {
      const ticker = kucoinAdapter.parseTicker(validMockTickerJson)
      expect(ticker).toEqual({
        source: Exchange.KUCOIN,
        symbol: kucoinAdapter.standardPairSymbol,
        ask: new BigNumber(0.7563),
        baseVolume: new BigNumber(1598294.854),
        bid: new BigNumber(0.7555),
        lastPrice: new BigNumber(0.7561),
        quoteVolume: new BigNumber(1213224.94637127),
        timestamp: 1674501725001,
      })
    })

    it('throws an error when a json field mapped to a required ticker field is missing or empty', () => {
      expect(() => {
        kucoinAdapter.parseTicker(inValidMockTickerJson)
      }).toThrowError('timestamp, bid, ask, lastPrice, baseVolume not defined')
    })
  })

  const validMockStatusJson = {
    code: '200000',
    data: [
      {
        symbol: 'LOKI-BTC',
        name: 'OXEN-BTC',
        baseCurrency: 'OXEN',
        quoteCurrency: 'BTC',
        feeCurrency: 'BTC',
        market: 'BTC',
        baseMinSize: '0.1',
        quoteMinSize: '0.00001',
        baseMaxSize: '10000000000',
        quoteMaxSize: '99999999',
        baseIncrement: '0.0001',
        quoteIncrement: '0.000000001',
        priceIncrement: '0.000000001',
        priceLimitRate: '0.1',
        minFunds: '0.000001',
        isMarginEnabled: false,
        enableTrading: true,
      },
      {
        symbol: 'CELO-USDT',
        name: 'CELO-USDT',
        baseCurrency: 'CELO',
        quoteCurrency: 'USDT',
        feeCurrency: 'USDT',
        market: 'USDS',
        baseMinSize: '0.1',
        quoteMinSize: '0.1',
        baseMaxSize: '10000000000',
        quoteMaxSize: '99999999',
        baseIncrement: '0.0001',
        quoteIncrement: '0.0001',
        priceIncrement: '0.0001',
        priceLimitRate: '0.1',
        minFunds: '0.1',
        isMarginEnabled: true,
        enableTrading: true,
      },
    ],
  }
  const inValidMockStatusJson = {
    code: '200000',
    data: [
      {
        symbol: 'LOKI-BTC',
        name: 'OXEN-BTC',
        baseCurrency: 'OXEN',
        quoteCurrency: 'BTC',
        feeCurrency: 'BTC',
        market: 'BTC',
        baseMinSize: '0.1',
        quoteMinSize: '0.00001',
        baseMaxSize: '10000000000',
        quoteMaxSize: '99999999',
        baseIncrement: '0.0001',
        quoteIncrement: '0.000000001',
        priceIncrement: '0.000000001',
        priceLimitRate: '0.1',
        minFunds: '0.000001',
        isMarginEnabled: false,
        enableTrading: true,
      },
      {
        symbol: 'CELO-USDT',
        name: 'CELO-USDT',
        baseCurrency: 'CELO',
        quoteCurrency: 'USDT',
        feeCurrency: 'USDT',
        market: 'USDS',
        baseMinSize: '0.1',
        quoteMinSize: '0.1',
        baseMaxSize: '10000000000',
        quoteMaxSize: '99999999',
        baseIncrement: '0.0001',
        quoteIncrement: '0.0001',
        priceIncrement: '0.0001',
        priceLimitRate: '0.1',
        minFunds: '0.1',
        isMarginEnabled: true,
        enableTrading: false,
      },
    ],
  }

  describe('isOrderbookLive', () => {
    it('returns true if enableTrading is true', async () => {
      jest
        .spyOn(kucoinAdapter, 'fetchFromApi')
        .mockReturnValue(Promise.resolve(validMockStatusJson))
      expect(await kucoinAdapter.isOrderbookLive()).toEqual(true)
    })

    it('returns false if enableTrading is false', async () => {
      jest
        .spyOn(kucoinAdapter, 'fetchFromApi')
        .mockReturnValue(Promise.resolve(inValidMockStatusJson))
      expect(await kucoinAdapter.isOrderbookLive()).toEqual(false)
    })
  })
})
