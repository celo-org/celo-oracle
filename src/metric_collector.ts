import { BigNumber } from 'bignumber.js'
import Logger from 'bunyan'
import express, { Response } from 'express'
import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from 'prom-client'
import { Transaction, TransactionReceipt } from 'web3-core'
import { Ticker } from './exchange_adapters/base'
import { Exchange, msToSeconds, RequiredKeysOfType } from './utils'
import { WeightedPrice } from './price_source'

/**
 * Represents a particular context in the oracle client
 */
export enum Context {
  APP = 'app',
  BLOCK_HEADER_SUBSCRIPTION = 'block_header_subscription',
  EXPIRY = 'expiry',
  REPORT = 'report',
  REPORT_PRICE = 'report_price',
  WALLET_INIT = 'wallet_init',
  TRANSACTION_MANAGER = 'tranaction_manager',
}

export enum ExchangeApiRequestError {
  FETCH = 'fetch',
  JSON_PARSE = 'json_parse',
  ORDERBOOK_STATUS = 'orderbook_status',
}

type ExchangeApiRequestErrorType = number | ExchangeApiRequestError

/**
 * A valid context for an error metric
 */
export type ErrorContext = Context | Exchange | string

/**
 * The reason for a report
 */
export enum ReportTrigger {
  TIMER = 'timer',
  HEARTBEAT = 'heartbeat',
  PRICE_CHANGE = 'price_change',
}

export enum BlockType {
  ANY = 'any',
  ASSIGNED = 'assigned',
}

export class MetricCollector {
  private actionDurationHist: Histogram<string>

  private errorsTotalCounter: Counter<string>

  private exchangeApiRequestDurationHist: Histogram<string>
  private exchangeApiRequestErrorCounter: Counter<string>

  private lastBlockHeaderNumberGauge: Gauge<string>

  private potentialReportValueGauge: Gauge<string>

  private reportCountCounter: Counter<string>
  private reportTimeSinceLastReportGauge: Gauge<string>
  private reportValueGauge: Gauge<string>

  private tickerPropertyGauge: Gauge<string>
  private priceSourceGauge: Gauge<string>

  private transactionBlockNumberGauge: Gauge<string>
  private transactionGasGauge: Gauge<string>
  private transactionGasPriceGauge: Gauge<string>
  private transactionGasUsedGauge: Gauge<string>
  private transactionSuccessCountCounter: Counter<string>

  private websocketProviderSetupCounter: Counter<string>

  private readonly logger: Logger

  constructor(logger: Logger) {
    this.logger = logger

    this.actionDurationHist = new Histogram({
      name: 'oracle_action_duration',
      help: 'Histogram of various async actions',
      labelNames: ['type', 'action', 'currencyPair'],
      buckets: [0.02, 0.05, 0.5, 0.75, 1, 10],
    })

    this.errorsTotalCounter = new Counter({
      name: 'oracle_errors_total',
      help: 'The total number of errors in various contexts',
      labelNames: ['context'],
    })
    this.initializeErrorsTotalCounter()

    this.exchangeApiRequestDurationHist = new Histogram({
      name: 'oracle_exchange_api_request_duration_seconds',
      help: 'Histogram of exchange API request durations in seconds',
      labelNames: ['exchange', 'endpoint', 'pair'],
      buckets: [0.2, 0.5, 0.75, 1, 2],
    })

    this.exchangeApiRequestErrorCounter = new Counter({
      name: 'oracle_exchange_api_request_error_count',
      help:
        'Counts the number of exchange API request errors and their http status code or other type of error',
      labelNames: ['exchange', 'endpoint', 'pair', 'type'],
    })

    this.lastBlockHeaderNumberGauge = new Gauge({
      name: 'oracle_last_block_header_number',
      help: 'Gauge to indicate the last block number seen when using block based reporting',
      labelNames: ['type'],
    })

    this.potentialReportValueGauge = new Gauge({
      name: 'oracle_potential_report_value',
      help:
        'Gauge to show the most recently evaluated price to report when using block-based reporting',
      labelNames: ['currencyPair'],
    })

    this.reportCountCounter = new Counter({
      name: 'oracle_report_count',
      help: 'Counts the number of reports by trigger',
      labelNames: ['currencyPair', 'trigger'],
    })

    this.reportTimeSinceLastReportGauge = new Gauge({
      name: 'oracle_report_time_since_last_report_seconds',
      help: 'Gauge of the time in seconds between reports',
      labelNames: ['currencyPair'],
    })

    this.reportValueGauge = new Gauge({
      name: 'oracle_report_value',
      help: 'Gauge of the most recently reported value for a currencyPair',
      labelNames: ['currencyPair'],
    })

    this.tickerPropertyGauge = new Gauge({
      name: 'oracle_ticker_property',
      help: 'Gauge indicating values of various properties from ticker data',
      labelNames: ['exchange', 'pair', 'property'],
    })

    this.priceSourceGauge = new Gauge({
      name: 'oracle_price_source',
      help: 'Gauge indicating values from different price sources',
      labelNames: ['pair', 'source', 'property'],
    })

    this.transactionBlockNumberGauge = new Gauge({
      name: 'oracle_transaction_block_number',
      help: 'Gauge showing the block number of the most recent transaction defined by type',
      labelNames: ['type', 'currencyPair'],
    })

    this.transactionGasGauge = new Gauge({
      name: 'oracle_transaction_gas',
      help: 'Gauge of the gas provided for the most recent transaction defined by type',
      labelNames: ['type', 'currencyPair'],
    })

    this.transactionGasPriceGauge = new Gauge({
      name: 'oracle_transaction_gas_price',
      help: 'Gauge of the gas price for the most recent transaction defined by type',
      labelNames: ['type', 'currencyPair'],
    })

    this.transactionGasUsedGauge = new Gauge({
      name: 'oracle_transaction_gas_used',
      help: 'Gauge of amount of gas used for the most recent transaction defined by type',
      labelNames: ['type', 'currencyPair'],
    })

    this.transactionSuccessCountCounter = new Counter({
      name: 'oracle_transaction_success_count',
      help:
        'Counts the number of successful transactions defined by type that have been mined on chain',
      labelNames: ['type', 'currencyPair'],
    })

    this.websocketProviderSetupCounter = new Counter({
      name: 'oracle_websocket_provider_setup_counter',
      help: 'Counts the number of times the websocket provider has been setup',
    })
  }

  /**
   * Increments the error count for a particular context in the oracle client
   */
  error(context: ErrorContext) {
    this.errorsTotalCounter.inc({ context })
  }

  /**
   * Initializes some counters relevant for the exchange API request.
   * This allows us to create tools based off these metrics even if none
   * of the metric situations have occurred at the time of the tool creation.
   */
  exchangeApiRequest(exchange: string, endpoint: string, pair: string) {
    const defaultTypes: ExchangeApiRequestErrorType[] = [
      ...Object.values(ExchangeApiRequestError),
      // an example numeric type (which is an http status code)
      500,
    ]
    for (const type of defaultTypes) {
      this.exchangeApiRequestErrorCounter.inc(
        {
          exchange,
          endpoint,
          pair,
          type,
        },
        0
      )
    }
  }

  /**
   * Observes the duration for a particular API request to an exchange
   */
  exchangeApiRequestDuration(exchange: string, endpoint: string, pair: string, durationMs: number) {
    this.exchangeApiRequestDurationHist.observe(
      { exchange, endpoint, pair },
      msToSeconds(durationMs)
    )
  }

  /*
   * Indicates that an not-ok http status code was returned, or some other error
   * occurred when fetching from an exchange for a given endpoint and pair.
   */
  exchangeApiRequestError(
    exchange: string,
    endpoint: string,
    pair: string,
    type: ExchangeApiRequestErrorType
  ) {
    this.exchangeApiRequestErrorCounter.inc({ exchange, endpoint, pair, type })
  }

  /**
   * Observes the duration of a particular action when expiring reports
   */
  expiryDuration(action: string, currencyPair: string, durationMs: number) {
    this.actionDuration('expiry', action, currencyPair, durationMs)
  }

  /**
   * Sets relevant gauges following a successful report transaction
   */
  expiryTransaction(
    currencyPair: string,
    transaction: Transaction,
    transactionReceipt: TransactionReceipt
  ) {
    this.transaction('expiry', currencyPair, transaction, transactionReceipt)
  }

  /**
   * Observes the duration of a particular action when reporting
   */
  reportDuration(action: string, currencyPair: string, durationMs: number) {
    this.actionDuration('report', action, currencyPair, durationMs)
  }

  /**
   * Sets relevant gauges following a successful report transaction
   */
  reportTransaction(
    currencyPair: string,
    transaction: Transaction,
    transactionReceipt: TransactionReceipt,
    reportedValue: BigNumber,
    trigger: ReportTrigger
  ) {
    this.transaction('report', currencyPair, transaction, transactionReceipt)
    this.reportValueGauge.set({ currencyPair }, reportedValue.toNumber())
    this.reportCountCounter.inc({ currencyPair, trigger })
  }

  potentialReport(currencyPair: string, value: BigNumber) {
    this.potentialReportValueGauge.set({ currencyPair }, value.toNumber())
  }

  timeBetweenReports(currencyPair: string, value: number) {
    this.reportTimeSinceLastReportGauge.set({ currencyPair }, value)
  }

  /**
   * Records some metrics on some properties given a ticker
   */
  ticker(ticker: Ticker) {
    const { source: exchange, symbol: pair } = ticker
    const properties: RequiredKeysOfType<Ticker, BigNumber | number>[] = [
      'ask',
      'baseVolume',
      'bid',
      'lastPrice',
      'timestamp',
    ]
    for (const property of properties) {
      const rawValue = ticker[property]
      const value = BigNumber.isBigNumber(rawValue) ? rawValue.toNumber() : (rawValue as number)
      this.tickerPropertyGauge.set(
        {
          exchange,
          pair,
          property,
        },
        value
      )
    }
  }

  /**
   * Records price and weight for a price source.
   */
  priceSource(pair: string, source: string, weightedPrice: WeightedPrice) {
    this.priceSourceGauge.set({ pair, source, property: 'price' }, weightedPrice.price.toNumber())
    this.priceSourceGauge.set({ pair, source, property: 'weight' }, weightedPrice.weight.toNumber())
  }

  /**
   * Indicates the most recent block number of a specific type
   */
  blockHeaderNumber(type: BlockType, blockNumber: number) {
    this.lastBlockHeaderNumberGauge.set({ type }, blockNumber)
  }

  websocketProviderSetup() {
    this.websocketProviderSetupCounter.inc()
  }

  /**
   * Sets relevant gauges and counters following a successful transaction
   */
  private transaction(
    type: string,
    currencyPair: string,
    transaction: Transaction,
    transactionReceipt: TransactionReceipt
  ) {
    this.transactionBlockNumberGauge.set({ type, currencyPair }, transactionReceipt.blockNumber)
    this.transactionGasGauge.set({ type, currencyPair }, transaction.gas)
    this.transactionGasPriceGauge.set({ type, currencyPair }, parseInt(transaction.gasPrice, 10))
    this.transactionGasUsedGauge.set({ type, currencyPair }, transactionReceipt.gasUsed)
    this.transactionSuccessCountCounter.inc({ type, currencyPair })
  }

  /*
   * Observes the duration of a particular action for a general type
   */
  private actionDuration(type: string, action: string, currencyPair: string, durationMs: number) {
    this.actionDurationHist.observe({ type, action, currencyPair }, msToSeconds(durationMs))
  }

  /**
   * Initialize counters for all possible types of errors.
   * This allows us to create tools based off these metrics even if none
   * of the errors have occurred at the time of the tool creation, because
   * a value is needed in order for StackDriver to create the metric
   */
  private initializeErrorsTotalCounter() {
    const contexts = [...Object.values(Context), ...Object.values(Exchange)]
    for (const context of contexts) {
      this.errorsTotalCounter.inc({ context }, 0)
    }
  }

  /**
   * Starts a server that exposes metrics in the prometheus format
   */
  startServer(port: number) {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw Error(`Invalid PrometheusPort value: ${port}`)
    }
    const server = express()
    server.get('/metrics', (_, res: Response) => {
      res.set('Content-Type', register.contentType)
      res.end(register.metrics())
    })
    // Enable collection of default metrics
    collectDefaultMetrics()

    this.logger.info(
      {
        endpoint: `http://0.0.0.0:${port}/metrics`,
      },
      'Prometheus metrics exposed'
    )
    server.listen(port)
  }
}
