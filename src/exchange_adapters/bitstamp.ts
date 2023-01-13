import { Currency, Exchange,ExternalCurrency } from "../utils";
import { CeloContract } from '@celo/contractkit'
import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType,  Ticker, Trade } from './base'

export class BitstampAdapter extends BaseExchangeAdapter implements ExchangeAdapter{
  baseApiUrl = 'https://www.bitstamp.net/api/v2/'
  readonly _exchangeName = Exchange.BITSTAMP
  readonly _certFingerprint256 = 
    '40:3E:06:2A:26:53:05:91:13:28:5B:AF:80:A0:D4:AE:42:2C:84:8C:9F:78:FA:D0:1F:C9:4B:C5:B8:7F:EF:1A'

   private static readonly tokenSymbolMap = new Map<Currency, string>([
            ...BitstampAdapter.standardTokenSymbolMap,
            [CeloContract.StableToken, 'cusd'],
            [ExternalCurrency.USD, 'usd'],
            [ExternalCurrency.EUR, 'eur'],
            [ExternalCurrency.BTC, 'btc'],
            [ExternalCurrency.USDT, 'usdt'],
        ])

  protected generatePairSymbol(): string {
    const base = BitstampAdapter.tokenSymbolMap.get(this.config.baseCurrency)
    const quote = BitstampAdapter.tokenSymbolMap.get(this.config.quoteCurrency)
    return `${base}${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    const tickerJson = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `ticker/${this.pairSymbol}`
    )
    return this.parseTicker(tickerJson)
  }

  async fetchTrades(): Promise<Trade[]> {
    // Trade data is not needed by oracle but is required by the parent class.
    // This function along with all other functions that are not needed by the oracle will
    // be removed in a future PR.
    // -- @bayological ;) --
    return []
  }


  /**
   *
   * @param json parsed response from bitstamps's ticker endpoint
   *
   * {
   *    "timestamp": "1673617671",
   *    "open": "1.00083",
   *    "high": "1.00100",
   *    "low": "0.99865",
   *    "last": "1.00031",
   *    "volume": "949324.40769",
   *    "vwap": "1.00013",
   *    "bid": "1.00005",
   *    "ask": "1.00031",
   *    "open_24": "0.99961",
   *    "percent_change_24": "0.07"
    }
   *
   */

  parseTicker(json: any): Ticker {
    const lastPrice = this.safeBigNumberParse(json.last)!
    const baseVolume = this.safeBigNumberParse(json.volume)!
    const vwap = this.safeBigNumberParse(json.vwap)!
    const quoteVolume =  baseVolume?.multipliedBy(vwap)
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json.ask)!,
      baseVolume,
      bid: this.safeBigNumberParse(json.bid)!,
      high: this.safeBigNumberParse(json.high),
      lastPrice,
      low: this.safeBigNumberParse(json.low),
      open: this.safeBigNumberParse(json.open_24),
      quoteVolume,
      timestamp: this.safeBigNumberParse(json.timestamp)?.toNumber()!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   * No Bitstamps endpoint available to check for order book liveness.
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    return true
  }


}