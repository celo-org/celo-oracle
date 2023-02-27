import { Exchange } from '../utils'
import { BaseExchangeAdapter, ExchangeDataType, Ticker, Trade } from './base'

export class BitgetAdapter extends BaseExchangeAdapter {
  baseApiUrl = 'https://api.bitget.com/api'

  readonly _exchangeName = Exchange.BITGET
  // bitget.com cert
  readonly _certFingerprint256 =
    'F2:BD:C8:BE:CF:19:66:1F:F7:62:EC:52:82:73:9D:5A:6C:A9:9B:2A:3B:71:D6:D1:42:2A:ED:4B:ED:FD:0C:78'

  async fetchTicker(): Promise<Ticker> {
    return this.parseTicker(
      await this.fetchFromApi(ExchangeDataType.TICKER, `spot/v1/market/ticker?symbol=${this.pairSymbol}_SPBL`)
    )
  }

  async fetchTrades(): Promise<Trade[]> {
    /**
     * Trades are cool, but empty arrays are cooler.
     *                          @bogdan, 01/2023
     */
    return []
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
   * data from Ticker + Trade endpoints may be inaccurate.
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
  
      return res.data.status == 'online'
    }
}
