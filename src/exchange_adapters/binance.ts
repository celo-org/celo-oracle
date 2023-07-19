import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class BinanceAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.binance.com/api/v3'
  readonly _exchangeName: Exchange = Exchange.BINANCE
  // GeoTrust RSA CA 2018
  readonly _certFingerprint256 =
    '8C:C3:4E:11:C1:67:04:58:24:AD:E6:1C:49:07:A6:44:0E:DB:2C:43:98:E9:9C:11:2A:85:9D:66:1F:8E:2B:C7'

  private static readonly tokenSymbolMap = BinanceAdapter.standardTokenSymbolMap

  protected generatePairSymbol(): string {
    return `${BinanceAdapter.tokenSymbolMap.get(
      this.config.baseCurrency
    )}${BinanceAdapter.tokenSymbolMap.get(this.config.quoteCurrency)}`
  }

  async fetchTicker(): Promise<Ticker> {
    const tickerJson = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `ticker/24hr?symbol=${this.pairSymbol}`
    )
    return this.parseTicker(tickerJson)
  }

  /**
   *
   * @param json parsed response from Binance's ticker endpoint
   *
   * {
   *   "symbol": "CELOBTC",
   *   "priceChange": "0.00000023",
   *   "priceChangePercent": "0.281",
   *   "weightedAvgPrice": "0.00008154",
   *   "prevClosePrice": "0.00008173",
   *   "lastPrice": "0.00008219",
   *   "lastQty": "7.10000000",
   *   "bidPrice": "0.00008213",
   *   "bidQty": "9.90000000",
   *   "askPrice": "0.00008243",
   *   "askQty": "100.00000000",
   *   "openPrice": "0.00008196",
   *   "highPrice": "0.00008386",
   *   "lowPrice": "0.00007948",
   *   "volume": "155146.90000000",
   *   "quoteVolume": "12.65048684",
   *   "openTime": 1614597075604,
   *   "closeTime": 1614683475604,
   *   "firstId": 849549, // First tradeId
   *   "lastId": 854852, // Last tradeId
   *   "count": 5304 // Trade count
   * }
   */
  parseTicker(json: any): Ticker {
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json.askPrice)!,
      baseVolume: this.safeBigNumberParse(json.volume)!,
      bid: this.safeBigNumberParse(json.bidPrice)!,
      high: this.safeBigNumberParse(json.highPrice),
      lastPrice: this.safeBigNumberParse(json.lastPrice)!,
      low: this.safeBigNumberParse(json.lowPrice),
      open: this.safeBigNumberParse(json.openPrice),
      quoteVolume: this.safeBigNumberParse(json.quoteVolume)!,
      timestamp: this.safeBigNumberParse(json.closeTime)?.toNumber()!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  async isOrderbookLive(): Promise<boolean> {
    const res = await this.fetchFromApi(ExchangeDataType.ORDERBOOK_STATUS, 'exchangeInfo')

    const marketInfo = (res?.symbols as {
      status: string
      symbol: string
      isSpotTradingAllowed: boolean
      orderTypes: string[]
    }[])?.find((info) => info?.symbol === this.pairSymbol)

    return (
      !!marketInfo &&
      marketInfo.status === 'TRADING' &&
      marketInfo.isSpotTradingAllowed &&
      marketInfo.orderTypes.includes('LIMIT') &&
      marketInfo.orderTypes.includes('MARKET')
    )
  }
}
