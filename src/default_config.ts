import {
  AggregationMethod,
  OracleCurrencyPair,
  ReportStrategy,
  WalletType,
  minutesToMs,
  secondsToMs,
} from './utils'
import {
  BaseReporterConfigSubset,
  BlockBasedReporterConfigSubset,
  DataAggregatorConfigSubset,
  OracleApplicationConfig,
} from './app'

import BigNumber from 'bignumber.js'
import Logger from 'bunyan'

export const baseLogger = Logger.createLogger({
  name: 'oracle',
  serializers: Logger.stdSerializers,
  level: 'debug',
  src: true,
})

export const defaultDataAggregatorConfig: DataAggregatorConfigSubset = {
  aggregationMethod: AggregationMethod.MIDPRICES,
  aggregationWindowDuration: minutesToMs(5),
  apiRequestTimeout: secondsToMs(5),
  baseLogger,
  maxSourceWeightShare: new BigNumber(0.99),
  maxPercentageBidAskSpread: new BigNumber(0.1),
  maxPercentageDeviation: new BigNumber(0.2),
  minPriceSourceCount: 1,
  minAggregatedVolume: new BigNumber(0),
  devMode: false,
}

export const defaultBaseReporterConfig: BaseReporterConfigSubset = {
  baseLogger,
  circuitBreakerPriceChangeThresholdMax: new BigNumber(0.25), // 25%
  circuitBreakerPriceChangeThresholdMin: new BigNumber(0.15), // 15%
  circuitBreakerPriceChangeThresholdTimeMultiplier: new BigNumber(0.0075),
  circuitBreakerDurationTimeMs: 20 * 60 * 1000, // 20 minutes.
  gasPriceMultiplier: new BigNumber(1.5),
  transactionRetryLimit: 3,
  transactionRetryGasPriceMultiplier: new BigNumber(0.1),
  unusedOracleAddresses: [],
  devMode: false,
}

export const defaultBlockBasedReporterConfig: BlockBasedReporterConfigSubset = {
  ...defaultBaseReporterConfig,
  expectedBlockTimeMs: secondsToMs(5),
  maxBlockTimestampAgeMs: secondsToMs(30),
  minReportPriceChangeThreshold: new BigNumber(0.005), // 0.5%
  targetMaxHeartbeatPeriodMs: minutesToMs(4.5),
}

export const defaultApplicationConfig: OracleApplicationConfig = {
  apiKeys: {},
  awsKeyRegion: 'eu-central-1',
  azureHsmInitMaxRetryBackoffMs: secondsToMs(30),
  azureHsmInitTryCount: 5,
  baseLogger,
  currencyPair: OracleCurrencyPair.CELOUSD,
  dataAggregatorConfig: defaultDataAggregatorConfig,
  httpRpcProviderUrl: 'http://localhost:8545',
  metrics: true,
  privateKeyPath: '/tmp/defaultPrivateKey',
  prometheusPort: 9090,
  reporterConfig: defaultBlockBasedReporterConfig,
  reportStrategy: ReportStrategy.BLOCK_BASED,
  reportTargetOverride: undefined,
  walletType: WalletType.PRIVATE_KEY,
  wsRpcProviderUrl: 'ws://localhost:8546',
  devMode: false,
  mockAccount: '0x243860e8216B4F6eC2478Ebd613F6F4bDE0704DE', // Just a valid address used for testing
}
