import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import Logger from 'bunyan'
import {
  BaseReporterConfigSubset,
  BlockBasedReporterConfigSubset,
  DataAggregatorConfigSubset,
  OracleApplicationConfig,
  TimerReporterConfigSubset,
} from './app'
import {
  AggregationMethod,
  Exchange,
  ExternalCurrency,
  minutesToMs,
  ReportStrategy,
  secondsToMs,
  WalletType,
} from './utils'

export const baseLogger = Logger.createLogger({
  name: 'oracle',
  serializers: Logger.stdSerializers,
  level: 'debug',
})

export const defaultDataAggregatorConfig: DataAggregatorConfigSubset = {
  allowNotCGLD: false,
  aggregationMethod: AggregationMethod.MIDPRICES,
  aggregationWindowDuration: minutesToMs(5),
  apiRequestTimeout: secondsToMs(5),
  askMaxPercentageDeviation: new BigNumber(0.2),
  baseCurrency: CeloContract.GoldToken,
  baseLogger,
  bidMaxPercentageDeviation: new BigNumber(0.2),
  exchanges: [Exchange.BITTREX],
  fetchFrequency: secondsToMs(5),
  maxExchangeVolumeShare: new BigNumber(0.99),
  maxPercentageBidAskSpread: new BigNumber(0.1),
  maxNoTradeDuration: secondsToMs(20), // with ETH on Coinbase it's common to see a no trade duration of 10s
  minExchangeCount: 1,
  minTradeCount: 10,
  quoteCurrency: ExternalCurrency.USD,
  scalingRate: new BigNumber(0.01 / 1000),
  minAggregatedVolume: new BigNumber(0),
}

export const defaultBaseReporterConfig: BaseReporterConfigSubset = {
  baseLogger,
  circuitBreakerPriceChangeThresholdMax: new BigNumber(0.25), // 25%
  circuitBreakerPriceChangeThresholdMin: new BigNumber(0.15), // 15%
  circuitBreakerPriceChangeThresholdTimeMultiplier: new BigNumber(0.0075),
  gasPriceMultiplier: new BigNumber(5),
  transactionRetryLimit: 3,
  transactionRetryGasPriceMultiplier: new BigNumber(0.1),
  unusedOracleAddresses: [],
}

export const defaultTimerReporterConfig: TimerReporterConfigSubset = {
  ...defaultBaseReporterConfig,
  removeExpiredFrequency: minutesToMs(1),
}

export const defaultBlockBasedReporterConfig: BlockBasedReporterConfigSubset = {
  ...defaultBaseReporterConfig,
  expectedBlockTimeMs: secondsToMs(5),
  maxBlockTimestampAgeMs: secondsToMs(30),
  minReportPriceChangeThreshold: new BigNumber(0.005), // 0.5%
  targetMaxHeartbeatPeriodMs: minutesToMs(4.5),
}

export const defaultApplicationConfig: OracleApplicationConfig = {
  azureHsmInitMaxRetryBackoffMs: secondsToMs(30),
  azureHsmInitTryCount: 5,
  baseLogger,
  dataAggregatorConfig: defaultDataAggregatorConfig,
  httpRpcProviderUrl: 'http://localhost:8545',
  metrics: true,
  privateKeyPath: '/tmp/defaultPrivateKey',
  prometheusPort: 9090,
  reporterConfig: defaultBlockBasedReporterConfig,
  reportStrategy: ReportStrategy.BLOCK_BASED,
  token: CeloContract.StableToken,
  walletType: WalletType.PRIVATE_KEY,
  wsRpcProviderUrl: 'ws://localhost:8546',
}
