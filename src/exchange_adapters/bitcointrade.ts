import { Exchange } from '../utils'
import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker, Trade } from './base'

export class BitcointradeAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.bitcointrade.com.br/v3'
  readonly _exchangeName = Exchange.BITCOINTRADE
  // Bitcointrade's certificate fingerprint.
  readonly _certFingerprint256 =
    'BD:13:6A:9E:EC:4A:52:42:C1:2F:A9:F3:A7:B4:F7:FB:0E:49:C4:10:CC:B1:22:67:86:79:C9:80:C3:CB:CE:47'

  private static readonly tokenSymbolMap = BitcointradeAdapter.standardTokenSymbolMap

  protected generatePairSymbol(): string {
    // Please note that Bitcointrade uses the inverse ({Quote}{Base}) of the
    // usual FX quoting convention ({Base}{Quote}).
    return `${BitcointradeAdapter.tokenSymbolMap.get(
      this.config.quoteCurrency
    )}${BitcointradeAdapter.tokenSymbolMap.get(this.config.baseCurrency)}`
  }

  async fetchTicker(): Promise<Ticker> {
    const tickerJson = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `public/${this.pairSymbol}/ticker`
    )
    return this.parseTicker(tickerJson)
  }

  async fetchTrades(): Promise<Trade[]> {
    const tradesJson = await this.fetchFromApi(
      ExchangeDataType.TRADE,
      `public/${this.pairSymbol}/trades`
    )
    return this.parseTrades(tradesJson.payload).sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   *
   * @param json parsed response from Bitcointrade's ticker endpoint
   *
   * {
   *   data: {
   *     buy: 319010.89,
   *     date: '2021-12-02T16:25:45.558Z',
   *     high: 333000.01,
   *     last: 319010.89,
   *     low: 318005.01,
   *     sell: 320454.63,
   *     trades_quantity: 1441,
   *     volume: 9.03861641
   *   },
   *   message: null
   * }
   */
  parseTicker(json: any): Ticker {
    const data = json.data

    const lastPrice = this.safeBigNumberParse(data.last)!
    const baseVolume = this.safeBigNumberParse(data.volume)!
    // Using lastPrice to convert from baseVolume to quoteVolume, as
    // BitcoinTrade's API does not provide this information. The correct price
    // for the conversion would be the VWAP over the period contemplated by the
    // ticker, but it's also not available. As a price has to be chosen for the
    // conversion, and none of them are correct, lastPrice is chose as it
    // was actually on one trade (whereas the bid, ask or mid could have no
    // relation to the VWAP).
    const quoteVolume = baseVolume?.multipliedBy(lastPrice)
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(data.sell)!,
      baseVolume,
      bid: this.safeBigNumberParse(data.buy)!,
      high: this.safeBigNumberParse(data.high),
      lastPrice,
      low: this.safeBigNumberParse(data.low),
      quoteVolume,
      timestamp: this.safeDateParse(data.date)!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   *
   * @param json response from Bitcointrade's trades endpoint
   *
   * {
   *   "data":{
   *     "pagination":{
   *       "current_page":1,
   *       "page_size":20,
   *       "registers_count":2955023,
   *       "total_pages":147752
   *     },
   *     "trades":[
   *       {
   *         "active_order_code":"Oo33WQXR1",
   *         "amount":0.04675278,
   *         "date":"2021-12-02T18:37:43.900Z",
   *         "passive_order_code":"Eey5SULpt",
   *         "type":"buy",
   *         "unit_price":320999.78
   *       }
   *     ]
   *   },
   *   "message":null
   * }
   */
  parseTrades(json: any): Trade[] {
    return json.data.trades.map((trade: any) => {
      const price = this.safeBigNumberParse(trade.unit_price)
      const amount = this.safeBigNumberParse(trade.amount)
      const normalizedTrade = {
        ...this.priceObjectMetadata,
        amount,
        cost: amount ? price?.times(amount) : undefined,
        id: trade.active_order_code,
        price,
        side: trade.m ? 'sell' : 'buy',
        timestamp: this.safeDateParse(trade.date)!,
      }
      this.verifyTrade(normalizedTrade)
      return normalizedTrade
    })
  }

  async isOrderbookLive(): Promise<boolean> {
    const res = await this.fetchFromApi(
      ExchangeDataType.ORDERBOOK_STATUS,
      `public/pairs?pair_code=${this.pairSymbol}`
    )

    // Exactly one object is expected on the exchange's reply.
    if (res.data.length !== 1) {
      return Promise.reject('Unexpected exchange reply.')
    }

    const marketInfo = res.data[0]

    return marketInfo.enabled
  }
}
