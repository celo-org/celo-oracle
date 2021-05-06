import { Exchange } from '../utils'
import { BaseExchangeAdapter, ExchangeDataType, Ticker, Trade } from './base'

export class BittrexAdapter extends BaseExchangeAdapter {
  baseApiUrl = 'https://api.bittrex.com/v3'
  readonly _exchangeName = Exchange.BITTREX
  // Cloudflare Inc ECC CA-3
  readonly _certFingerprint256 =
    '3A:BB:E6:3D:AF:75:6C:50:16:B6:B8:5F:52:01:5F:D8:E8:AC:BE:27:7C:50:87:B1:27:A6:05:63:A8:41:ED:8A'

  private static readonly tokenSymbolMap = BittrexAdapter.standardTokenSymbolMap

  async fetchTicker(): Promise<Ticker> {
    const [tickerJson, summaryJson] = await Promise.all([
      this.fetchFromApi(ExchangeDataType.TICKER, `markets/${this.pairSymbol}/ticker`),
      this.fetchFromApi(ExchangeDataType.TICKER, `markets/${this.pairSymbol}/summary`),
    ])

    return this.parseTicker(tickerJson, summaryJson)
  }

  async fetchTrades(): Promise<Trade[]> {
    const tradeJson = await this.fetchFromApi(
      ExchangeDataType.TRADE,
      `markets/${this.pairSymbol}/trades`
    )
    return this.parseTrades(tradeJson)
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
   * Translates the json response from the Bittrex API into the standard Trade object
   *
   * @param json response from the trades endpoint
   *    https://api.bittrex.com/v3/markets/{marketSymbol}/trades
   *
   *    [
   *      {
   *        id: "string (uuid)",
   *        executedAt: "string (date-time)",
   *        quantity: "number (double)",
   *        rate: "number (double)",
   *        takerSide: "string"
   *      }
   *    ]
   */
  parseTrades(json: any): Trade[] {
    return json.map((trade: any) => {
      const price = this.safeBigNumberParse(trade.rate)
      const amount = this.safeBigNumberParse(trade.quantity)
      const cost = amount ? price?.times(amount) : undefined
      const normalizedTrade = {
        ...this.priceObjectMetadata,
        amount,
        cost,
        id: trade.id,
        price,
        side: trade.takerSide,
        timestamp: this.safeDateParse(trade.executedAt)!,
      }
      this.verifyTrade(normalizedTrade)
      return normalizedTrade
    })
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
