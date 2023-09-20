import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import BigNumber from 'bignumber.js'
import { Exchange } from '../utils'
import { strict as assert } from 'assert'

enum ResponseKeys {
  fromCurrency = '1. From_Currency Code',
  toCurrency = '3. To_Currency Code',
  rate = '5. Exchange Rate',
  lastUpdated = '6. Last Refreshed',
  timezone = '7. Time Zone',
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
  // alphavantage.co - validity not after: 16/12/2023, 01:59:54 CET
  readonly _certFingerprint256 =
    'E3:0F:48:D9:B0:5B:B6:69:45:1A:45:4A:D8:C7:98:09:04:32:AB:28:53:5D:E0:10:0B:C1:3F:38:06:4C:6F:15'

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
    const dateString = `${response[ResponseKeys.lastUpdated]} UTC`
    assert(
      from === this.config.baseCurrency,
      `From currency mismatch in response: ${from} != ${this.config.baseCurrency}`
    )
    assert(
      to === this.config.quoteCurrency,
      `To currency mismatch in response: ${to} != ${this.config.quoteCurrency}`
    )

    assert(
      response[ResponseKeys.timezone] === 'UTC',
      `Timezone mismatch in response: ${response[ResponseKeys.timezone]} != UTC`
    )

    const lastPrice = this.safeBigNumberParse(response[ResponseKeys.rate])!
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(response[ResponseKeys.ask])!,
      bid: this.safeBigNumberParse(response[ResponseKeys.bid])!,
      lastPrice,
      timestamp: this.safeDateParse(dateString)! / 1000,
      // These FX API's do not provide volume data,
      // therefore we set all of them to 1 to weight them equally.
      baseVolume: new BigNumber(1),
      quoteVolume: lastPrice, // baseVolume * lastPrice, so 1 * lastPrice in this case
    }
    this.verifyTicker(ticker)
    return ticker
  }

  async isOrderbookLive(): Promise<boolean> {
    return true
  }
}
