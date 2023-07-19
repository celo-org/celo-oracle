import {
  BaseExchangeAdapter,
  ExchangeDataType,
  Ticker,
} from '../../src/exchange_adapters/base'
import { Exchange, ExternalCurrency } from '../../src/utils'
import { ExchangeApiRequestError, MetricCollector } from '../../src/metric_collector'

import { CeloContract } from '@celo/contractkit'
import { baseLogger } from '../../src/default_config'
import fetch from 'node-fetch'

jest.mock('@celo/contractkit')
jest.mock('node-fetch')
jest.mock('../../src/metric_collector')

const { Response } = jest.requireActual('node-fetch')

export class MockAdapter extends BaseExchangeAdapter {
  baseApiUrl = 'https://api.mock.com/api/v1.1'
  _exchangeName = Exchange.COINBASE
  _certFingerprint256 = undefined

  async fetchTicker(): Promise<Ticker> {
    throw new Error('does not work yet')
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
  const mockTickerEndpoint = '/ticker/CELO-USD'

  beforeEach(() => {
    metricCollector = new MetricCollector(baseLogger)
    adapter = new MockAdapter({
      baseCurrency: CeloContract.GoldToken,
      baseLogger,
      quoteCurrency: ExternalCurrency.USD,
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
      metricArgs = [adapter.exchangeName, mockTickerEndpoint, adapter.standardPairSymbol]
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

      it(`returns a parsed json response for ticker`, async () => {
        const path = `CELO-USD/${ExchangeDataType.TICKER.toLowerCase()}`
        const response = await adapter.fetchFromApi(ExchangeDataType.TICKER, path)

        expect(response).toEqual({ fake: 'jsonValue' })

        expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path), expect.anything())
      })

      it('collects metrics', async () => {
        await adapter.fetchFromApi(ExchangeDataType.TICKER, mockTickerEndpoint)
        expect(metricCollector.exchangeApiRequestDuration).toBeCalledWith(
          ...metricArgs,
          expect.anything()
        )
      })

      it('collects metrics on error code', async () => {
        // @ts-ignore - mockReturnValue is added by jest and is not in the fetch type signature
        fetch.mockReturnValue(Promise.resolve(new Response('', { status: 500 })))

        await expect(async () =>
          adapter.fetchFromApi(ExchangeDataType.TICKER, mockTickerEndpoint)
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
          adapter.fetchFromApi(ExchangeDataType.TICKER, mockTickerEndpoint)
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
