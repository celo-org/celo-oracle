import { BaseExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class OKCoinAdapter extends BaseExchangeAdapter {
  baseApiUrl = 'https://www.okcoin.com/api'

  // Cloudflare Inc ECC CA-3 - validity not after: 31/12/2024, 19:59:59 GMT-4
  readonly _certFingerprint256 =
    '3A:BB:E6:3D:AF:75:6C:50:16:B6:B8:5F:52:01:5F:D8:E8:AC:BE:27:7C:50:87:B1:27:A6:05:63:A8:41:ED:8A'

  readonly _exchangeName = Exchange.OKCOIN

  // There are no known deviations from the standard mapping
  private static readonly tokenSymbolMap = OKCoinAdapter.standardTokenSymbolMap

  async fetchTicker(): Promise<Ticker> {
    const json = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `spot/v3/instruments/${this.pairSymbol}/ticker`
    )
    return this.parseTicker(json)
  }

  /**
   * Parses the json response from the ticker endpoint and returns a Ticker object
   *
   * @param json response from /spot/v3/instruments/${this.pairSymbol}/ticker
   *
   *    Example response from OKCoin docs: https://www.okcoin.com/docs/en/#spot-some
   *    {
   *      "best_ask": "7222.2",
   *      "best_bid": "7222.1",
   *      "instrument_id": "BTC-USDT",
   *      "product_id": "BTC-USDT",
   *      "last": "7222.2",
   *      "last_qty": "0.00136237",
   *      "ask": "7222.2",
   *      "best_ask_size": "0.09207739",
   *      "bid": "7222.1",
   *      "best_bid_size": "3.61314948",
   *      "open_24h": "7356.8",
   *      "high_24h": "7367.7",
   *      "low_24h": "7160",
   *      "base_volume_24h": "18577.2",
   *      "timestamp": "2019-12-11T07:48:04.014Z",
   *      "quote_volume_24h": "134899542.8"
   *    }
   */
  parseTicker(json: any): Ticker {
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json.ask)!,
      baseVolume: this.safeBigNumberParse(json.base_volume_24h)!,
      bid: this.safeBigNumberParse(json.bid)!,
      high: this.safeBigNumberParse(json.high_24h),
      lastPrice: this.safeBigNumberParse(json.last)!,
      low: this.safeBigNumberParse(json.low_24h),
      open: this.safeBigNumberParse(json.open_24h),
      quoteVolume: this.safeBigNumberParse(json.quote_volume_24h)!,
      timestamp: this.safeDateParse(json.timestamp)!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  protected generatePairSymbol(): string {
    return `${OKCoinAdapter.tokenSymbolMap.get(
      this.config.baseCurrency
    )}-${OKCoinAdapter.tokenSymbolMap.get(this.config.quoteCurrency)}`
  }

  /**
   * OKCoin doesn't have an endpoint to check this. So, return true, and assume
   * that if the API can be reached, the orderbook is live.
   */
  async isOrderbookLive(): Promise<boolean> {
    return true
  }
}
