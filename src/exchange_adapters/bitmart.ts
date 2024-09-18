import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Currency, Exchange, ExternalCurrency } from '../utils'

export class BitMartAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api-cloud.bitmart.com'
  readonly _exchangeName = Exchange.BITMART
  // Go Daddy Secure Certificate Authority - G2 - validity not after: 03/05/2031, 04:00:00 GMT-3
  readonly _certFingerprint256 =
    '97:3A:41:27:6F:FD:01:E0:27:A2:AA:D4:9E:34:C3:78:46:D3:E9:76:FF:6A:62:0B:67:12:E3:38:32:04:1A:A6'

  /**
   * Bitmart is currently using `EURC` as the symbol for EUROC.
   */
  private static readonly tokenSymbolMap = new Map<Currency, string>([
    ...BitMartAdapter.standardTokenSymbolMap,
    [ExternalCurrency.EUROC, 'EURC'],
  ])

  protected generatePairSymbol(): string {
    return `${BitMartAdapter.tokenSymbolMap.get(
      this.config.baseCurrency
    )}_${BitMartAdapter.tokenSymbolMap.get(this.config.quoteCurrency)}`
  }

  async fetchTicker(): Promise<Ticker> {
    const tickerJson = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `spot/quotation/v3/ticker?symbol=${this.pairSymbol}`
    )
    return this.parseTicker(tickerJson)
  }

  /**
   *
   * @param json parsed response from bitmart's V3 ticker endpoint
   * https://api-cloud.bitmart.com/spot/quotation/v3/ticker?symbol=BTC_USDT
   * {
   *  "code": 1000,
   *  "trace":"886fb6ae-456b-4654-b4e0-1231",
   *  "message": "success",
   *  "data": {
   *    "symbol": "BTC_USDT",
   *    "last": "30000.00",
   *    "v_24h": "582.08066",
   *    "qv_24h": "4793098.48",
   *    "open_24h": "28596.30",
   *    "high_24h": "31012.44",
   *    "low_24h": "12.44",
   *    "fluctuation": "0.04909",
   *    "bid_px": "30000",
   *    "bid_sz": "1",
   *    "ask_px": "31012.44",
   *    "ask_sz": "69994.75267",
   *    "ts": "1691671061919"
   *   }
   * }
   * @returns Ticker object
   */
  parseTicker(json: any): Ticker {
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json.data.ask_px)!,
      baseVolume: this.safeBigNumberParse(json.data.v_24h)!,
      bid: this.safeBigNumberParse(json.data.bid_px)!,
      lastPrice: this.safeBigNumberParse(json.data.last)!,
      quoteVolume: this.safeBigNumberParse(json.data.qv_24h)!,
      timestamp: this.safeBigNumberParse(json.data.ts)?.toNumber()!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   *
   * @param json parsed response from bitmart's trading pair details endpoint
   * https://api-cloud.bitmart.com/spot/v1/symbols/details
   *
   * {
   * "message":"OK",
   * "code":1000,
   * "trace":"48cff315816f4e1aa26ca72cccb46051.69.16892383896653019",
   * "data":{
   *  "symbols":[
   *    { "symbol":"SOLAR_USDT",
   *      "symbol_id":2342,
   *      "base_currency":"SOLAR",
   *      "quote_currency":"USDT",
   *      "quote_increment":"1",
   *      "base_min_size":"1.000000000000000000000000000000",
   *      "price_min_precision":3,
   *      "price_max_precision":6,
   *      "expiration":"NA",
   *      "min_buy_amount":"5.000000000000000000000000000000",
   *      "min_sell_amount":"5.000000000000000000000000000000",
   *      "trade_status":"trading"
   *    },
   *  ]
   * }
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    const response = await this.fetchFromApi(
      ExchangeDataType.ORDERBOOK_STATUS,
      `spot/v1/symbols/details`
    )
    const pair = response?.data.symbols.find(
      (p: { symbol: string }) => p?.symbol === this.pairSymbol
    )
    return !!pair && pair.trade_status === 'trading'
  }
}
