import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import { baseLogger } from '../../src/default_config'
import { ExchangeAdapterConfig } from '../../src/exchange_adapters/base'
import { BitcointradeAdapter } from '../../src/exchange_adapters/bitcointrade'
import { Exchange, ExternalCurrency } from '../../src/utils'

describe('BitcointradeAdapter', () => {
  let bitcointradeAdapter: BitcointradeAdapter
  const config: ExchangeAdapterConfig = {
    baseCurrency: CeloContract.GoldToken,
    baseLogger,
    quoteCurrency: ExternalCurrency.BTC,
  }
  beforeEach(() => {
    bitcointradeAdapter = new BitcointradeAdapter(config)
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })
  describe('parseTicker', () => {
    const tickerJson = {
      data: {
        buy: 319010.89,
        date: '2021-12-02T16:25:45.558Z',
        high: 333000.01,
        last: 319010.89,
        low: 318005.01,
        sell: 320454.63,
        trades_quantity: 1441,
        volume: 9.03861641,
      },
      message: null,
    }
    it('handles a response that matches the documentation', () => {
      expect(bitcointradeAdapter.parseTicker(tickerJson)).toEqual({
        source: Exchange.BITCOINTRADE,
        symbol: bitcointradeAdapter.standardPairSymbol,
        ask: new BigNumber(320454.63),
        baseVolume: new BigNumber(9.03861641),
        bid: new BigNumber(319010.89),
        high: new BigNumber(333000.01),
        lastPrice: new BigNumber(319010.89),
        low: new BigNumber(318005.01),
        quoteVolume: new BigNumber(
          new BigNumber(319010.89).multipliedBy(new BigNumber(9.03861641))
        ),
        timestamp: 1638462345558,
      })
    })
    // timestamp, bid, ask, lastPrice, baseVolume
    const requiredFields = ['sell', 'buy', 'last', 'date', 'volume']

    for (const field of Object.keys(tickerJson.data)) {
      // @ts-ignore
      const { [field]: _removed, ...data } = tickerJson.data
      const incompleteTickerJson = { data }
      if (requiredFields.includes(field)) {
        it(`throws an error if ${field} is missing`, () => {
          expect(() => {
            bitcointradeAdapter.parseTicker(incompleteTickerJson)
          }).toThrowError()
        })
      } else {
        it(`parses a ticker if ${field} is missing`, () => {
          expect(() => {
            bitcointradeAdapter.parseTicker(incompleteTickerJson)
          }).not.toThrowError()
        })
      }
    }
  })

  describe('isOrderbookLive', () => {
    // Note: in the real response, these contain much more info. Only relevant
    // fields are included in this test
    const mockEnabled = {
      data: [
        {
          base: 'BTC',
          base_name: 'Bitcoin',
          enabled: true,
          min_amount: 0.00006282,
          min_value: 20,
          price_tick: 0.01,
          quote: 'BRL',
          quote_name: 'Brazilian real',
          symbol: 'BRLBTC',
        },
      ],
      message: null,
    }
    const mockDisabled = {
      data: [
        {
          base: 'BTC',
          base_name: 'Bitcoin',
          enabled: false,
          min_amount: 0.00006282,
          min_value: 20,
          price_tick: 0.01,
          quote: 'BRL',
          quote_name: 'Brazilian real',
          symbol: 'BRLBTC',
        },
      ],
      message: null,
    }

    it('returns true if "enabled" is true', async () => {
      jest.spyOn(bitcointradeAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(mockEnabled))
      expect(await bitcointradeAdapter.isOrderbookLive()).toEqual(true)
    })

    it('returns false if "enabled" is false', async () => {
      jest.spyOn(bitcointradeAdapter, 'fetchFromApi').mockReturnValue(Promise.resolve(mockDisabled))
      expect(await bitcointradeAdapter.isOrderbookLive()).toEqual(false)
    })
  })
})
