import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'
import { Currency, Exchange, ExternalCurrency } from '../utils'

import { CeloContract } from '@celo/contractkit'

export class CoinbaseAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.pro.coinbase.com'
  // WE1 Expires: Tuesday, 20. February 2029 at 16:00:00 Eastern
  readonly _certFingerprint256 =
    '1D:FC:16:05:FB:AD:35:8D:8B:C8:44:F7:6D:15:20:3F:AC:9C:A5:C1:A7:9F:D4:85:7F:FA:F2:86:4F:BE:BF:96'


  readonly _exchangeName = Exchange.COINBASE

  /**
   * Coinbase is currently using `CGLD` as the symbol for CELO and `EURC` as the symbol for EUROC.
   */
  private static readonly tokenSymbolMap = new Map<Currency, string>([
    ...CoinbaseAdapter.standardTokenSymbolMap,
    [CeloContract.GoldToken, 'CGLD'],
    [ExternalCurrency.EUROC, 'EURC'],
  ])

  protected generatePairSymbol(): string {
    return `${CoinbaseAdapter.tokenSymbolMap.get(
      this.config.baseCurrency
    )}-${CoinbaseAdapter.tokenSymbolMap.get(this.config.quoteCurrency)}`
  }

  async fetchTicker(): Promise<Ticker> {
    const res = await this.fetchFromApi(
      ExchangeDataType.TICKER,
      `products/${this.pairSymbol}/ticker`
    )
    return this.parseTicker(res)
  }

  /**
   * @param json a json object from Coinbase's API
   * Expected format, as described in the docs
   * source: https://docs.pro.coinbase.com/#get-product-ticker
   *
   *    {
   *      trade_id: 4729088,
   *      price: "333.99",
   *      size: "0.193",
   *      bid: "333.98",
   *      ask: "333.99",
   *      volume: "5957.11914015",
   *      time: "2015-11-14T20:46:03.511254Z"
   *    }
   */
  parseTicker(json: any): Ticker {
    const lastPrice = this.safeBigNumberParse(json.price)!
    const baseVolume = this.safeBigNumberParse(json.volume)!
    // Using lastPrice to convert from baseVolume to quoteVolume, as CoinBase's
    // API does not provide this information. The correct price for the
    // conversion would be the VWAP over the period contemplated by the ticker,
    // but it's also not available. As a price has to be chosen for the
    // conversion, and none of them are correct, lastPrice is chose as it
    // was actually on one trade (whereas the bid, ask or mid could have no
    // relation to the VWAP).
    const quoteVolume = baseVolume?.multipliedBy(lastPrice)
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(json.ask)!,
      baseVolume,
      bid: this.safeBigNumberParse(json.bid)!,
      close: lastPrice,
      lastPrice,
      quoteVolume,
      timestamp: this.safeDateParse(json.time)!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   * Checks if the orderbook for the relevant pair is live. If it's not, the price
   * data from ticker endpoint may be inaccurate.
   *
   *  {
   *    id: "CGLD-USD",
   *    base_currency: "CGLD",
   *    quote_currency: "USD",
   *    base_min_size: "0.10000000",
   *    base_max_size: "34000.00000000",
   *    quote_increment: "0.00010000",
   *    base_increment: "0.01000000",
   *    display_name: "CGLD/USD",
   *    min_market_funds: "1.0",
   *    max_market_funds: "100000",
   *    margin_enabled: false,
   *    post_only: false,
   *    limit_only: false,
   *    cancel_only: false,
   *    trading_disabled: false,
   *    status: "online",
   *    status_message: ""
   *  }
   */
  async isOrderbookLive(): Promise<boolean> {
    const res = await this.fetchFromApi(
      ExchangeDataType.ORDERBOOK_STATUS,
      `products/${this.pairSymbol}`
    )

    return (
      res.status === 'online' &&
      res.post_only === false &&
      // There used to be a `limit_only` check, but it was removed due to Coinbase using this mode for stablecoin pairs.
      res.cancel_only === false &&
      res.trading_disabled === false
    )
  }
}
