import { Exchange } from '../utils'
import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker, Trade } from './base'

export class KrakenAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.kraken.com'
  readonly _exchangeName = Exchange.KRAKEN

  private static readonly tokenSymbolMap = KrakenAdapter.standardTokenSymbolMap

  // Krakens's GTS CA 1P5 fingerprint.
  readonly _certFingerprint256 =
    '97:D4:20:03:E1:32:55:29:46:09:7F:20:EF:95:5F:5B:1C:D5:70:AA:43:72:D7:80:03:3A:65:EF:BE:69:75:8D'

  protected generatePairSymbol(): string {
    const base = KrakenAdapter.tokenSymbolMap.get(this.config.baseCurrency)
    const quote = KrakenAdapter.tokenSymbolMap.get(this.config.quoteCurrency)
    return `${base}_${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    const json = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `0/public/Ticker?pair=${this.pairSymbol}`
    )
    return this.parseTicker(json)
  }

  async fetchTrades(): Promise<Trade[]> {
    const tradesJson = await this.fetchFromApi(
      ExchangeDataType.TRADE,
      `0/public/Trades?pair=${this.pairSymbol}`
    )
    return this.parseTrades(tradesJson).sort((a, b) => a.timestamp - b.timestamp)
  }

    /**
   *
   * @param json response from Krakens's trades endpoint
   *
   *  {
   *      "code": "A10000",
   *      "data": [
   *          {
   *              "price": "43657.57",
   *              "amount": "1",
   *              "side": "SELL",
   *              "timestamp": 1565007823401
   *          },
   *          {
   *              "price": "43687.16",
   *              "amount": "0.071",
   *              "side": "BUY",
   *              "timestamp": 1565007198261
   *          }
   *      ],
   *      "message": "Success"
   *  }
   *
   */

  // parse the json object we get from the api
  parseTicker(json: any): Ticker {
    const ticker = {}
    this.verifyTicker(ticker)
    return ticker
  }

  parseTrades(json: any): Trade[] {

  }

  /**
   * No kraken endpoint available to check for order book liveness.
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    return true
  }
}
