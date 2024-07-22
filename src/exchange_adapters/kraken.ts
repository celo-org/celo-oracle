import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class KrakenAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.kraken.com'
  readonly _exchangeName = Exchange.KRAKEN

  private static readonly tokenSymbolMap = KrakenAdapter.standardTokenSymbolMap

  // GTS CA 1P5 - validity not after: 29/09/2027, 21:00:42 GMT-3
  readonly _certFingerprint256 =
    '1D:FC:16:05:FB:AD:35:8D:8B:C8:44:F7:6D:15:20:3F:AC:9C:A5:C1:A7:9F:D4:85:7F:FA:F2:86:4F:BE:BF:96'

  protected generatePairSymbol(): string {
    const base = KrakenAdapter.tokenSymbolMap.get(this.config.baseCurrency)
    const quote = KrakenAdapter.tokenSymbolMap.get(this.config.quoteCurrency)
    return `${base}${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    const json = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `0/public/Ticker?pair=${this.pairSymbol}`
    )
    return this.parseTicker(json)
  }

  /**
   * @param json a json object representing the ticker from Kraken's API
   * Expected format can be seen in the public docs": https://docs.kraken.com/rest/#tag/Market-Data/operation/getTickerInformation
   *
   */
  parseTicker(json: any): Ticker {
    if (Object.keys(json.result).length !== 1) {
      throw new Error(
        `Unexpected number of pairs in ticker response: ${Object.keys(json.result).length}`
      )
    }

    const data = json.result[Object.keys(json.result)[0]]

    const baseVolume = this.safeBigNumberParse(data.v[1])!
    const lastPrice = this.safeBigNumberParse(data.p[1])!

    const quoteVolume = baseVolume?.multipliedBy(lastPrice)

    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(data.a[0])!,
      baseVolume,
      bid: this.safeBigNumberParse(data.b[0])!,
      lastPrice,
      quoteVolume: quoteVolume!,
      timestamp: 0, // Timestamp is not provided by Kraken and is not used by the oracle
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   * Checks status of orderbook
   * https://api.kraken.com/0/public/SystemStatus"
   *
   *  {
   *    "error": [],
   *    "result": {
   *      "status": "string ("online"|"maintenance"|"cancel_only"|"post_only")",
   *      "timestamp": "timestamp"
   *    }
   *  }
   *
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    const response = await this.fetchFromApi(
      ExchangeDataType.ORDERBOOK_STATUS,
      `0/public/SystemStatus`
    )
    return response.result.status === 'online'
  }
}
