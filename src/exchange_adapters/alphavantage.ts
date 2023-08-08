import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import BigNumber from 'bignumber.js'
import { Exchange } from '../utils'
import { strict as assert } from 'assert'

enum ResponseKeys {
  fromCurrency = '1. From_Currency Code',
  toCurrency = '3. To_Currency Code',
  rate = '5. Exchange Rate',
  lastUpdated = '6. Last Refreshed',
  bid = '8. Bid Price',
  ask = '9. Ask Price',
}

type ResponseData = {
  [K in ResponseKeys]: string
}

interface Response {
  'Realtime Currency Exchange Rate': ResponseData
}

export class AlphavantageAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://www.alphavantage.co'
  readonly _exchangeName: Exchange = Exchange.ALPHAVANTAGE
  readonly _certFingerprint256 =
    '3A:BB:E6:3D:AF:75:6C:50:16:B6:B8:5F:52:01:5F:D8:E8:AC:BE:27:7C:50:87:B1:27:A6:05:63:A8:41:ED:8A'

  protected generatePairSymbol(): string {
    const base = AlphavantageAdapter.standardTokenSymbolMap.get(this.config.baseCurrency)
    const quote = AlphavantageAdapter.standardTokenSymbolMap.get(this.config.quoteCurrency)

    return `${base}${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    assert(this.config.apiKey !== undefined, 'Alphavantage API key was not set')

    const base = this.config.baseCurrency
    const quote = this.config.quoteCurrency

    const tickerJson: Response = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote}&apikey=${this.config.apiKey}`
    )
    return this.parseTicker(tickerJson)
  }

  /**
   *
   * @param json parsed response from Alphavantage's rate endpoint
   *  {
   *    "Realtime Currency Exchange Rate": {
   *      "1. From_Currency Code": "XOF",
   *      "2. From_Currency Name": "CFA Franc BCEAO",
   *      "3. To_Currency Code": "EUR",
   *      "4. To_Currency Name": "Euro",
   *      "5. Exchange Rate": "0.00153000",
   *      "6. Last Refreshed": "2023-08-03 07:41:09",
   *      "7. Time Zone": "UTC",
   *      "8. Bid Price": "0.00152900",
   *      "9. Ask Price": "0.00153000"
   *    }
   *  }
   */
  parseTicker(json: Response): Ticker {
    const response = json['Realtime Currency Exchange Rate']

    const from = response[ResponseKeys.fromCurrency]
    const to = response[ResponseKeys.toCurrency]
    assert(
      from === this.config.baseCurrency,
      `From currency mismatch in response: ${from} != ${this.config.baseCurrency}`
    )
    assert(
      to === this.config.quoteCurrency,
      `To currency mismatch in response: ${to} != ${this.config.quoteCurrency}`
    )

    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(response[ResponseKeys.ask])!,
      bid: this.safeBigNumberParse(response[ResponseKeys.bid])!,
      lastPrice: this.safeBigNumberParse(response[ResponseKeys.rate])!,
      timestamp: this.toUnixTimestamp(response[ResponseKeys.lastUpdated]),
      // These FX API's do not provide volume data,
      // therefore we set all of them to 1 to weight them equally
      baseVolume: new BigNumber(1),
      quoteVolume: new BigNumber(1),
    }
    this.verifyTicker(ticker)
    return ticker
  }

  toUnixTimestamp(datetime: string): number {
    // datetime format: YYYY-MM-DD HH:MM:SS
    const date = datetime.split(' ')[0]
    const time = datetime.split(' ')[1]

    const [year, month, day] = date.split('-').map(Number)
    const [hours, minutes, seconds] = time.split(':').map(Number)

    // month should be 0-indexed
    return Date.UTC(year, month - 1, day, hours, minutes, seconds) / 1000
  }

  async isOrderbookLive(): Promise<boolean> {
    /*
      This check requires us to make a call to the ticker endpoint, however we can't
      use fetchTicker() because it creates a circular dependency: 
      fetchTicker requires isOrderbookLive under the hood, which requires fetchTicker, etc.

      Therefore we make a similar call using fetchFromApi() and the orderbook status type.

      We will have the same scenario for other adapters as well so we can find a nicer 
      way to do this in the future. 
    */
    const base = this.config.baseCurrency
    const quote = this.config.quoteCurrency

    const tickerJson: Response = await this.fetchFromApi(
      ExchangeDataType.ORDERBOOK_STATUS,
      `query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote}&apikey=${this.config.apiKey}`
    )
    const ticker = this.parseTicker(tickerJson)

    /*
      TODO: verify the behaviour of the ticker endpoit on the weekend.

      The check below assumes that the timestamp returned will stale on
      the weekend while the markets are closed.
    */
    const thirtyMinutesInSecs = 30 * 60

    const now = Date.now() / 1000
    const lastUpdated = ticker.timestamp // timestamp is already in seconds

    assert(now >= lastUpdated, `Ticker timestamp is in the future: ${now} < ${lastUpdated}`)
    return now - lastUpdated <= thirtyMinutesInSecs
  }
}