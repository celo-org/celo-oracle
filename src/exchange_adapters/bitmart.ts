import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Currency, Exchange, ExternalCurrency } from '../utils'

export class BitMartAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api-cloud.bitmart.com'
  readonly _exchangeName = Exchange.BITMART
  // Go Daddy Secure Certificate Authority - G2 - validity not after: 03/05/2031, 04:00:00 GMT-3
  readonly _certFingerprint256 =
    '9D:44:FC:FB:7F:D3:14:1E:3C:E7:DB:B1:BF:E2:60:6A:D2:96:C6:7C:10:C5:A9:1F:58:D3:58:C0:19:82:85:5A'

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
      `spot/v1/ticker_detail?symbol=${this.pairSymbol}`
    )
    return this.parseTicker(tickerJson)
  }

  /**
   *
   * @param json parsed response from bitmart's ticker endpoint
   * {
   * "message":"OK",
   * "code":1000,
   * "trace":"0f0e93db0eaf472886fbac3dc691c22f.59.16892370225147127",
   * "data":{
   *    "symbol":"EUROC_USDC",
   *    "last_price":"1.10774487",
   *    "quote_volume_24h":"91116.51006870",
   *    "base_volume_24h":"82563.0",
   *    "high_24h":"1.10872025",
   *    "low_24h":"1.09666702",
   *    "open_24h":"1.09737308",
   *    "close_24h":"1.10774487",
   *    "best_ask":"1.11144303",
   *    "best_ask_size":"58.2",
   *    "best_bid":"1.10795347",
   *    "best_bid_size":"50.3",
   *    "fluctuation":"+0.0095",
   *    "timestamp":1689236985709,
   *    "url":"https://www.bitmart.com/trade?symbol=EUROC_USDC"}
   * }
   * @returns Ticker object
   */
  parseTicker(json: any): Ticker {
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json.data.best_ask)!,
      baseVolume: this.safeBigNumberParse(json.data.base_volume_24h)!,
      bid: this.safeBigNumberParse(json.data.best_bid)!,
      lastPrice: this.safeBigNumberParse(json.data.last_price)!,
      quoteVolume: this.safeBigNumberParse(json.data.quote_volume_24h)!,
      timestamp: this.safeBigNumberParse(json.data.timestamp)?.toNumber()!,
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
