import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import BigNumber from 'bignumber.js'
import { Exchange } from '../utils'
import { strict as assert } from 'assert'

export class CurrencyApiAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.currencyapi.com/v3'
  readonly _exchangeName: Exchange = Exchange.CURRENCYAPI
  // currencyapi.com - validity not after: 21/11/2023, 22:54:40 CET
  readonly _certFingerprint256 =
    '06:70:90:2E:07:43:A3:8C:25:2F:C4:35:F7:C4:F5:3A:12:9D:66:9A:95:6B:DC:C1:54:C1:FC:6A:BA:3B:B5:36'

  protected generatePairSymbol(): string {
    const base = CurrencyApiAdapter.standardTokenSymbolMap.get(this.config.baseCurrency)
    const quote = CurrencyApiAdapter.standardTokenSymbolMap.get(this.config.quoteCurrency)

    return `${base}${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    assert(this.config.apiKey !== undefined, 'CurrencyApi API key was not set')

    const base = this.config.baseCurrency
    const quote = this.config.quoteCurrency

    const tickerJson: Response = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `latest?base_currency=${base}&currencies=${quote}&apikey=${this.config.apiKey}`
    )
    return this.parseTicker(tickerJson)
  }

  /**
   *
   * @param json parsed response from CurrencyApi latest endpoint
    {
      "meta": {
        "last_updated_at": "2023-09-08T09:36:59Z"
      },
      "data": {
        "XOF": {
          "code": "XOF",
          "value": 655.8426513119
        }
      }
    }
   */
  parseTicker(json: any): Ticker {
    const response = json['data']
    assert(
      Object.keys(response).includes(this.config.quoteCurrency),
      'CurrencyApi response does not contain quote currency'
    )
    assert(
      json['meta']['last_updated_at'] !== undefined,
      'CurrencyApi response does not contain timestamp'
    )

    const price = this.safeBigNumberParse(response[this.config.quoteCurrency]['value'])!
    const ticker = {
      ...this.priceObjectMetadata,
      ask: price,
      bid: price,
      lastPrice: price,
      timestamp: this.safeDateParse(json['meta']['last_updated_at'])! / 1000,
      // These FX API's do not provide volume data,
      // therefore we set all of them to 1 to weight them equally.
      baseVolume: new BigNumber(1),
      quoteVolume: price, // baseVolume * lastPrice, so 1 * lastPrice in this case
    }
    this.verifyTicker(ticker)
    return ticker
  }

  async isOrderbookLive(): Promise<boolean> {
    // TODO: implement later once we have defined the weekend conditions for FX adapters.
    return true
  }
}
