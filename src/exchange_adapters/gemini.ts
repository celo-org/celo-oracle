import { BaseExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class GeminiAdapter extends BaseExchangeAdapter {
  baseApiUrl = 'https://api.gemini.com/v1/'
  readonly _exchangeName = Exchange.GEMINI

  async fetchTicker(): Promise<Ticker> {
    return this.parseTicker(
      await this.fetchFromApi(ExchangeDataType.TICKER, `pubticker/${this.pairSymbol}`)
    )
  }

  protected generatePairSymbol(): string {
    const base = BaseExchangeAdapter.standardTokenSymbolMap.get(this.config.baseCurrency)
    const quote = BaseExchangeAdapter.standardTokenSymbolMap.get(this.config.quoteCurrency)

    return `${base}${quote}`.toLocaleLowerCase()
  }

  /**
   * Parses the json responses from the ticker and summary endpoints into the
   * standard format for a Ticker object
   *
   * @param pubtickerJson json response from the ticker endpoint
   *    pubticker/${this.pairSymbol}
   *    https://api.gemini.com/v1/pubticker/${this.pairSymbol}
   *    https://docs.gemini.com/rest-api/#pubticker
   *
   *   {
   *     "ask": "977.59",                  // The lowest ask currently available
   *     "bid": "977.35",                  // The highest bid currently available
   *     "last": "977.65",                 // The price of the last executed trade
   *     "volume": {                       // Information about the 24 hour volume on the exchange. See below
   *       "BTC": "2210.505328803",        // (price symbol, e.g. "USD") The volume denominated in the price currency
   *       "USD": "2135477.463379586263",  // (price symbol, e.g. "USD") The volume denominated in the quantity currency
   *       "timestamp": 1483018200000      // The end of the 24-hour period over which volume was measured
   *     }
   *   }
   */
  parseTicker(pubtickerJson: any): Ticker {
    const volume = pubtickerJson.volume || {}
    const ticker = {
      ...this.priceObjectMetadata,
      timestamp: volume.timestamp,
      bid: this.safeBigNumberParse(pubtickerJson.bid)!,
      ask: this.safeBigNumberParse(pubtickerJson.ask)!,
      lastPrice: this.safeBigNumberParse(pubtickerJson.last)!,
      baseVolume: this.safeBigNumberParse(volume[this.config.baseCurrency])!,
      quoteVolume: this.safeBigNumberParse(volume[this.config.quoteCurrency])!,
    }

    this.verifyTicker(ticker)
    return ticker
  }

  /**
   * Checks if the orderbook for the relevant pair is live. If it's not, the price
   * data from ticker endpoint may be inaccurate.
   *
   * API response example:
   * {
   *   "symbol": "BTCUSD",
   *   "base_currency": "BTC",
   *   "quote_currency": "USD",
   *   "tick_size": 1E-8,
   *   "quote_increment": 0.01,
   *   "min_order_size": "0.00001",
   *   "status": "open",
   *   "wrap_enabled": false
   * }
   *
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    const res = await this.fetchFromApi(
      ExchangeDataType.ORDERBOOK_STATUS,
      `symbols/details/${this.pairSymbol}`
    )

    return res.status === 'open'
  }
}
