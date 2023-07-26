import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import BigNumber from 'bignumber.js'
import { Exchange } from '../utils'
import { strict as assert } from 'assert'

export class OneforgeAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.1forge.com'
  readonly _exchangeName: Exchange = Exchange.ONEFORGE
  readonly _certFingerprint256 =
    'B2:D9:95:26:E0:8D:74:D5:01:DF:F8:B3:1B:7D:56:97:DF:C4:C8:A2:94:39:8E:F1:6B:D1:D3:D6:A5:B2:E0:EA'

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
    assert(json.length === 1, `Ticker response returned more than one object: ${json.length}`)

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
    // @XOF: TODO
    return true;
  }
}
