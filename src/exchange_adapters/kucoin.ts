import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class KuCoinAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.kucoin.com'
  readonly _exchangeName = Exchange.KUCOIN
  // api.kucoin.com - validity not after: 09/02/2024, 00:59:59 CET
  readonly _certFingerprint256 =
    '3C:97:F9:C7:2D:C6:30:AF:FD:5A:91:8A:E8:3C:CE:75:70:C4:35:31:B3:46:61:54:B8:C1:1D:7F:81:2E:DB:58'

  private static readonly tokenSymbolMap = KuCoinAdapter.standardTokenSymbolMap

  protected generatePairSymbol(): string {
    const base = KuCoinAdapter.tokenSymbolMap.get(this.config.baseCurrency)
    const quote = KuCoinAdapter.tokenSymbolMap.get(this.config.quoteCurrency)
    return `${base}-${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    const tickerJson = await this.fetchFromApi(ExchangeDataType.TICKER, `api/v1/market/allTickers`)

    return this.parseTicker(tickerJson)
  }

  /**
   *
   * @param json parsed response from kucoins's ticker endpoint
   * https://api.kucoin.com/api/v1/market/allTickers
   *
   * "code":"200000",
   * "data":{
   *   "time":1674501725001,
   *   "ticker":[
   *    {
   *    "symbol":"CELO-USDT",
   *    "symbolName":"CELO-USDT",
   *    "buy":"0.7555",
   *    "sell":"0.7563",
   *    "changeRate":"0.0907",
   *    "changePrice":"0.0629",
   *    "high":"0.8281",
   *    "low":"0.6654",
   *    "vol":"1598294.854",
   *    "volValue":"1213224.94637127",
   *    "last":"0.7561",
   *    "averagePrice":"0.75703415",
   *    "takerFeeRate":"0.001",
   *    "makerFeeRate":"0.001",
   *    "takerCoefficient":"1",
   *    "makerCoefficient":"1"
   *    },
   *  ]
   * }
   */
  parseTicker(json: any): Ticker {
    const pair = json.data.ticker.find((p: { symbol: string }) => p?.symbol === this.pairSymbol)
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(pair.sell)!,
      baseVolume: this.safeBigNumberParse(pair.vol)!,
      bid: this.safeBigNumberParse(pair.buy)!,
      lastPrice: this.safeBigNumberParse(pair.last)!,
      quoteVolume: this.safeBigNumberParse(pair.volValue)!,
      timestamp: this.safeBigNumberParse(json.data.time)?.toNumber()!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   *
   * @param json parsed response from kucoin's symbols endpoint
   * https://api.kucoin.com/api/v1/symbols
   *
   * {
   * "code":"200000",
   * "data":[
   *  {
   *   "symbol":"CELO-USDT",
   *   "name":"CELO-USDT",
   *   "baseCurrency":"CELO",
   *   "quoteCurrency":"USDT",
   *   "feeCurrency":"USDT",
   *   "market":"USDS",
   *   "baseMinSize":"0.1",
   *   "quoteMinSize":"0.1",
   *   "baseMaxSize":"10000000000",
   *   "quoteMaxSize":"99999999",
   *   "baseIncrement":"0.0001",
   *   "quoteIncrement":"0.0001",
   *   "priceIncrement":"0.0001",
   *   "priceLimitRate":"0.1",
   *   "minFunds":"0.1",
   *   "isMarginEnabled":true,
   *   "enableTrading":true
   *  },
   * ]
   * }
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    const response = await this.fetchFromApi(ExchangeDataType.ORDERBOOK_STATUS, `api/v1/symbols`)
    const pair = response.data.find((p: { symbol: string }) => p?.symbol === this.pairSymbol)

    return !!response && pair.enableTrading === true
  }
}
