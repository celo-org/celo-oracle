import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker } from './base'

import { Exchange } from '../utils'

export class MercadoAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.mercadobitcoin.net/api/v4'
  readonly _exchangeName = Exchange.MERCADO

  private static readonly tokenSymbolMap = MercadoAdapter.standardTokenSymbolMap

  protected generatePairSymbol(): string {
    const base = MercadoAdapter.tokenSymbolMap.get(this.config.baseCurrency)
    const quote = MercadoAdapter.tokenSymbolMap.get(this.config.quoteCurrency)
    return `${base}-${quote}`
  }

  async fetchTicker(): Promise<Ticker> {
    const [tickerJson, orderbookJson] = await Promise.all([
      this.fetchFromApi(ExchangeDataType.TICKER, `tickers?symbols=${this.pairSymbol}`),
      this.fetchFromApi(ExchangeDataType.TICKER, `${this.pairSymbol}/orderbook`),
    ])
    return this.parseTicker(tickerJson, orderbookJson)
  }

  /**
   *
   * @param json parsed response from mercado's orderbook endpoint
   * https://api.mercadobitcoin.net/api/v4/docs#tag/Public-Data/paths/~1{symbol}~1orderbook/get
   * https://api.mercadobitcoin.net/api/v4/BTC-BRL/orderbook
   * "asks":[
   *   ["117275.49879111", "0.0256"],
   *   ["117532.16627745", "0.01449"],
   *   ...
   * ],
   * "bids":[
   *    ["117223.32117", "0.00001177"],
   *    ["117200", "0.00002"],
   *    .....
   * ]
   *
   * @param json parsed response from mercado's ticker endpoint
   * https://api.mercadobitcoin.net/api/v4/docs#tag/Public-Data/paths/~1tickers/get
   * https://api.mercadobitcoin.net/api/v4/tickers?symbols=BTC-BRL
   * [
   *  {
   *  "pair":"BTC-BRL",
   *  "high":"120700.00000000",
   *  "low":"117000.00001000",
   *  "vol":"52.00314436",
   *  "last":"119548.04744932",
   *  "buy":"119457.96889001",
   *  "sell":"119546.04397687",
   *  "open":"119353.86994450",
   *  "date":1674561363
   *  }
   * ]
   *
   */
  // Using lastPrice to convert from baseVolume to quoteVolume, as Mercado's
  // API does not provide this information. The correct price for the
  // conversion would be the VWAP over the period contemplated by the ticker,
  // but it's also not available. As a price has to be chosen for the
  // conversion, and none of them are correct, lastPrice is chose as it
  // was actually on one trade (whereas the buy or sell could have no
  // relation to the VWAP).

  parseTicker(tickerJson: any, orderbookJson: any): Ticker {
    const baseVolume = this.safeBigNumberParse(tickerJson[0].vol)!
    const lastPrice = this.safeBigNumberParse(tickerJson[0].last)!
    const quoteVolume = baseVolume?.multipliedBy(lastPrice)
    const ticker = {
      ...this.priceObjectMetadata,
      ask: this.safeBigNumberParse(orderbookJson.asks[0][0])!,
      baseVolume,
      bid: this.safeBigNumberParse(orderbookJson.bids[0][0])!,
      lastPrice,
      quoteVolume,
      timestamp: this.safeBigNumberParse(tickerJson[0].date)?.toNumber()!,
    }
    this.verifyTicker(ticker)
    return ticker
  }

  /**
   * @param json parsed response from mercado's symbols endpoint
   * Checks status of orderbook
   *
   * https://api.mercadobitcoin.net/api/v4/symbols?symbols=BTC-BRL
   * https://api.mercadobitcoin.net/api/v4/docs#tag/Public-Data/paths/~1symbols/get
   * {
   * "symbol":[ "BTC-BRL" ],
   * "description":[ "Bitcoin" ],
   * "currency":[ "BRL" ],
   * "base-currency":[ "BTC" ],
   * "exchange-listed":[ true ],
   * "exchange-traded":[ true ],
   * "minmovement":[ "1" ],
   * "pricescale":[ 100000000 ],
   * "type":[ "CRYPTO" ],
   * "timezone":[ "America/Sao_Paulo" ],
   * "session-regular":[ "24x7" ],
   * "withdrawal-fee":[ "0.0004" ],
   * "withdraw-minimum":[ "0.001" ],
   * "deposit-minimum":[ "0.00001" ]
   * }
   *
   * @returns bool
   */
  async isOrderbookLive(): Promise<boolean> {
    const response = await this.fetchFromApi(
      ExchangeDataType.ORDERBOOK_STATUS,
      `symbols?symbols=${this.pairSymbol}`
    )
    return (
      !!response &&
      response['exchange-traded'][0] === true &&
      response['exchange-listed'][0] === true
    )
  }
}
