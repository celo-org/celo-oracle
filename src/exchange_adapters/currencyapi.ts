import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import BigNumber from 'bignumber.js'
import { Exchange } from '../utils'
import { strict as assert } from 'assert'

export class CurrencyApiAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://currencyapi.net/api/v1'
  readonly _exchangeName: Exchange = Exchange.CURRENCYAPI
  // currencyapi.net - validity not after: 05/12/2023, 10:03:39 CET
  readonly _certFingerprint256 =
    '8D:75:15:7A:96:A9:DD:A6:1D:A8:EE:58:6D:7A:A2:8D:71:E4:9B:1B:3D:09:D8:F2:F2:C2:31:6E:CC:0A:82:A7'

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
      `convert?key=${this.config.apiKey}&amount=1&from=${base}&to=${quote}&output=JSON`
    )
    return this.parseTicker(tickerJson)
  }

  /**
   *
   * @param json parsed response from CurrencyApi latest endpoint
   * {
   *   "valid": true,
   *   "updated": 1695168063,
   *   "conversion": {
   *     "amount": 1,
   *     "from": "EUR",
   *     "to": "XOF",
   *     "result": 655.315694
   *   }
   * }
   */
  parseTicker(json: any): Ticker {
    assert(json.valid, 'CurrencyApi response object contains false valid field')
    assert(json.conversion.amount === 1, 'CurrencyApi response object amount field is not 1')
    assert(
      json.conversion.from === this.config.baseCurrency,
      'CurrencyApi response object from field does not match base currency'
    )
    assert(
      json.conversion.to === this.config.quoteCurrency,
      'CurrencyApi response object to field does not match quote currency'
    )

    const price = this.safeBigNumberParse(json.conversion.result)!
    const ticker = {
      ...this.priceObjectMetadata,
      ask: price,
      bid: price,
      lastPrice: price,
      timestamp: this.safeBigNumberParse(json.updated)?.toNumber()!,
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
