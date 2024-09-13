import { BaseExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class BittrexAdapter extends BaseExchangeAdapter {
  baseApiUrl = 'https://api.bittrex.com/v3'
  readonly _exchangeName = Exchange.BITTREX
  // Google Trust Services LLC - validity not after: 30/09/2027, 03:00:42 EEST
  readonly _certFingerprint256 =
    '16:37:4D:25:0F:40:9A:75:C3:99:05:C3:3E:9F:FF:7D:6D:2C:5E:88:37:79:58:BC:51:7C:97:44:16:96:F4:E0'

  private static readonly tokenSymbolMap = BittrexAdapter.standardTokenSymbolMap

  async fetchTicker(): Promise<Ticker> {
    const [tickerJson, summaryJson] = await Promise.all([
      this.fetchFromApi(ExchangeDataType.TICKER, `markets/${this.pairSymbol}/ticker`),
      this.fetchFromApi(ExchangeDataType.TICKER, `markets/${this.pairSymbol}/summary`),
    ])

    return this.parseTicker(tickerJson, summaryJson)
  }

  protected generatePairSymbol(): string {
    return `${BittrexAdapter.tokenSymbolMap.get(
      this.config.baseCurrency
    )}-${BittrexAdapter.tokenSymbolMap.get(this.config.quoteCurrency)}`
  }

  /**
   * Parses the json responses from the ticker and summary endpoints into the
   * standard format for a Ticker object
   *
   * @param tickerJson json response from the ticker endpoint
   *    markets/${this.pairSymbol}/ticker
   *    https://bittrex.github.io/api/v3#operation--markets--marketSymbol--ticker-get
   *
   *    {
   *      symbol: "string",
   *      lastTradeRate: "number (double)",
   *      bidRate: "number (double)",
   *      askRate: "number (double)"
   *    }
   *
   * @param summaryJson json response from the summary endpoint
   *    markets/${this.pairSymbol}/summary
   *    https://bittrex.github.io/api/v3#operation--markets--marketSymbol--summary-get
   *
   *    {
   *      symbol: "string",                 // describes the currency pair
   *      high: "number (double)",          // the highest price over the last 24 hours
   *      low: "number (double)",           // the lowest price over the last 24 hours
   *      volume: "number (double)",        // the total amount of the base currency traded
   *      quoteVolume: "number (double)",   // the total amount of the quote currency traded
   *      percentChange: "number (double)", // percent change from the beginning to end of the 24 hour period
   *      updatedAt: "string (date-time)"   // last time the summary was updated
   *    }
   */
  parseTicker(tickerJson: any, summaryJson: any): Ticker {
    const ticker = {
      ...this.priceObjectMetadata,
      timestamp: this.safeDateParse(summaryJson.updatedAt)!,
      high: this.safeBigNumberParse(summaryJson.high),
      low: this.safeBigNumberParse(summaryJson.low),
      bid: this.safeBigNumberParse(tickerJson.bidRate)!,
      ask: this.safeBigNumberParse(tickerJson.askRate)!,
      lastPrice: this.safeBigNumberParse(tickerJson.lastTradeRate)!,
      baseVolume: this.safeBigNumberParse(summaryJson.volume)!,
      quoteVolume: this.safeBigNumberParse(summaryJson.quoteVolume)!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   * https://bittrex.github.io/api/v3#/definitions/Market
   *
   *  {
   *    symbol: "CELO-USD",
   *    baseCurrencySymbol: "CELO",
   *    quoteCurrencySymbol: "USD",
   *    minTradeSize: "3.00000000",
   *    precision: 3,
   *    status: "ONLINE",
   *    createdAt: "2020-05-21T16:43:29.013Z",
   *    notice: "",
   *    prohibitedIn: [],
   *    associatedTermsOfService: []
   * }
   */
  async isOrderbookLive(): Promise<boolean> {
    const res = await this.fetchFromApi(
      ExchangeDataType.ORDERBOOK_STATUS,
      `markets/${this.pairSymbol}`
    )

    return res.status === 'ONLINE'
  }
}
