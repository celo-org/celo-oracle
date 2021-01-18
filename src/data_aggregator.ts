import { strict as assert } from 'assert'
import BigNumber from 'bignumber.js'
import Logger from 'bunyan'
import * as aggregators from './aggregator_functions'
import { ExchangeAdapter, ExchangeAdapterConfig, Ticker, Trade } from './exchange_adapters/base'
import { BittrexAdapter } from './exchange_adapters/bittrex'
import { CoinbaseAdapter } from './exchange_adapters/coinbase'
import { OKCoinAdapter } from './exchange_adapters/okcoin'
import { MetricCollector } from './metric_collector'
import {
  AggregationMethod,
  allSettled,
  Currency,
  Exchange,
  PromiseStatus,
  SettledPromise,
} from './utils'

function adapterFromExchangeName(name: Exchange, config: ExchangeAdapterConfig): ExchangeAdapter {
  switch (name) {
    case Exchange.BITTREX:
      return new BittrexAdapter(config)
    case Exchange.COINBASE:
      return new CoinbaseAdapter(config)
    case Exchange.OKCOIN:
      return new OKCoinAdapter(config)
  }
}
export interface DataAggregatorConfig {
  /**
   * Method used for aggregation
   */
  allowNotCGLD: boolean
  /**
   * Method used for aggregation
   */
  aggregationMethod: AggregationMethod
  /**
   * Milliseconds before now to use in current price calculation
   */
  aggregationWindowDuration: number
  /**
   * Maximum number of milliseconds a single request is allowed to take. Any
   * request taking longer will be aborted and considered an error.
   */
  apiRequestTimeout?: number
  /**
   * Max cross-sectional percentage deviation of ask prices
   */
  askMaxPercentageDeviation: BigNumber
  /**
   * Currency to get the price of
   */
  baseCurrency: Currency
  /**
   * A base instance of the logger that can be extended for a particular context
   */
  baseLogger: Logger
  /**
   * Max cross-sectional percentage deviation of bid prices
   */
  bidMaxPercentageDeviation: BigNumber
  /**
   * Exchange APIs from which to collect data
   * DEFAULT: all exchanges that have adapters
   */
  exchanges?: Exchange[]
  /**
   * Milliseconds between API calls to fetch data
   */
  fetchFrequency: number
  /**
   * Max volume share of a single exchange
   */
  maxExchangeVolumeShare: BigNumber
  /**
   * Maximum duration in ms between the most recent trade and the fetch time
   */
  maxNoTradeDuration: number
  /**
   * Max percentage bid ask spread
   */
  maxPercentageBidAskSpread: BigNumber
  /**
   * An optional instance of a MetricCollector for reporting metrics
   */
  metricCollector?: MetricCollector
  /**
   * Minimum number of exchanges required to provide data to calculate price
   */
  minExchangeCount: number
  /**
   * Minimum number of total trades required to calculate price
   */
  minTradeCount: number
  /**
   * Currency in which to get the price of the baseCurrency
   */
  quoteCurrency: Currency
  /**
   * Rate used to apply exponential scaling to the amount of past trades
   */
  scalingRate: BigNumber
  /**
   * The minimum aggregate volume across all exchanges to report
   */
  minAggregatedVolume: BigNumber
}

/**
 * This class is responsible for processing the data collected from exchanges
 * to come up with a single price value for the current moment
 */
export class DataAggregator {
  private lastFetchTime: number

  public readonly config: DataAggregatorConfig
  exchangeAdapters: ExchangeAdapter[]

  private readonly logger: Logger

  /**
   * @param config Configuration params for the DataAggregator
   */
  constructor(config: DataAggregatorConfig) {
    this.config = config
    this.logger = this.config.baseLogger.child({ context: 'data_aggregator' })
    this.lastFetchTime = NaN
    this.exchangeAdapters = this.setupExchangeAdapters()
  }

  private setupExchangeAdapters(): ExchangeAdapter[] {
    const adapterConfig = {
      apiRequestTimeout: this.config.apiRequestTimeout,
      baseCurrency: this.config.baseCurrency,
      baseLogger: this.config.baseLogger,
      dataRetentionWindow: this.config.aggregationWindowDuration * 2,
      fetchFrequency: this.config.fetchFrequency,
      quoteCurrency: this.config.quoteCurrency,
      metricCollector: this.config.metricCollector,
    }

    if (!this.config.exchanges) {
      this.config.exchanges = Object.keys(Exchange).map((e) => e as Exchange)
    }

    // Protect against duplicates
    this.config.exchanges = [...new Set(this.config.exchanges)]
    this.logger.info({ exchanges: this.config.exchanges }, 'Setting up exchange adapter set')

    return this.config.exchanges.map((exchange) => {
      const adapter = adapterFromExchangeName(exchange, adapterConfig)
      this.logger.info(
        {
          exchange,
          adapterConfig,
        },
        'Set up exchange adapter'
      )
      return adapter
    })
  }

  /**
   * If appropriate to the aggregation method, kick off the cycle of collecting
   * data from all exchanges
   */
  startDataCollection(): void {
    if (this.config.aggregationMethod === AggregationMethod.TRADES) {
      for (const adapter of this.exchangeAdapters) {
        adapter.startCollectingTrades()
      }
    }
  }

  stopDataCollection(): void {
    if (this.config.aggregationMethod === AggregationMethod.TRADES) {
      for (const adapter of this.exchangeAdapters) {
        adapter.stopCollectingTrades()
      }
    }
  }

  get tradesPerExchange(): Trade[][] {
    const tradesInWindow: Trade[][] = []
    this.lastFetchTime = Date.now()
    for (const exchangeAdapter of this.exchangeAdapters) {
      tradesInWindow.push(
        exchangeAdapter.tradesSince(this.lastFetchTime - this.config.aggregationWindowDuration)
      )
    }
    return tradesInWindow
  }

  constrainAcrossExchanges(values: Trade[][], exchangeFactor: number): Trade[][] {
    const weightsPerExchange = values
      .map((tradeArray) => tradeArray.map((trade) => trade.amount))
      .map((amounts: BigNumber[]) => amounts.reduce((x, y) => x.plus(y)))
    const totalWeight = weightsPerExchange.reduce((x, y) => x.plus(y))
    const maxWeightBelowThreshold = BigNumber.max.apply(
      null,
      weightsPerExchange.filter((x) => x <= totalWeight.multipliedBy(exchangeFactor))
    )
    // TODO: Make sure dividedby applied to very small number doesn't return exact 0
    const constrainedValues = values.map((tradeArray, i) => {
      if (weightsPerExchange[i] > totalWeight.multipliedBy(exchangeFactor)) {
        return tradeArray.map((trade) => {
          const amount = trade.amount
            .multipliedBy(maxWeightBelowThreshold)
            .dividedBy(weightsPerExchange[i])
          return { ...trade, amount }
        })
      } else {
        return tradeArray
      }
    })
    return constrainedValues
  }

  timeScalingVolume(tradesPerExchange: Trade[][], mostRecentTradeTimestamp: number) {
    // time argument of exponentialWeights needs to be a time delta now-timestamp
    const valuesTimeScaled = tradesPerExchange.map((trades) =>
      trades.map((trade) => {
        const amount = aggregators.exponentialWeights(
          trade.amount,
          mostRecentTradeTimestamp - trade.timestamp,
          this.config.scalingRate
        )
        return { ...trade, amount }
      })
    )
    return valuesTimeScaled
  }

  requireValidTrades(tradesPerExchange: Trade[][], mostRecentTradeTimestamp: number) {
    const { maxNoTradeDuration, minExchangeCount, minTradeCount } = this.config

    // Require trades from minNumberOfExchanges exchanges
    if (tradesPerExchange.length < minExchangeCount) {
      throw Error(
        `An insufficient number of exchanges provided data: ${tradesPerExchange.length} < ${minExchangeCount}`
      )
    }
    // Require at least minTradeCount trades across all exchanges
    const totalTradeCount = tradesPerExchange.reduce(
      (sum: number, trades: Trade[]) => sum + trades.length,
      0
    )
    if (totalTradeCount < minTradeCount) {
      throw Error(
        `An insufficient number of total trades has been provided: ${totalTradeCount} < ${minTradeCount}`
      )
    }
    // Require the most recent trade timestamp relative to the lastFetchTime to
    // be within the maxNoTradeDuration
    const mostRecentTradeAgeAtFetch = this.lastFetchTime - mostRecentTradeTimestamp
    if (mostRecentTradeAgeAtFetch > maxNoTradeDuration) {
      throw Error(
        `The most recent trade was executed too far in the past: ${mostRecentTradeAgeAtFetch} > ${maxNoTradeDuration}`
      )
    }
  }

  /**
   * fetchAllTickers will gather ticker data from all exchanges.
   * If some exchange tickers fail but at least one other succeeds,
   * this will resolve.
   * If all tickers fail, this will reject
   */
  async fetchAllTickers(): Promise<Ticker[]> {
    const exchangeAdaptersArr = Array.from(this.exchangeAdapters)
    const allTickerPromises: Promise<Ticker>[] = exchangeAdaptersArr.map((exchangeAdapter) =>
      exchangeAdapter.fetchTicker()
    )
    const allTickerData = await allSettled(allTickerPromises)

    // Record any failures
    for (let i = 0; i < exchangeAdaptersArr.length; i++) {
      if (allTickerData[i].status === PromiseStatus.REJECTED) {
        const exchange = exchangeAdaptersArr[i].exchangeName
        this.logger.warn(
          {
            exchange,
            err: allTickerData[i].value,
          },
          'Fetching ticker failed'
        )
        this.config.metricCollector?.error(exchange)
      }
    }

    // Remove failed requests
    const successfulTickerData: Ticker[] = allTickerData
      .filter((settledTicker: SettledPromise) => settledTicker.status === PromiseStatus.RESOLVED)
      .map((settledTicker: SettledPromise) => {
        const ticker: Ticker = settledTicker.value
        // Record the ticker with the metric collector
        this.config.metricCollector?.ticker(ticker)
        return ticker
      })

    assert(successfulTickerData.length > 0, `All ticker requests failed`)

    return successfulTickerData
  }

  async currentPrice(): Promise<BigNumber> {
    switch (this.config.aggregationMethod) {
      case AggregationMethod.TRADES:
        return this.currentPriceFromTrades()
      case AggregationMethod.MIDPRICES:
        return this.currentPriceFromTickerData()
      default:
        throw Error(`Aggregation method ${this.config.aggregationMethod} not recognized`)
    }
  }

  async currentPriceFromTrades(): Promise<BigNumber> {
    let tradesPerExchange = this.tradesPerExchange
    // Removing exchanges without trades within fetchTime - aggregationWindowDuration
    tradesPerExchange = tradesPerExchange.filter((trades) => trades.length > 0)

    // Assumes that trades per exchange are sorted by timestamp
    const mostRecentTradeTimestamp = Math.max(
      ...tradesPerExchange.map((trades) => trades[trades.length - 1].timestamp)
    )
    this.requireValidTrades(tradesPerExchange, mostRecentTradeTimestamp)

    tradesPerExchange = this.timeScalingVolume(tradesPerExchange, mostRecentTradeTimestamp)

    return aggregators.weightedMedian(
      tradesPerExchange.reduce(
        (flattenedTrades: Trade[], trades) => flattenedTrades.concat(trades),
        []
      )
    )
  }

  async currentPriceFromTickerData(): Promise<BigNumber> {
    const allTickerData = await this.fetchAllTickers()
    return aggregators.weightedMeanMidPrice(allTickerData, this.config, this.logger)
  }
}
