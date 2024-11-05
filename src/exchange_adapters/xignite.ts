import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import BigNumber from 'bignumber.js'
import { Exchange } from '../utils'
import { strict as assert } from 'assert'

export class XigniteAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://globalcurrencies.xignite.com/xGlobalCurrencies.json'
  readonly _exchangeName: Exchange = Exchange.XIGNITE
  // Amazon RSA 2048 M02 - validity not after: 23/08/2030, 19:25:30 GMT-3
  readonly _certFingerprint256 =
    'BF:8A:69:02:7B:CC:8D:2D:42:A6:E6:D2:5B:DD:48:73:F6:A3:4B:8F:90:ED:F0:7E:86:C5:D6:91:6D:A0:B9:33'

  protected generatePairSymbol(): string {
    const base = XigniteAdapter.standardTokenSymbolMap.get(this.config.baseCurrency)
    const quote = XigniteAdapter.standardTokenSymbolMap.get(this.config.quoteCurrency)

    return `${base}${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    assert(this.config.apiKey !== undefined, 'XigniteAdapter API key was not set')

    const tickerJson = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `GetRealTimeRate?Symbol=${this.pairSymbol}&_token=${this.config.apiKey}`
    )
    return this.parseTicker(tickerJson)
  }

  /**
   *
   * @param json parsed response from Xignite's rate endpoint
   * {
   *  "BaseCurrency": "EUR",
   *  "QuoteCurrency": "XOF",
   *  "Symbol": "EURXOF",
   *  "Date": "09/29/2023",
   *  "Time": "9:59:50 PM",
   *  "QuoteType": "Calculated",
   *  "Bid": 653.626,
   *  "Mid": 654.993,
   *  "Ask": 656.36,
   *  "Spread": 2.734,
   *  "Text": "1 European Union euro = 654.993 West African CFA francs",
   *  "Source": "Rates calculated by crossing via ZAR(Morningstar).",
   *  "Outcome": "Success",
   *  "Message": null,
   * "Identity": "Request",
   *  "Delay": 0.0032363
   * }
   */
  parseTicker(json: any): Ticker {
    assert(
      json.BaseCurrency === this.config.baseCurrency,
      `Base currency mismatch in response: ${json.BaseCurrency} != ${this.config.baseCurrency}`
    )
    assert(
      json.QuoteCurrency === this.config.quoteCurrency,
      `Quote currency mismatch in response: ${json.QuoteCurrency} != ${this.config.quoteCurrency}`
    )

    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json.Ask)!,
      bid: this.safeBigNumberParse(json.Bid)!,
      lastPrice: this.safeBigNumberParse(json.Mid)!,
      timestamp: this.toUnixTimestamp(json.Date, json.Time),
      // These FX API's do not provide volume data,
      // therefore we set all of them to 1 to weight them equally
      baseVolume: new BigNumber(1),
      quoteVolume: new BigNumber(1),
    }
    this.verifyTicker(ticker)
    return ticker
  }

  toUnixTimestamp(date: string, time: string): number {
    const [month, day, year] = date.split('/').map(Number) // date format: MM/DD/YYYY
    const [hours, minutes, seconds] = time.split(' ')[0].split(':').map(Number) // time format: HH:MM:SS AM/PM

    let adjustedHours = hours
    if (time.includes('PM') && hours !== 12) adjustedHours += 12
    if (time.includes('AM') && hours === 12) adjustedHours = 0

    // month should be 0-indexed
    return Date.UTC(year, month - 1, day, adjustedHours, minutes, seconds) / 1000
  }

  async isOrderbookLive(): Promise<boolean> {
    return !BaseExchangeAdapter.fxMarketsClosed(Date.now())
  }
}
