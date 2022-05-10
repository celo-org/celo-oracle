import { Exchange } from '../utils'
import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker, Trade } from './base'

export class NovaDaxAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.novadax.com/v1/market'
  readonly _exchangeName = Exchange.NOVADAX
  // NovaDAX's certificate fingerprint.
  readonly _certFingerprint256 =
    '4F:04:74:C6:3E:28:50:64:B1:38:00:09:8A:79:6F:FF:BF:C0:E8:AB:98:AD:AE:99:88:FD:66:3A:5A:48:00:24'

  private static readonly tokenSymbolMap = NovaDaxAdapter.standardTokenSymbolMap

  protected generatePairSymbol(): string {
    const base = NovaDaxAdapter.tokenSymbolMap.get(this.config.baseCurrency)
    const quote = NovaDaxAdapter.tokenSymbolMap.get(this.config.quoteCurrency)
    return `${base}_${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    const tickerJson = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `ticker?symbol=${this.pairSymbol}`
    )
    return this.parseTicker(tickerJson)
  }

  async fetchTrades(): Promise<Trade[]> {
    const tradesJson = await this.fetchFromApi(
      ExchangeDataType.TRADE,
      `trades?symbol=${this.pairSymbol}`
    )
    return this.parseTrades(tradesJson.payload).sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   *
   * @param json parsed response from NovaDAX's ticker endpoint
   *
   * {
   *     "code": "A10000",
   *     "data": {
   *         "ask": "34708.15",
   *         "baseVolume24h": "34.08241488",
   *         "bid": "34621.74",
   *         "high24h": "35079.77",
   *         "lastPrice": "34669.81",
   *         "low24h": "34330.64",
   *         "open24h": "34492.08",
   *         "quoteVolume24h": "1182480.09502814",
   *         "symbol": "BTC_BRL",
   *         "timestamp": 1571112216346
   *     },
   *     "message": "Success"
   * }
   *
   */
  parseTicker(json: any): Ticker {
    const data = json.data
    const lastPrice = this.safeBigNumberParse(data.lastPrice)!
    const baseVolume = this.safeBigNumberParse(data.baseVolume24h)!
    const quoteVolume = this.safeBigNumberParse(data.quoteVolume24h)!
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(data.ask)!,
      baseVolume,
      bid: this.safeBigNumberParse(data.bid)!,
      high: this.safeBigNumberParse(data.high24h),
      lastPrice,
      low: this.safeBigNumberParse(data.low24h),
      open: this.safeBigNumberParse(data.open24h),
      quoteVolume,
      timestamp: this.safeBigNumberParse(data.timestamp)?.toNumber()!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   *
   * @param json response from NovaDax's trades endpoint
   *
   *  {
   *      "code": "A10000",
   *      "data": [
   *          {
   *              "price": "43657.57",
   *              "amount": "1",
   *              "side": "SELL",
   *              "timestamp": 1565007823401
   *          },
   *          {
   *              "price": "43687.16",
   *              "amount": "0.071",
   *              "side": "BUY",
   *              "timestamp": 1565007198261
   *          }
   *      ],
   *      "message": "Success"
   *  }
   *
   */

  parseTrades(json: any): Trade[] {
    return json.data.map((trade: any) => {
      const price = this.safeBigNumberParse(trade.price)
      const amount = this.safeBigNumberParse(trade.amount)
      const normalizedTrade = {
        ...this.priceObjectMetadata,
        amount,
        cost: amount ? price?.times(amount) : undefined,
        // no trade id
        price,
        side: trade.side.toLowerCase(),
        timestamp: this.safeBigNumberParse(trade.created_at)!.toNumber(),
      }
      this.verifyTrade(normalizedTrade)
      return normalizedTrade
    })
  }

  /**
   * No NovaDax endpoint available to check for order book liveness.
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    return true
  }
}
