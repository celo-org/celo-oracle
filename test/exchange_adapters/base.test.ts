import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import fetch from 'node-fetch'
import { baseLogger } from '../../src/default_config'
import {
  BaseExchangeAdapter,
  ExchangeDataType,
  Ticker,
  Trade,
} from '../../src/exchange_adapters/base'
import { ExchangeApiRequestError, MetricCollector } from '../../src/metric_collector'
import { Exchange, ExternalCurrency, MS_PER_MINUTE, MS_PER_SECOND } from '../../src/utils'

jest.mock('@celo/contractkit')
jest.mock('node-fetch')
jest.mock('../../src/metric_collector')

const { Response } = jest.requireActual('node-fetch')

const now = Date.now()

export class MockAdapter extends BaseExchangeAdapter {
  baseApiUrl = 'https://api.mock.com/api/v1.1'
  _exchangeName = Exchange.COINBASE
  _certFingerprint256 = undefined

  async fetchTicker(): Promise<Ticker> {
    throw new Error('does not work yet')
  }

  async fetchTrades(): Promise<Trade[]> {
    return Promise.resolve([
      {
        source: this.exchangeName,
        id: 'id',
        timestamp: now,
        symbol: this.generatePairSymbol(),
        price: new BigNumber(123),
        amount: new BigNumber(321),
        cost: new BigNumber(12),
      },
    ])
  }

  protected generatePairSymbol(): string {
    return this.standardPairSymbol
  }

  async isOrderbookLive(): Promise<boolean> {
    return Promise.resolve(true)
  }
}

describe('BaseExchangeAdapter', () => {
  let adapter: BaseExchangeAdapter
  let metricCollector: MetricCollector

  beforeEach(() => {
    metricCollector = new MetricCollector(baseLogger)
    adapter = new MockAdapter({
      baseCurrency: CeloContract.GoldToken,
      baseLogger,
      dataRetentionWindow: 10 * MS_PER_MINUTE,
      quoteCurrency: ExternalCurrency.USD,
      fetchFrequency: 5 * MS_PER_SECOND,
      metricCollector,
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  describe('fetchFromApi', () => {
    let metricArgs: string[]
    beforeEach(() => {
      metricArgs = [adapter.exchangeName, 'trade/endpoint/CELO-USD', adapter.standardPairSymbol]
    })

    describe('when orderbook is not live', () => {
      beforeEach(() => {
        jest.spyOn(adapter, 'isOrderbookLive').mockImplementation(() => Promise.resolve(false))
        // @ts-ignore
        fetch.mockReturnValue(Promise.resolve(new Response('{}')))
      })

      for (const dataType of Object.keys(ExchangeDataType)) {
        if (dataType === ExchangeDataType.ORDERBOOK_STATUS) {
          continue
        }

        const path = `CELO-USD/${dataType.toLowerCase()}`

        it(`throws an error when trying to fetch ${dataType} and collects metrics`, async () => {
          await expect(async () =>
            adapter.fetchFromApi(ExchangeDataType.TICKER, path)
          ).rejects.toThrowError('Orderbook liveness check failed')

          expect(metricCollector.exchangeApiRequestError).toBeCalledWith(
            adapter.exchangeName,
            path,
            adapter.standardPairSymbol,
            ExchangeApiRequestError.ORDERBOOK_STATUS
          )
        })
      }
    })

    describe('when orderbook is live', () => {
      const mockJsonResponse = '{"fake": "jsonValue"}'
      beforeEach(() => {
        jest.spyOn(adapter, 'isOrderbookLive').mockImplementation(() => Promise.resolve(true))
        // @ts-ignore ockReturnValue is added by jest and is not in the fetch type signature
        fetch.mockReturnValue(Promise.resolve(new Response(mockJsonResponse, { status: 200 })))
      })

      for (const dataType of [ExchangeDataType.TICKER, ExchangeDataType.TRADE]) {
        it(`returns a parsed json response for ${dataType}`, async () => {
          const path = `CELO-USD/${dataType.toLowerCase()}`
          const response = await adapter.fetchFromApi(dataType, path)

          expect(response).toEqual({ fake: 'jsonValue' })

          expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path), expect.anything())
        })
      }

      it('collects metrics', async () => {
        await adapter.fetchFromApi(ExchangeDataType.TRADE, 'trade/endpoint/CELO-USD')
        expect(metricCollector.exchangeApiRequestDuration).toBeCalledWith(
          ...metricArgs,
          expect.anything()
        )
      })

      it('collects metrics on error code', async () => {
        // @ts-ignore - mockReturnValue is added by jest and is not in the fetch type signature
        fetch.mockReturnValue(Promise.resolve(new Response('', { status: 500 })))

        await expect(async () =>
          adapter.fetchFromApi(ExchangeDataType.TRADE, `trade/endpoint/CELO-USD`)
        ).rejects.toThrowError(`Bad fetch status code 500`)

        expect(metricCollector.exchangeApiRequestDuration).toBeCalledWith(
          ...metricArgs,
          expect.anything()
        )
        expect(metricCollector.exchangeApiRequestError).toBeCalledWith(...metricArgs, 500)
      })

      it('throws if the json cannot be parsed', async () => {
        // @ts-ignore - mockReturnValue is added by jest and is not in the fetch type signature
        fetch.mockReturnValue(
          Promise.resolve(new Response('<html>blah blah not json</html>', { status: 200 }))
        )
        await expect(async () =>
          adapter.fetchFromApi(ExchangeDataType.TRADE, `trade/endpoint/CELO-USD`)
        ).rejects.toThrowError(
          'Failed to parse JSON response: FetchError: invalid json response body at  reason: Unexpected token < in JSON at position 0'
        )
        expect(metricCollector.exchangeApiRequestError).toBeCalledWith(
          ...metricArgs,
          ExchangeApiRequestError.JSON_PARSE
        )
      })
    })
  })
})
