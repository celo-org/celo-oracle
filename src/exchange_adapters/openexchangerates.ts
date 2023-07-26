import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import BigNumber from 'bignumber.js'
import { Exchange } from '../utils'
import { strict as assert } from 'assert'

export class OpenexchangeratesAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://openexchangerates.org/api'
  readonly _exchangeName: Exchange = Exchange.OPENEXCHANGERATES
  readonly _certFingerprint256 =
    '0A:6F:07:12:F7:5E:93:8D:C2:74:BD:AD:1B:C6:0B:19:F4:D4:9D:41:6C:C8:15:04:65:6C:35:21:92:6F:F3:98'

  private static readonly tokenSymbolMap = OpenexchangeratesAdapter.standardTokenSymbolMap

  // @XOF: I think I can replace this to be standardPairSymbol, see baseExchangeAdapter abstract class
  protected generatePairSymbol(): string {
    const base = OpenexchangeratesAdapter.tokenSymbolMap.get(this.config.baseCurrency)
    const quote = OpenexchangeratesAdapter.tokenSymbolMap.get(this.config.quoteCurrency)

    return `${base}/${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    assert(this.config.apiKey !== undefined, 'OpenExchangeRates API key was not set')

    const tickerJson = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `latest.json?base=${this.config.baseCurrency}&symbols=${this.config.quoteCurrency}&app_id=${this.config.apiKey}`
    )
    return this.parseTicker(tickerJson)
  }

  /**
   *
   * @param json parsed response from OpenExchangeRates latest rates endpoint
    {
      "disclaimer": "Usage subject to terms: https://openexchangerates.org/terms",
      "license": "https://openexchangerates.org/license",
      "timestamp": 1690369200,
      "base": "XOF",
      "rates": {
        "EUR": 0.001524
      }
    }
  */
  parseTicker(json: any): Ticker {
    assert(
      json.base === this.config.baseCurrency,
      `Base currency mismatch in response: ${json.base} != ${this.config.baseCurrency}`
    )
    assert(json.rates[this.config.quoteCurrency] !== undefined, `Quote currency not found inside of rates`)

    const rate = this.safeBigNumberParse(json.rates[this.config.quoteCurrency])!
    const timestamp = this.safeBigNumberParse(json.timestamp)?.toNumber()!

    const ticker = {
      ...this.priceObjectMetadata,
      ask: rate,
      bid: rate,
      lastPrice: rate,
      timestamp: timestamp,
      // These FX API's do not provide volume data,
      // therefore we set all of them to 1 to weight them equally
      baseVolume: new BigNumber(1),
      quoteVolume: new BigNumber(1),
    }
    this.verifyTicker(ticker)
    return ticker
  }

  async isOrderbookLive(): Promise<boolean> {
    // @XOF: implement this
    return true
  }
}
