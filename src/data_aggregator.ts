import { strict as assert } from 'assert'
import BigNumber from 'bignumber.js'
import Logger from 'bunyan'
import * as aggregators from './aggregator_functions'
import { OracleApplicationConfig } from './app'
import { ExchangeAdapter, ExchangeAdapterConfig, Ticker } from './exchange_adapters/base'
import { BinanceAdapter } from './exchange_adapters/binance'
import { BittrexAdapter } from './exchange_adapters/bittrex'
import { CoinbaseAdapter } from './exchange_adapters/coinbase'
import { OKCoinAdapter } from './exchange_adapters/okcoin'
import { MetricCollector } from './metric_collector'
import {
  AggregationMethod,
  allSettled,
  CurrencyPairBaseQuote,
  Exchange,
  PromiseStatus,
  SettledPromise,
} from './utils'

function adapterFromExchangeName(name: Exchange, config: ExchangeAdapterConfig): ExchangeAdapter {
  switch (name) {
    case Exchange.BINANCE:
      return new BinanceAdapter(config)
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
   * A base instance of the logger that can be extended for a particular context
   */
  baseLogger: Logger
  /**
   * Max cross-sectional percentage deviation of bid prices
   */
  bidMaxPercentageDeviation: BigNumber
  /**
   * Currency pair to get the price of in centralized exchanges
   */
  currencyPair: OracleApplicationConfig['currencyPair']
  /**
   * Exchange APIs from which to collect data
   * DEFAULT: all exchanges that have adapters
   */
  exchanges?: Exchange[]
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
   * The minimum aggregate volume across all exchanges to report
   */
  minAggregatedVolume: BigNumber
}

/**
 * This class is responsible for processing the data collected from exchanges
 * to come up with a single price value for the current moment
 */
export class DataAggregator {
  public readonly config: DataAggregatorConfig
  exchangeAdapters: ExchangeAdapter[]

  private readonly logger: Logger

  /**
   * @param config Configuration params for the DataAggregator
   */
  constructor(config: DataAggregatorConfig) {
    this.config = config
    this.logger = this.config.baseLogger.child({ context: 'data_aggregator' })
    this.exchangeAdapters = this.setupExchangeAdapters()
  }

  private setupExchangeAdapters(): ExchangeAdapter[] {
    const adapterConfig = {
      apiRequestTimeout: this.config.apiRequestTimeout,
      baseCurrency: CurrencyPairBaseQuote[this.config.currencyPair].base,
      baseLogger: this.config.baseLogger,
      quoteCurrency: CurrencyPairBaseQuote[this.config.currencyPair].quote,
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
      case AggregationMethod.MIDPRICES:
        return this.currentPriceFromTickerData()
      default:
        throw Error(`Aggregation method ${this.config.aggregationMethod} not recognized`)
    }
  }

  async currentPriceFromTickerData(): Promise<BigNumber> {
    const allTickerData = await this.fetchAllTickers()
    let validTickerData = aggregators.checkIndividualTickerData(
      allTickerData,
      this.config.maxPercentageBidAskSpread,
      this.config.metricCollector,
      this.logger
    )
    validTickerData = aggregators.crossCheckTickerData(validTickerData, this.config)
    return aggregators.weightedMeanMidPrice(validTickerData)
  }
}
