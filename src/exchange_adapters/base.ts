import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import Logger from 'bunyan'
import https from 'https'
import fetch, { Response } from 'node-fetch'
import tls from 'tls'
import { ExchangeApiRequestError, MetricCollector } from '../metric_collector'
import { Currency, Exchange, ExternalCurrency, megabytesToBytes, requireVariables } from '../utils'

export enum DataType {
  TICKER = 'Ticker',
  TRADE = 'Trade',
}

export type RawPriceData = Ticker | Trade

type PriceMetadata = {
  /** the exchange this price data object came from */
  source: Exchange

  symbol: string
}

export type Ticker = PriceMetadata & {
  /** rate of the current best ask */
  ask: BigNumber
  /**
   * the total volume of the base currency traded in the period considered. This
   * is generally the last 24 hours, but it could vary between exchanges.
   */
  baseVolume: BigNumber
  /** rate of the current best bid */
  bid: BigNumber
  close?: BigNumber
  /**
   * Highest price in the period considered. This is generally the last 24 hours,
   * but it could vary between exchanges
   */
  high?: BigNumber
  /** the price of the last trade */
  lastPrice: BigNumber
  /**
   * Lowest price in the period considered. This is generally the last 24 hours,
   * but it could vary between exchanges
   */
  low?: BigNumber
  open?: BigNumber
  timestamp: number
}

export type Trade = PriceMetadata & {
  amount: BigNumber
  cost: BigNumber
  id: string
  price: BigNumber
  side?: string
  timestamp: number
}

export enum ExchangeDataType {
  ORDERBOOK_STATUS = 'orderbook_status',
  TRADE = 'trade',
  TICKER = 'ticker',
}

export interface ExchangeAdapter {
  exchangeName: Exchange
  fetchTrades: () => Promise<Trade[]>
  fetchTicker: () => Promise<Ticker>
}

export interface ExchangeAdapterConfig {
  apiRequestTimeout?: number
  /** The currency to get the price of */
  baseCurrency: Currency
  /**
   * A base instance of the logger that can be extended for a particular context
   */
  baseLogger: Logger
  /** An optional MetricCollector instance to report metrics */
  metricCollector?: MetricCollector
  /**
   * The currency in which to get the price of the baseCurrency.
   */
  quoteCurrency: Currency
}

export abstract class BaseExchangeAdapter {
  protected readonly config: ExchangeAdapterConfig
  private readonly httpsAgent?: https.Agent

  /**
   * The exchange-specific string that identifies the currency pair for which to query information
   */
  pairSymbol: string

  /**
   * Pair symbol with a standard format used for metric collecting purposes
   */
  standardPairSymbol: string

  abstract baseApiUrl: string

  /**
   * SHA-256 Fingerprint of any certificate in the certificate chain. It will be
   * used to verify the identity of the servers for all API calls to this
   * exchange's API and guards against man in the middle attacks.
   *
   * The more specific a certificate is, the more safety it provides. However,
   * this tends to come with more frequent expirations that will necessitate
   * more frequent updates to the fingerprints.
   * A Root Certificate generally has the longest valid period, but won't help
   * if an intermediate issuer has been compromised.
   */
  abstract readonly _certFingerprint256?: string
  abstract readonly _exchangeName: Exchange

  /**
   * This is the standard mapping of currencies to their symbols on exchanges.
   * Many exchanges use the same symbols, but this is not guaranteed. The purpose
   * of this mapping is to standardize references across exchanges, no matter what
   * differences exist.
   *
   * Each exchange adapter should have its own mapping specific to the exchange
   * API that it is collecting data from. If there are no relevant deviations from
   * this standard mapping, this can be used directly.
   * If there are deviations, this can be used as a base, and the nonstandard
   * symbols can be passed in as overrides.
   *
   * for example, do this inside of an ExchangeAdapter class definition:
   *
   *    private static readonly tokenSymbolMap = new Map<Currency, string>([
   *      ...AdapterName.standardTokenSymbolMap,
   *      [CeloContract.GoldToken, 'differentCeloGoldSymbol']
   *    ])
   *
   */
  protected static readonly standardTokenSymbolMap = new Map<Currency, string>([
    [CeloContract.GoldToken, 'CELO'],
    [CeloContract.StableToken, 'CUSD'],
    [ExternalCurrency.USD, 'USD'],
    [ExternalCurrency.EUR, 'EUR'],
    [ExternalCurrency.BTC, 'BTC'],
  ])

  protected readonly logger: Logger

  /**
   *
   * @param config Configuration for the adapter
   */
  constructor(config: ExchangeAdapterConfig) {
    this.config = config
    this.pairSymbol = this.generatePairSymbol()
    this.standardPairSymbol = this.generateStandardPairSymbol()
    this.logger = this.config.baseLogger.child({
      context: 'exchange_adapter',
      exchange: this.exchangeName,
    })
    this.httpsAgent = this.setupHttpsAgent()
  }

  /**
   * Using the baseCurrency, quoteCurrency, and a mapping of these to the symbols
   * specific to the exchange, generate the symbol to represent the pair.
   */
  protected abstract generatePairSymbol(): string

  protected get metricCollector(): MetricCollector | undefined {
    return this.config.metricCollector
  }

  /**
   *
   */
  abstract isOrderbookLive(): Promise<boolean>

  /**
   * Fetches the latest ticker info from an exchange and normalizes the format.
   * This may involve calls to more than one endpoint to get the needed info.
   */
  abstract fetchTicker(): Promise<Ticker>

  /**
   * Fetches trades from the exchange, normalizes their format, and returns them
   * in chronological order.
   * It's not currently used by any BaseExchangeAdapter client.
   */
  abstract fetchTrades(): Promise<Trade[]>

  /**
   * Fetches from an exchange api endpoint and returns the json-parsed result.
   * Unless this is the fetch to get the orderbook status, it will confirm that
   * the orderbook is live, raising an error if it is not.
   *
   * @param dataType The data type being fetched from the exchange
   * @param path The api endpoint to fetch from. Assumes that this is added onto
   *    the end of the baseUrl
   */
  async fetchFromApi(dataType: ExchangeDataType, path: string): Promise<any> {
    if (dataType === ExchangeDataType.ORDERBOOK_STATUS) {
      return this.fetchFromApiWithoutOrderbookCheck(path)
    } else {
      const [orderbookLive, response] = await Promise.all([
        this.isOrderbookLive(),
        this.fetchFromApiWithoutOrderbookCheck(path),
      ])

      if (!orderbookLive) {
        this.metricCollector?.exchangeApiRequestError(
          this.exchangeName,
          path,
          this.standardPairSymbol,
          ExchangeApiRequestError.ORDERBOOK_STATUS
        )
        return Promise.reject(new Error('Orderbook liveness check failed'))
      }
      return response
    }
  }

  /**
   * Fetches from an exchange api endpoint and returns the json-parsed result
   *
   * @param path The api endpoint to fetch from. Assumes that this is added onto
   *    the end of the baseUrl
   */
  private async fetchFromApiWithoutOrderbookCheck(path: string): Promise<any> {
    this.config.metricCollector?.exchangeApiRequest(
      this.exchangeName,
      path,
      this.standardPairSymbol
    )
    const startTime = Date.now()
    let res: Response
    try {
      res = await fetch(`${this.baseApiUrl}/${path}`, {
        agent: this.httpsAgent,
        follow: 20, // redirect limit
        // max body size in bytes - usually < 10 KB, except for Binance exchangeInfo endpoint which is ~1.4MB
        size: megabytesToBytes(4),
        timeout: this.config.apiRequestTimeout, // resets on redirect
      })
    } catch (err) {
      this.metricCollector?.exchangeApiRequestError(
        this.exchangeName,
        path,
        this.standardPairSymbol,
        ExchangeApiRequestError.FETCH
      )
      return Promise.reject(new Error(`Failure fetching: ${err}`))
    } finally {
      // Log the request latency in the case of a failure or success
      const requestTime = Date.now() - startTime
      this.metricCollector?.exchangeApiRequestDuration(
        this.exchangeName,
        path,
        this.standardPairSymbol,
        requestTime
      )
    }

    if (!res.ok) {
      this.metricCollector?.exchangeApiRequestError(
        this.exchangeName,
        path,
        this.standardPairSymbol,
        res.status
      )
      return Promise.reject(new Error(`Bad fetch status code ${res.status}`))
    }
    let jsonRes: JSON
    try {
      jsonRes = await res.json()
    } catch (err) {
      this.metricCollector?.exchangeApiRequestError(
        this.exchangeName,
        path,
        this.standardPairSymbol,
        ExchangeApiRequestError.JSON_PARSE
      )
      return Promise.reject(new Error(`Failed to parse JSON response: ${err}`))
    }
    return jsonRes
  }

  private generateStandardPairSymbol() {
    return `${BaseExchangeAdapter.standardTokenSymbolMap.get(
      this.config.baseCurrency
    )}/${BaseExchangeAdapter.standardTokenSymbolMap.get(this.config.quoteCurrency)}`
  }

  /**
   * Parsing and Verification
   */

  /**
   * Protect against bad or missing values from the api
   * @param ticker
   */
  protected verifyTicker(ticker: Partial<Ticker>): void {
    const { timestamp, bid, ask, lastPrice, baseVolume } = ticker
    requireVariables({ timestamp, bid, ask, lastPrice, baseVolume })
  }

  /**
   * Protect against bad or missing values from the api
   * @param trade
   */
  protected verifyTrade(trade: Partial<Trade>): void {
    const { id, timestamp, price, amount, cost } = trade
    requireVariables({ id, timestamp, price, amount, cost })
  }

  /**
   * Parses a value as a BigNumber and avoids the NaN or infinite case by
   * returning undefined instead
   * @param value the value to be parsed as a BigNumber
   */
  protected safeBigNumberParse(value: any): BigNumber | undefined {
    const returnVal = new BigNumber(value)
    return returnVal.isFinite() ? returnVal : undefined
  }

  /**
   * Parses a value as a Date. The intended purpose of this function is to translate a
   * string representation of a date into an integer representing milliseconds from
   * the unix epoch.
   * If something goes wrong in the parsing, instead of returning a NaN, which in
   * some cases gets considered a number, be super clear and return undefined.
   * @param value the value to be parsed as a date
   */
  protected safeDateParse(value: any): number | undefined {
    const returnVal = Date.parse(value)
    return isNaN(returnVal) ? undefined : returnVal
  }

  get exchangeName(): Exchange {
    return this._exchangeName
  }

  protected get priceObjectMetadata(): PriceMetadata {
    return {
      source: this.exchangeName,
      symbol: this.standardPairSymbol,
    }
  }

  private setupHttpsAgent(): https.Agent | undefined {
    return new https.Agent({
      rejectUnauthorized: true,
      /**
       * If the session is reused, certificate info may not be available.
       * Don't allow session caching, and don't keep the connection alive
       */
      maxCachedSessions: 0,
      keepAlive: false,
      checkServerIdentity: (host, cert) => {
        const err = tls.checkServerIdentity(host, cert)
        if (err) {
          return err
        }

        let currentCert: tls.PeerCertificate | undefined = cert

        if (this._certFingerprint256) {
          while (currentCert) {
            if (this._certFingerprint256 === currentCert.fingerprint256) {
              // Warn if within a 30 days of expiry (30 * 24 * 60 * 60 + 1000)
              const expirationDate = Date.parse(cert.valid_to)
              if (expirationDate - Date.now() < 2592000000) {
                this.logger.warn(
                  `Certificate with fingerprint ${currentCert.fingerprint256} expires in < 1 month`
                )
              }

              return
            } else {
              // @ts-ignore TS doesn't believe issuerCertificate exists on PeerCertificate
              const issuerCertificate = currentCert.issuerCertificate

              currentCert = issuerCertificate !== currentCert ? issuerCertificate : undefined
            }
          }
          throw new Error('Pinned fingerprint not found in certificate chain')
        }
      },
    })
  }
}
