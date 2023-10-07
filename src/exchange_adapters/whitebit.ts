import { BaseExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class WhitebitAdapter extends BaseExchangeAdapter {
  baseApiUrl = 'https://whitebit.com/api/v4/public/'
  readonly _exchangeName = Exchange.WHITEBIT
  // Cloudflare Inc ECC CA-3 - validity not after: 31/12/2024, 19:59:59 GMT-4
  readonly _certFingerprint256 =
    '3A:BB:E6:3D:AF:75:6C:50:16:B6:B8:5F:52:01:5F:D8:E8:AC:BE:27:7C:50:87:B1:27:A6:05:63:A8:41:ED:8A'

  private static readonly tokenSymbolMap = this.standardTokenSymbolMap

  protected generatePairSymbol(): string {
    const base = WhitebitAdapter.tokenSymbolMap.get(this.config.baseCurrency)?.toUpperCase()
    const quote = WhitebitAdapter.tokenSymbolMap.get(this.config.quoteCurrency)?.toUpperCase()

    return `${base}_${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    const json = await this.fetchFromApi(ExchangeDataType.TICKER, `ticker`)
    const tickerData = json[this.generatePairSymbol()]

    if (!tickerData) {
      throw new Error(`Ticker data not found for ${this.generatePairSymbol()}`)
    }

    // Get orderbook data as ticker data does not contain bid/ask
    const orderBookData = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `orderbook/${this.generatePairSymbol()}?limit=1&level=2&`
    )

    return this.parseTicker({
      ...tickerData,
      ask: orderBookData.asks[0][0],
      bid: orderBookData.bids[0][0],
    })
  }

  /**
   *
   * @param json parsed response from whitebits's ticker endpoint
   * https://whitebit.com/api/v4/public/ticker
   *
   *   "1INCH_UAH": {
   *     "base_id": 8104,
   *     "quote_id": 0,
   *     "last_price": "20.991523",
   *     "quote_volume": "1057381.44765064",
   *     "base_volume": "48537.28",
   *     "isFrozen": false,
   *     "change": "-4.71"
   *   },
   */
  parseTicker(tickerData: any): Ticker {
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(tickerData.ask)!,
      baseVolume: this.safeBigNumberParse(tickerData.base_volume)!,
      bid: this.safeBigNumberParse(tickerData.bid)!,
      lastPrice: this.safeBigNumberParse(tickerData.last_price)!,
      quoteVolume: this.safeBigNumberParse(tickerData.quote_volume)!,
      timestamp: 0, // Timestamp is not provided by Whitebit and is not used by the oracle
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   * Checks status of orderbook
   * [GET] /api/v4/public/markets
   * [
   *  {
   *    "name": "SON_USD",         // Market pair name
   *    "stock": "SON",            // Ticker of stock currency
   *    "money": "USD",            // Ticker of money currency
   *    "stockPrec": "3",          // Stock currency precision
   *    "moneyPrec": "2",          // Precision of money currency
   *    "feePrec": "4",            // Fee precision
   *    "makerFee": "0.001",       // Default maker fee ratio
   *    "takerFee": "0.001",       // Default taker fee ratio
   *    "minAmount": "0.001",      // Minimal amount of stock to trade
   *    "minTotal": "0.001",       // Minimal amount of money to trade
   *    "tradesEnabled": true,     // Is trading enabled
   *    "isCollateral": true,      // Is margin trading enabled
   *    "type": "spot"             // Market type. Possible values: "spot", "futures"
   *  }
   *
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    const marketInfoData = await this.fetchFromApi(ExchangeDataType.ORDERBOOK_STATUS, `markets`)

    const filteredMarketInfo = marketInfoData.filter(
      (market: any) => market.name === this.generatePairSymbol()
    )

    if (filteredMarketInfo.length !== 1) {
      throw new Error(`Market info not found for ${this.generatePairSymbol()}`)
    }

    return filteredMarketInfo[0].tradesEnabled && filteredMarketInfo[0].type === 'spot'
  }
}
