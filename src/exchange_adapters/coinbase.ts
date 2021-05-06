import { CeloContract } from '@celo/contractkit'
import { Currency, Exchange } from '../utils'
import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker, Trade } from './base'

export class CoinbaseAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.pro.coinbase.com'
  // Cloudflare Inc ECC CA-3
  readonly _certFingerprint256 =
    '3A:BB:E6:3D:AF:75:6C:50:16:B6:B8:5F:52:01:5F:D8:E8:AC:BE:27:7C:50:87:B1:27:A6:05:63:A8:41:ED:8A'

  readonly _exchangeName = Exchange.COINBASE

  /**
   * Coinbase is currently using `CGLD` as the symbol for CELO. This is likely
   * to be changed at some point after listing.
   */
  private static readonly tokenSymbolMap = new Map<Currency, string>([
    ...CoinbaseAdapter.standardTokenSymbolMap,
    [CeloContract.GoldToken, 'CGLD'],
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
   * fetches recent trades from coinbase's api
   * returns trades in chronological order (oldest first, newest last)
   */
  async fetchTrades(): Promise<Trade[]> {
    const res = await this.fetchFromApi(
      ExchangeDataType.TRADE,
      `products/${this.pairSymbol}/trades`
    )
    return this.parseTrades(res).sort((a, b) => a.timestamp - b.timestamp)
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
   * @param json a json object from Coinbase's API
   * Expected format, as described in the docs
   * source: https://docs.pro.coinbase.com/#get-trades
   *
   *    [{
   *        time: "2014-11-07T22:19:28.578544Z",
   *        trade_id: 74,
   *        price: "10.00000000",
   *        size: "0.01000000",
   *        side: "buy"
   *    }, {
   *        time: "2014-11-07T01:08:43.642366Z",
   *        trade_id: 73,
   *        price: "100.00000000",
   *        size: "0.01000000",
   *        side: "sell"
   *    }]
   */
  parseTrades(json: any): Trade[] {
    return json.map((trade: any) => {
      const price = this.safeBigNumberParse(trade.price)
      const amount = this.safeBigNumberParse(trade.size)
      const normalizedTrade = {
        ...this.priceObjectMetadata,
        amount,
        cost: amount ? price?.times(amount) : undefined,
        id: trade.trade_id,
        price,
        side: trade.side,
        timestamp: this.safeDateParse(trade.time)!,
      }
      this.verifyTrade(normalizedTrade)
      return normalizedTrade
    })
  }

  /**
   * Checks if the orderbook for the relevant pair is live. If it's not, the price
   * data from Ticker + Trade endpoints may be inaccurate.
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
      res.limit_only === false &&
      res.cancel_only === false &&
      res.trading_disabled === false
    )
  }
}
