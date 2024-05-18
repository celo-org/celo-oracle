import { BaseExchangeAdapter, ExchangeDataType, Ticker } from '../../src/exchange_adapters/base'
import { Exchange, ExternalCurrency } from '../../src/utils'
import { ExchangeApiRequestError, MetricCollector } from '../../src/metric_collector'

import { CeloContract } from '@celo/contractkit'
import { baseLogger } from '../../src/default_config'
import fetch from 'node-fetch'
import { CertificateManager } from '../../src/certs_manager'

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
      certificateManager: new CertificateManager('', baseLogger),
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
          'Failed to parse JSON response: FetchError: invalid json response body at  reason: Unexpected token \'<\', "<html>blah"... is not valid JSON'
        )
        expect(metricCollector.exchangeApiRequestError).toBeCalledWith(
          ...metricArgs,
          ExchangeApiRequestError.JSON_PARSE
        )
      })
    })
  })

  describe('fxMarketsClosed', () => {
    describe('in markets closed hours', () => {
      it('returns true on Fridays after 22h', () => {
        expect(BaseExchangeAdapter.fxMarketsClosed(1680906067000)).toBe(true) // Fri, 07 Apr 2023 22:21:07
        expect(BaseExchangeAdapter.fxMarketsClosed(1695420000000)).toBe(true) // Fri, 22 Sep 2023 22:00:00
        expect(BaseExchangeAdapter.fxMarketsClosed(1680909071000)).toBe(true) // Fri, 07 Apr 2023 23:11:11
        expect(BaseExchangeAdapter.fxMarketsClosed(1695427199000)).toBe(true) // Fri, 22 Sep 2023 23:59:59
      })
      it('returns true the whole day on Saturday', () => {
        expect(BaseExchangeAdapter.fxMarketsClosed(1683331200000)).toBe(true) // Sat, 06 May 2023 00:00:00
        expect(BaseExchangeAdapter.fxMarketsClosed(1674290736000)).toBe(true) // Sat, 21 Jan 2023 08:45:36
        expect(BaseExchangeAdapter.fxMarketsClosed(1679750316000)).toBe(true) // Sat, 25 Mar 2023 13:18:36
        expect(BaseExchangeAdapter.fxMarketsClosed(1680393599000)).toBe(true) // Sat, 01 Apr 2023 23:59:59
      })
      it('returns true on Sunday before 22h', () => {
        expect(BaseExchangeAdapter.fxMarketsClosed(1683417615000)).toBe(true) // Sun, 07 May 2023 00:00:15
        expect(BaseExchangeAdapter.fxMarketsClosed(1687682715000)).toBe(true) // Sun, 25 Jun 2023 08:45:15
        expect(BaseExchangeAdapter.fxMarketsClosed(1690148715000)).toBe(true) // Sun, 23 Jul 2023 21:45:15
      })
    })

    describe('in markets open hours', () => {
      it('returns false on Friday before 22h', () => {
        expect(BaseExchangeAdapter.fxMarketsClosed(1679011200000)).toBe(false) // Fri, 17 Mar 2023 00:00:00
        expect(BaseExchangeAdapter.fxMarketsClosed(1679649322000)).toBe(false) // Fri, 24 Mar 2023 09:15:22
        expect(BaseExchangeAdapter.fxMarketsClosed(1687540510000)).toBe(false) // Fri, 22 Jun 2023 17:15:10
        expect(BaseExchangeAdapter.fxMarketsClosed(1682114399000)).toBe(false) // Fri, 21 Apr 2023 21:59:59
      })
      it('returns false on Sunday after 22h', () => {
        expect(BaseExchangeAdapter.fxMarketsClosed(1687730400000)).toBe(false) // Sun, 25 Jun 2023 22:00:00
        expect(BaseExchangeAdapter.fxMarketsClosed(1696803439000)).toBe(false) // Sun, 08 Oct 2023 22:17:19
        expect(BaseExchangeAdapter.fxMarketsClosed(1675641599000)).toBe(false) // Sun, 05 Feb 2023 23:59:59
        expect(BaseExchangeAdapter.fxMarketsClosed(1679872500000)).toBe(false) // Sun, 26 Mar 2023 23:15:00
      })
      it('returns false other days of the week', () => {
        expect(BaseExchangeAdapter.fxMarketsClosed(1696889159000)).toBe(false) // Mon, 09 Oct 2023 22:05:59
        expect(BaseExchangeAdapter.fxMarketsClosed(1672784239000)).toBe(false) // Tue, 03 Jan 2023 22:17:19
        expect(BaseExchangeAdapter.fxMarketsClosed(1693973159000)).toBe(false) // Wed, 06 Sep 2023 04:05:59
        expect(BaseExchangeAdapter.fxMarketsClosed(1686268799000)).toBe(false) // Thu, 08 Jun 2023 23:59:59
        expect(BaseExchangeAdapter.fxMarketsClosed(1676038639000)).toBe(false) // Fri, 10 Feb 2023 14:17:19
      })
    })
  })
})
