import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class NovaDaxAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.novadax.com/v1/market'
  readonly _exchangeName = Exchange.NOVADAX
  // novadax.com - validity not after: 23/11/2023, 08:35:21 CET
  readonly _certFingerprint256 =
    'D9:77:DB:83:A1:18:F5:C5:67:5E:2C:AC:FA:9E:CC:54:E6:AF:A7:92:5A:2B:FC:C9:7F:C3:E4:35:43:7A:5B:1D'

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
   * No NovaDax endpoint available to check for order book liveness.
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    return true
  }
}
