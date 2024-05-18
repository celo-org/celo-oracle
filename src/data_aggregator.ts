import * as aggregators from './aggregator_functions'

import {
  AggregationMethod,
  CurrencyPairBaseQuote,
  Exchange,
  OracleCurrencyPair,
  PromiseStatus,
  SettledPromise,
  allSettled,
} from './utils'
import { ExchangeAdapter, ExchangeAdapterConfig } from './exchange_adapters/base'
import {
  ExchangePriceSource,
  ExchangePriceSourceConfig,
  OrientedAdapter,
  OrientedExchangePair,
} from './exchange_price_source'
import { PriceSource, WeightedPrice } from './price_source'

import { AlphavantageAdapter } from './exchange_adapters/alphavantage'
import BigNumber from 'bignumber.js'
import { BinanceAdapter } from './exchange_adapters/binance'
import { BinanceUSAdapter } from './exchange_adapters/binance_us'
import { BitMartAdapter } from './exchange_adapters/bitmart'
import { BitgetAdapter } from './exchange_adapters/bitget'
import { BitsoAdapter } from './exchange_adapters/bitso'
import { BitstampAdapter } from './exchange_adapters/bitstamp'
import { BittrexAdapter } from './exchange_adapters/bittrex'
import { CoinbaseAdapter } from './exchange_adapters/coinbase'
import { CurrencyApiAdapter } from './exchange_adapters/currencyapi'
import { GeminiAdapter } from './exchange_adapters/gemini'
import { KrakenAdapter } from './exchange_adapters/kraken'
import { KuCoinAdapter } from './exchange_adapters/kucoin'
import Logger from 'bunyan'
import { MercadoAdapter } from './exchange_adapters/mercado'
import { MetricCollector } from './metric_collector'
import { NovaDaxAdapter } from './exchange_adapters/novadax'
import { OKCoinAdapter } from './exchange_adapters/okcoin'
import { OKXAdapter } from './exchange_adapters/okx'
import { OracleApplicationConfig } from './app'
import { WhitebitAdapter } from './exchange_adapters/whitebit'
import { XigniteAdapter } from './exchange_adapters/xignite'
import { strict as assert } from 'assert'
import { CertificateManager } from './certs_manager'

function adapterFromExchangeName(name: Exchange, config: ExchangeAdapterConfig): ExchangeAdapter {
  switch (name) {
    case Exchange.BINANCE:
      return new BinanceAdapter(config)
    case Exchange.BINANCEUS:
      return new BinanceUSAdapter(config)
    case Exchange.BITTREX:
      return new BittrexAdapter(config)
    case Exchange.COINBASE:
      return new CoinbaseAdapter(config)
    case Exchange.OKCOIN:
      return new OKCoinAdapter(config)
    case Exchange.BITSO:
      return new BitsoAdapter(config)
    case Exchange.NOVADAX:
      return new NovaDaxAdapter(config)
    case Exchange.GEMINI:
      return new GeminiAdapter(config)
    case Exchange.KRAKEN:
      return new KrakenAdapter(config)
    case Exchange.KUCOIN:
      return new KuCoinAdapter(config)
    case Exchange.BITSTAMP:
      return new BitstampAdapter(config)
    case Exchange.MERCADO:
      return new MercadoAdapter(config)
    case Exchange.OKX:
      return new OKXAdapter(config)
    case Exchange.WHITEBIT:
      return new WhitebitAdapter(config)
    case Exchange.BITGET:
      return new BitgetAdapter(config)
    case Exchange.BITMART:
      return new BitMartAdapter(config)
    case Exchange.ALPHAVANTAGE:
      return new AlphavantageAdapter(config)
    case Exchange.CURRENCYAPI:
      return new CurrencyApiAdapter(config)
    case Exchange.XIGNITE:
      return new XigniteAdapter(config)
  }
}

type AdapterFactory = (exchange: Exchange, pair: OracleCurrencyPair) => ExchangeAdapter

function priceSourceFromConfig(
  adapterFactory: AdapterFactory,
  config: ExchangePriceSourceConfig,
  maxPercentageBidAskSpread: BigNumber,
  metricCollector?: MetricCollector
): ExchangePriceSource {
  const adapters = config.pairs.map(
    (pair: OrientedExchangePair): OrientedAdapter => ({
      adapter: adapterFactory(pair.exchange, pair.symbol),
      toInvert: pair.toInvert,
      ignoreVolume: pair.ignoreVolume,
    })
  )
  return new ExchangePriceSource(adapters, maxPercentageBidAskSpread, metricCollector)
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
   * A set of available API keys per exchange (for those that require one)
   */
  apiKeys: Partial<Record<Exchange, string>>
  /**
   * Maximum number of milliseconds a single request is allowed to take. Any
   * request taking longer will be aborted and considered an error.
   */
  apiRequestTimeout?: number
  /**
   * A base instance of the logger that can be extended for a particular context
   */
  baseLogger: Logger
  /**
   * If the oracles should be in development mode, which doesn't require a node nor account key
   */
  devMode: boolean
  /**
   * Currency pair to get the price of in centralized exchanges
   */
  currencyPair: OracleApplicationConfig['currencyPair']
  /**
   * Price sources from which to collect data
   */
  priceSourceConfigs?: ExchangePriceSourceConfig[]
  /**
   * Max weight share of a single source
   */
  maxSourceWeightShare: BigNumber
  /**
   * Max percentage bid ask spread
   */
  maxPercentageBidAskSpread: BigNumber
  /**
   * Max cross-sectional percentage deviation of prices
   */
  maxPercentageDeviation: BigNumber
  /**
   * An optional instance of a MetricCollector for reporting metrics
   */
  metricCollector?: MetricCollector
  /**
   * Minimum number of price sources required to provide data to calculate price
   */
  minPriceSourceCount: number
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
  priceSources: PriceSource[]
  certificatesManager: CertificateManager

  private readonly logger: Logger

  /**
   * @param config Configuration params for the DataAggregator
   */
  constructor(config: DataAggregatorConfig) {
    this.config = config
    this.logger = this.config.baseLogger.child({ context: 'data_aggregator' })
    this.certificatesManager = new CertificateManager('http://localhost:8000/certificates.json', this.config.baseLogger)
    this.priceSources = this.setupPriceSources()
  }

  private setupPriceSources(): PriceSource[] {
    const baseAdapterConfig = {
      apiRequestTimeout: this.config.apiRequestTimeout,
      baseLogger: this.config.baseLogger,
      certificateManager: this.certificatesManager,
      metricCollector: this.config.metricCollector,
    }
    const adapterFactory: AdapterFactory = (
      exchange: Exchange,
      pair: OracleCurrencyPair
    ): ExchangeAdapter => {
      const config = {
        ...baseAdapterConfig,
        apiKey: this.config.apiKeys[exchange],
        baseCurrency: CurrencyPairBaseQuote[pair].base,
        quoteCurrency: CurrencyPairBaseQuote[pair].quote,
      }
      return adapterFromExchangeName(exchange, config)
    }

    const priceSourceConfigs = this.config.priceSourceConfigs ?? ([] as ExchangePriceSourceConfig[])
    this.logger.info({ priceSources: priceSourceConfigs }, 'Setting up price sources')
    return priceSourceConfigs.map((sourceConfig) => {
      const source = priceSourceFromConfig(
        adapterFactory,
        sourceConfig,
        this.config.maxPercentageBidAskSpread,
        this.config.metricCollector
      )
      this.logger.info(
        {
          sourceConfig,
        },
        'Set up price source'
      )
      return source
    })
  }

  /**
   * fetchAllPrices will gather ticker data from all exchanges.
   * If some exchange tickers fail but at least one other succeeds,
   * this will resolve.
   * If all tickers fail, this will reject
   */
  async fetchAllPrices(): Promise<WeightedPrice[]> {
    this.certificatesManager.refreshIfOutdated();
    const pricePromises: Promise<WeightedPrice>[] = this.priceSources.map((source) =>
      source.fetchWeightedPrice()
    )
    const allPrices = await allSettled(pricePromises)

    // Record any failures
    for (let i = 0; i < allPrices.length; i++) {
      if (allPrices[i].status === PromiseStatus.REJECTED) {
        const source = this.priceSources[i]
        this.logger.warn(
          {
            source: source.name(),
            err: allPrices[i].value,
          },
          'Fetching price failed'
        )
        this.config.metricCollector?.error(source.name())
      } else if (allPrices[i].status === PromiseStatus.RESOLVED) {
        // Record the price using MetricCollector.
        this.config.metricCollector?.priceSource(
          this.config.currencyPair,
          this.priceSources[i].name(),
          allPrices[i].value
        )
      }
    }

    // Remove failed requests.
    const successfulPriceData: WeightedPrice[] = allPrices
      .filter((promise: SettledPromise) => promise.status === PromiseStatus.RESOLVED)
      .map((promise: SettledPromise) => promise.value)

    assert(successfulPriceData.length > 0, `All price requests failed`)

    return successfulPriceData
  }

  async currentPrice(): Promise<BigNumber> {
    switch (this.config.aggregationMethod) {
      case AggregationMethod.MIDPRICES:
        return this.weightedMeanMidPrice()
      default:
        throw Error(`Aggregation method ${this.config.aggregationMethod} not recognized`)
    }
  }

  async weightedMeanMidPrice(): Promise<BigNumber> {
    const allPriceData = await this.fetchAllPrices()
    const validPriceData = aggregators.crossCheckPriceData(allPriceData, this.config)
    return aggregators.weightedMeanPrice(validPriceData)
  }
}
