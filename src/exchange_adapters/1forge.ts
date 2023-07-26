import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import BigNumber from 'bignumber.js'
import { Exchange } from '../utils'
import { strict as assert } from 'assert'

export class OneforgeAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.1forge.com'
  readonly _exchangeName: Exchange = Exchange.ONEFORGE
  // Amazon RSA 2048 M02
  readonly _certFingerprint256 =
    'B0:F3:30:A3:1A:0C:50:98:7E:1C:3A:7B:B0:2C:2D:DA:68:29:91:D3:16:5B:51:7B:D4:4F:BA:4A:60:20:BD:94'

  private static readonly tokenSymbolMap = OneforgeAdapter.standardTokenSymbolMap

  // @XOF: I think I can replace this to be standardPairSymbol, see baseExchangeAdapter abstract class
  protected generatePairSymbol(): string {
    const base = OneforgeAdapter.tokenSymbolMap.get(this.config.baseCurrency)
    const quote = OneforgeAdapter.tokenSymbolMap.get(this.config.quoteCurrency)

    return `${base}/${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    assert(this.config.apiKey !== undefined, '1Forge API key was not set')

    const tickerJson = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `quotes?pairs=${this.pairSymbol}&api_key=${this.config.apiKey}`
    )
    return this.parseTicker(tickerJson)
  }

  /**
   *
   * @param json parsed response from 1forge's quotes endpoint
    [
      {
        "p": 0.0017,
        "a": 0.0017,
        "b": 0.0017,
        "s": "XOF/USD",
        "t": 1690232400714
      }
    ]
  */
  parseTicker(json: any): Ticker {
    if (json.length !== 1) {
      throw new Error(`Ticker response returned more than one object: ${json.length}`)
    }

    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json[0].a)!,
      bid: this.safeBigNumberParse(json[0].b)!,
      lastPrice: this.safeBigNumberParse(json[0].p)!,
      timestamp: this.safeBigNumberParse(json[0].t)?.toNumber()!,
      // These FX API's do not provide volume data,
      // therefore we set all of them to 1 to weight them equally
      baseVolume: new BigNumber(1),
      quoteVolume: new BigNumber(1),
    }
    this.verifyTicker(ticker)
    return ticker
  }

  async isOrderbookLive(): Promise<boolean> {
    // @XOF: Check if calling this endpoint is enough.
    const res = await this.fetchFromApi(
      ExchangeDataType.ORDERBOOK_STATUS,
      `market_status?&api_key=${this.config.apiKey}`
    )
    return res.market_is_open === true

  }
}
