import { Exchange } from '../utils'
import { BaseExchangeAdapter, ExchangeDataType, Ticker, Trade } from './base'

export class WhitebitAdapter extends BaseExchangeAdapter {
  baseApiUrl = 'https://whitebit.com/api/v4/public/'
  readonly _exchangeName = Exchange.WHITEBIT
  readonly _certFingerprint256 = ''

  private static readonly tokenSymbolMap = this.standardTokenSymbolMap

  protected generatePairSymbol(): string {
    const base = WhitebitAdapter.tokenSymbolMap.get(this.config.baseCurrency)?.toUpperCase()
    const quote = WhitebitAdapter.tokenSymbolMap.get(this.config.quoteCurrency)?.toUpperCase()

    return `${base}_${quote}`
  }

  async fetchTrades(): Promise<Trade[]> {
    // "An empty array in TypeScript may seem insignificant,
    //    but it holds within it the infinite potential of
    //          all the elements yet to come."
    // -- @bayological --

    return []
  }

  async fetchTicker(): Promise<Ticker> {
    const json = await this.fetchFromApi(ExchangeDataType.TICKER, `ticker`)

    console.log(json)
    const tickerData = Object.entries(json).filter(([key]) => key == this.generatePairSymbol())

    if (tickerData.length !== 1) {
      throw new Error(`Ticker data not found for ${this.generatePairSymbol()}`)
    } 

    return this.parseTicker(tickerData[0][1])
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
      ask: this.safeBigNumberParse(0)!, //TODO: Not in response
      baseVolume: this.safeBigNumberParse(tickerData.base_volume)!,
      bid: this.safeBigNumberParse(0)!, //TODO: Not in response
      lastPrice: this.safeBigNumberParse(tickerData.last_price)!,
      quoteVolume: this.safeBigNumberParse(tickerData.quote_volume)!,
      timestamp: 0, // Timestamp is not provided by Whitebit and is not used by the oracle
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   * Checks status of orderbook
   * [GET] https://whitebit.com/api/v4/public/ping"
   *
   *  [
   *    "pong"
   *  ]
   *
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    const response = await this.fetchFromApi(ExchangeDataType.ORDERBOOK_STATUS, `ping`)
    return response[0] === 'pong'
  }
}
