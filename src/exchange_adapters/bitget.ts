import { BaseExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class BitgetAdapter extends BaseExchangeAdapter {
  baseApiUrl = 'https://api.bitget.com/api'

  readonly _exchangeName = Exchange.BITGET
  // 	Cloudflare Inc ECC CA-3 - validity not after: 31/12/2024, 19:59:59 GMT-4
  readonly _certFingerprint256 =
    '3A:BB:E6:3D:AF:75:6C:50:16:B6:B8:5F:52:01:5F:D8:E8:AC:BE:27:7C:50:87:B1:27:A6:05:63:A8:41:ED:8A'

  async fetchTicker(): Promise<Ticker> {
    return this.parseTicker(
      await this.fetchFromApi(
        ExchangeDataType.TICKER,
        `spot/v1/market/ticker?symbol=${this.pairSymbol}_SPBL`
      )
    )
  }

  protected generatePairSymbol(): string {
    const base = BaseExchangeAdapter.standardTokenSymbolMap.get(this.config.baseCurrency)
    const quote = BaseExchangeAdapter.standardTokenSymbolMap.get(this.config.quoteCurrency)

    return `${base}${quote}`
  }

  /**
   * Parses the json responses from the ticker and summary endpoints into the
   * standard format for a Ticker object
   *
   * @param pubtickerJson json response from the ticker endpoint
   *    spot/v1/market/ticker?symbol=/${this.pairSymbol}_SPBL
   *    https://api.bitget.com/api/spot/v1/market/ticker?symbol=BTCBRL_SPBL
   *    https://bitgetlimited.github.io/apidoc/en/spot/#get-single-ticker
   *
   *   {"code":"00000",
   *    "data":
   *      {
   *       "baseVol":"9.18503",           // (price symbol, e.g. "USD") The volume denominated in the price currency
   *       "buyOne":"121890",             // buy one price
   *       "close":"121905",              // Latest transaction price
   *       "quoteVol":"1119715.23314",    // (price symbol, e.g. "USD") The volume denominated in the quantity currency
   *       "sellOne":"122012",            // sell one price
   *       "symbol":"BTCBRL",             // Symbol
   *       "ts":"1677490448241",          // Timestamp
   *      },
   *    "msg":"success",
   *    "requestTime":"1677490448872" // Request status
   *   }
   */
  parseTicker(pubtickerJson: any): Ticker {
    const data = pubtickerJson.data || {}
    const ticker = {
      ...this.priceObjectMetadata,
      timestamp: Number(data.ts)!,
      bid: this.safeBigNumberParse(data.buyOne)!,
      ask: this.safeBigNumberParse(data.sellOne)!,
      lastPrice: this.safeBigNumberParse(data.close)!,
      baseVolume: this.safeBigNumberParse(data.baseVol)!,
      quoteVolume: this.safeBigNumberParse(data.quoteVol)!,
    }

    this.verifyTicker(ticker)
    return ticker
  }

  /**
   * Checks if the orderbook for the relevant pair is live. If it's not, the price
   * data from Ticker endpoint may be inaccurate.
   *
   * https://api.bitget.com/api/spot/v1/public/product?symbol=BTCBRL_SPBL
   *
   * API response example:
   * {"code":"00000",
   *  "data":
   *    {
   *      "baseCoin":"BTC",
   *      "status":"online",
   *       symbol":"btcbrl_SPBL",
   *    },
   *  "msg":"success",
   *  "requestTime":"0"
   * }
   *
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    const res = await this.fetchFromApi(
      ExchangeDataType.ORDERBOOK_STATUS,
      `spot/v1/public/product?symbol=${this.pairSymbol}_SPBL`
    )

    return res.data.status === 'online'
  }
}
