import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import BigNumber from 'bignumber.js'
import { Exchange } from '../utils'
import { strict as assert } from 'assert'

export class XigniteAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://globalcurrencies.xignite.com/xGlobalCurrencies.json'
  readonly _exchangeName: Exchange = Exchange.XIGNITE
  readonly _certFingerprint256 =
    'AC:3B:21:EB:EE:92:8B:81:85:EF:85:DF:76:DE:9A:A0:2C:06:3D:D0:48:89:F2:29:76:9F:AB:E1:69:3A:D4:F4'

  private static readonly tokenSymbolMap = XigniteAdapter.standardTokenSymbolMap

  protected generatePairSymbol(): string {
    const base = XigniteAdapter.tokenSymbolMap.get(this.config.baseCurrency)
    const quote = XigniteAdapter.tokenSymbolMap.get(this.config.quoteCurrency)

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
    {
      "Spread": 0.000001521345,
      "Ask": 0.001525320678,
      "Mid": 0.001524560006,
      "Bid": 0.001523799333,
      "Delay": 0.0059974,
      "Outcome": "Success",
      "Source": "Rates calculated by crossing via ZAR(Morningstar,SwissQuote).",
      "Text": "1 West African CFA franc = 0.001524560006 European Union euro",
      "QuoteType": "Calculated",
      "Time": "10:35:49 AM",
      "Date": "07/26/2023",
      "Symbol": "XOFEUR",
      "QuoteCurrency": "EUR",
      "BaseCurrency": "XOF",
      "Identity": "Request",
      "Message": null
    }
  */
  parseTicker(json: any): Ticker {
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json.Ask)!,
      bid: this.safeBigNumberParse(json.Bid)!,
      lastPrice: this.safeBigNumberParse(json.Mid)!,
      timestamp: parseInt((Date.now() / 1000).toString()), // @XOF: Convert time and date in the response as a a unix timestamp
      // These FX API's do not provide volume data,
      // therefore we set all of them to 1 to weight them equally
      baseVolume: new BigNumber(1),
      quoteVolume: new BigNumber(1),
    }
    this.verifyTicker(ticker)
    return ticker
  }

  async isOrderbookLive(): Promise<boolean> {
    // @XOF: update this later on
    // Current idea would be to call fetch ticker and check how recent is the timestamp,
    // but for that I need to check how the API behaves on the weekends
    return true;
  }
}
