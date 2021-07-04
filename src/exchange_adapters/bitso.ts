import { Exchange } from '../utils'
import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker, Trade } from './base'

export class BitsoAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.bitso.com/api/v3'
  readonly _exchangeName = Exchange.BITSO
  // Cloudflare Inc ECC CA-3
  readonly _certFingerprint256 =
    '3A:BB:E6:3D:AF:75:6C:50:16:B6:B8:5F:52:01:5F:D8:E8:AC:BE:27:7C:50:87:B1:27:A6:05:63:A8:41:ED:8A'

  private static readonly tokenSymbolMap = BitsoAdapter.standardTokenSymbolMap

  protected generatePairSymbol(): string {
    return `${BitsoAdapter.tokenSymbolMap.get(
      this.config.baseCurrency
    )?.toLowerCase()}_${BitsoAdapter.tokenSymbolMap.get(
      this.config.quoteCurrency
    )?.toLowerCase()}`
  }

  async fetchTicker(): Promise<Ticker> {
    const tickerJson = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `ticker?book=${this.pairSymbol}`
    )
    return this.parseTicker(tickerJson)
  }

  async fetchTrades(): Promise<Trade[]> {
    const tradesJson = await this.fetchFromApi(
      ExchangeDataType.TRADE,
      `trades?book=${this.pairSymbol}`
    )
    // sort order from API is chronological
    return this.parseTrades(tradesJson)
  }

  /**
   *
   * @param json parsed response from Bitso's ticker endpoint
   * 
   * {
   *    "high": "689735.63",
   *    "last": "658600.01",
   *    "created_at": "2021-07-02T05:55:25+00:00",
   *    "book": "btc_mxn",
   *    "volume": "188.62575176",
   *    "vwap": "669760.9564740908",
   *    "low": "658000.00",
   *    "ask": "658600.01",
   *    "bid": "658600.00",
   *    "change_24": "-29399.96"
   * }
   */
  parseTicker(json: any): Ticker {
    const lastPrice = this.safeBigNumberParse(json.payload.last)!
    const vwap = this.safeBigNumberParse(json.payload.vwap)!
    const baseVolume = this.safeBigNumberParse(json.payload.volume)!
    // TODO: We want to use the right conversion to the quoteVolume,
    // as the coinbase adapter states. Bitso provides the vwap to do so, but further
    // assistance is needed to get the right conversion here.
    // I'm leaving this to multiply the vwap times the base volume.
    const quoteVolume = vwap?.multipliedBy(baseVolume).decimalPlaces(8)
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json.payload.ask)!,
      baseVolume,
      bid: this.safeBigNumberParse(json.payload.bid)!,
      high: this.safeBigNumberParse(json.payload.high),
      lastPrice,
      low: this.safeBigNumberParse(json.payload.low),
      open: lastPrice,
      quoteVolume,
      timestamp: this.safeDateParse(json.payload.created_at)!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   *
   * @param json response from Bitso's trades endpoint
   *
   * [
   *     {
   *         "book": "btc_mxn",
   *         "created_at": "2021-07-02T05:54:45+0000",
   *         "amount": "0.00127843",
   *         "maker_side": "buy",
   *         "price": "659436.40",
   *         "tid": 41827090
   *     }
   * ]
   */
  parseTrades(json: any): Trade[] {
    return json.payload.map((trade: any) => {
      const price = this.safeBigNumberParse(trade.price)
      const amount = this.safeBigNumberParse(trade.amount)
      const normalizedTrade = {
        ...this.priceObjectMetadata,
        amount,
        cost: amount ? price?.times(amount) : undefined,
        id: trade.tid,
        price,
        side: trade.maker_side,
        timestamp: this.safeDateParse(trade.created_at)!,
      }
      this.verifyTrade(normalizedTrade)
      return normalizedTrade
    })
  }

  /**
   * No endpoint available to check this from Bitso.
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    return true
  }
}
