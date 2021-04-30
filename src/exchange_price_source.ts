import { ExchangeAdapter, Ticker } from './exchange_adapters/base'
import BigNumber from 'bignumber.js'
import { PriceSource, WeightedPrice } from './price_source'
import { Exchange, OracleCurrencyPair } from './utils'
import { MetricCollector } from './metric_collector'
import { individualTickerChecks } from './aggregator_functions'

export interface OrientedExchangePair {
  exchange: Exchange
  symbol: OracleCurrencyPair
  toInvert: boolean
}

export interface ExchangePriceSourceConfig {
  pairs: OrientedExchangePair[]
}

export type OrientedAdapter = {
  adapter: ExchangeAdapter
  toInvert: boolean
}

export type PairData = {
  bid: BigNumber
  ask: BigNumber
  baseVolume: BigNumber
  quoteVolume: BigNumber
}

function invertPair(pair: PairData): PairData {
  return {
    bid: pair.ask.exponentiatedBy(-1),
    ask: pair.bid.exponentiatedBy(-1),
    baseVolume: pair.quoteVolume,
    quoteVolume: pair.baseVolume,
  }
}

function tickerToPairData(ticker: Ticker): PairData {
  return {
    bid: ticker.bid,
    ask: ticker.ask,
    baseVolume: ticker.baseVolume,
    // Using lastPrice to convert from baseVolume to quoteVolume, whereas
    // ideally one would use the baseVolume execution's VWAP.
    quoteVolume: ticker.baseVolume.multipliedBy(ticker.lastPrice),
  }
}

async function fetchPairData(
  adapter: OrientedAdapter,
  maxPercentageBidAskSpread: BigNumber,
  metricCollector?: MetricCollector
): Promise<PairData> {
  const ticker = await adapter.adapter.fetchTicker()

  // Validate fetched ticker -- will throw if invalid.
  individualTickerChecks(ticker, maxPercentageBidAskSpread)

  if (metricCollector) {
    metricCollector.ticker(ticker)
  }

  const pair = tickerToPairData(ticker)
  return adapter.toInvert ? invertPair(pair) : pair
}

function cumulativeProduct(array: BigNumber[]): BigNumber[] {
  if (array.length === 0) {
    return []
  }
  const prod: BigNumber[] = [array[0]]
  for (const x of array) {
    prod.push(prod[prod.length - 1].multipliedBy(x))
  }
  return prod
}

/**
 * Given a sequence of pairs data, calculate the data for the pair implied by
 * such sequence.
 *
 * Each instance of PairData contains a buy and a sell quote (bid and ask,
 * respectively), as well as the base and quote notional traded over a period
 * of time. The implied buy quote is the product of all buy quotes on the input
 * pairs data and, similarly, the implied sell quote is the product of all sell
 * quotes. The implied base notional is the smallest base notional of the input
 * pairs, once the notionals are converted to the base currency. Similarly the
 * implied quote notional is the smallest quote notional of the input pairs,
 * once they are converted to the quote currency.
 */
export function impliedPair(pairs: PairData[]): PairData {
  const bids = pairs.map((p) => p.bid)
  const asks = pairs.map((p) => p.ask)

  // Uses VWAP rates (derived from quote/base volumes) to convert the base and
  // quote volumes to the implied pair base and quote currencies, respectively.
  const averageRates = pairs.map((p) => p.quoteVolume.dividedBy(p.baseVolume))
  const convRates = [new BigNumber(1), ...averageRates.slice(0, -1)]
  const convFactors = cumulativeProduct(convRates)
  const convBaseVolumes = pairs.map((p, i) => p.baseVolume.multipliedBy(convFactors[i]))
  const convQuoteVolumes = pairs.map((p, i) => p.quoteVolume.multipliedBy(convFactors[i]))

  const bid = bids.reduce((a, b) => a.multipliedBy(b), new BigNumber(1))
  const ask = asks.reduce((a, b) => a.multipliedBy(b), new BigNumber(1))
  const baseVolume = BigNumber.min(...convBaseVolumes)
  const quoteVolume = BigNumber.min(...convQuoteVolumes)
  return { bid, ask, baseVolume, quoteVolume }
}

/**
 * MultiPairExchangePriceSource implements a PriceSource capable of fetching
 * Tickers from different exchanges and pairs and combining them into a single
 * WeightedPrice.
 */
export class MultiPairExchangePriceSource implements PriceSource {
  private adapters: OrientedAdapter[]
  private maxPercentageBidAskSpread: BigNumber
  private metricCollector?: MetricCollector

  constructor(
    adapters: OrientedAdapter[],
    maxPercentageBidAskSpread: BigNumber,
    metricCollector?: MetricCollector
  ) {
    this.adapters = adapters
    this.maxPercentageBidAskSpread = maxPercentageBidAskSpread
    this.metricCollector = metricCollector
  }

  /**
   * Returns a unique string representation of a source's adapters.
   *
   * Example: a MultiPairExchangePriceSource using two Binance adapters for the CELOBTC
   * and BTCEUR pairs would have "BINANCE:CELOBTC:false|BINANCE:BTCEUR:false" as a name.
   */
  name(): string {
    return this.adapters
      .map((adapter) => {
        return `${adapter.adapter.exchangeName}:${adapter.adapter.pairSymbol}:${adapter.toInvert}`
      })
      .join('|')
  }

  async fetchWeightedPrice(): Promise<WeightedPrice> {
    const fetcher = (adapter: OrientedAdapter) => {
      return fetchPairData(adapter, this.maxPercentageBidAskSpread, this.metricCollector)
    }
    const pairs = await Promise.all(this.adapters.map(fetcher))
    const pair = impliedPair(pairs)
    const mid = pair.bid.plus(pair.ask).dividedBy(2)
    return {
      price: mid,
      weight: pair.baseVolume,
    }
  }
}
