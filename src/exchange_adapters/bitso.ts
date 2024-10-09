import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class BitsoAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.bitso.com/api/v3'
  readonly _exchangeName = Exchange.BITSO
  // Internet Security Research Group - validity not after: 9/15/25, 11:00:00 AM EST
  readonly _certFingerprint256 =
    '76:E9:E2:88:AA:FC:0E:37:F4:39:0C:BF:94:6A:AD:99:7D:5C:1C:90:1B:3C:E5:13:D3:D8:FA:DB:AB:E2:AB:85'

  private static readonly tokenSymbolMap = BitsoAdapter.standardTokenSymbolMap

  protected generatePairSymbol(): string {
    return `${BitsoAdapter.tokenSymbolMap
      .get(this.config.baseCurrency)
      ?.toLowerCase()}_${BitsoAdapter.tokenSymbolMap.get(this.config.quoteCurrency)?.toLowerCase()}`
  }

  async fetchTicker(): Promise<Ticker> {
    const tickerJson = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `ticker?book=${this.pairSymbol}`
    )
    return this.parseTicker(tickerJson.payload)
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
    const lastPrice = this.safeBigNumberParse(json.last)!
    const baseVolume = this.safeBigNumberParse(json.volume)!
    // Quote volume is equivalent to the vwap
    const quoteVolume = this.safeBigNumberParse(json.vwap)!
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json.ask)!,
      baseVolume,
      bid: this.safeBigNumberParse(json.bid)!,
      high: this.safeBigNumberParse(json.high),
      lastPrice,
      low: this.safeBigNumberParse(json.low),
      open: lastPrice,
      quoteVolume,
      timestamp: this.safeDateParse(json.created_at)!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   * No endpoint available to check this from Bitso.
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    return true
  }
}
