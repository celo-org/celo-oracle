import {
  BaseReporterConfigSubset,
  BlockBasedReporterConfigSubset,
  DataAggregatorConfigSubset,
  OracleApplication,
  OracleApplicationConfig,
  TimerReporterConfigSubset,
} from './app'
import {
  baseLogger,
  defaultApplicationConfig,
  defaultBlockBasedReporterConfig,
  defaultDataAggregatorConfig,
  defaultTimerReporterConfig,
} from './default_config'
import { EnvVar, fetchParseValidateEnvVar } from './envvar_utils'
import { ReportStrategy } from './utils'

type EnvVarMap<T> = { [key in keyof Partial<T>]: EnvVar }

/**
 * This object keeps track of each value in OracleApplicationConfig that is
 * configurable via env vars.
 */
export const applicationConfigEnvVars: EnvVarMap<OracleApplicationConfig> = {
  address: EnvVar.ADDRESS,
  awsKeyRegion: EnvVar.AWS_KEY_REGION,
  azureHsmInitMaxRetryBackoffMs: EnvVar.AZURE_HSM_INIT_MAX_RETRY_BACKOFF_MS,
  azureHsmInitTryCount: EnvVar.AZURE_HSM_INIT_TRY_COUNT,
  azureKeyVaultName: EnvVar.AZURE_KEY_VAULT_NAME,
  currencyPair: EnvVar.CURRENCY_PAIR,
  httpRpcProviderUrl: EnvVar.HTTP_RPC_PROVIDER_URL,
  metrics: EnvVar.METRICS,
  privateKeyPath: EnvVar.PRIVATE_KEY_PATH,
  prometheusPort: EnvVar.PROMETHEUS_PORT,
  reportStrategy: EnvVar.REPORT_STRATEGY,
  reportTargetOverride: EnvVar.REPORT_TARGET_OVERRIDE,
  walletType: EnvVar.WALLET_TYPE,
  wsRpcProviderUrl: EnvVar.WS_RPC_PROVIDER_URL,
}

export const dataAggregatorConfigEnvVars: EnvVarMap<DataAggregatorConfigSubset> = {
  aggregationMethod: EnvVar.AGGREGATION_METHOD,
  aggregationWindowDuration: EnvVar.AGGREGATION_PERIOD,
  apiRequestTimeout: EnvVar.API_REQUEST_TIMEOUT,
  askMaxPercentageDeviation: EnvVar.MID_AGGREGATION_ASK_MAX_PERCENTAGE_DEVIATION,
  bidMaxPercentageDeviation: EnvVar.MID_AGGREGATION_BID_MAX_PERCENTAGE_DEVIATION,
  exchanges: EnvVar.EXCHANGES,
  fetchFrequency: EnvVar.DATA_FETCH_FREQUENCY,
  maxExchangeVolumeShare: EnvVar.MID_AGGREGATION_MAX_EXCHANGE_VOLUME_SHARE,
  maxPercentageBidAskSpread: EnvVar.MID_AGGREGATION_MAX_PERCENTAGE_BID_ASK_SPREAD,
  minExchangeCount: EnvVar.MINIMUM_EXCHANGES,
}

const baseReporterConfigEnvVars: EnvVarMap<BaseReporterConfigSubset> = {
  circuitBreakerPriceChangeThresholdMin: EnvVar.CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_MIN,
  circuitBreakerPriceChangeThresholdTimeMultiplier:
    EnvVar.CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_TIME_MULTIPLIER,
  circuitBreakerPriceChangeThresholdMax: EnvVar.CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_MAX,
  gasPriceMultiplier: EnvVar.GAS_PRICE_MULTIPLIER,
  transactionRetryGasPriceMultiplier: EnvVar.TRANSACTION_RETRY_GAS_PRICE_MULTIPLIER,
  transactionRetryLimit: EnvVar.TRANSACTION_RETRY_LIMIT,
  overrideIndex: EnvVar.OVERRIDE_INDEX,
  overrideTotalOracleCount: EnvVar.OVERRIDE_ORACLE_COUNT,
  unusedOracleAddresses: EnvVar.UNUSED_ORACLE_ADDRESSES,
}

export const timerReporterConfigEnvVars: EnvVarMap<TimerReporterConfigSubset> = {
  ...baseReporterConfigEnvVars,
  removeExpiredFrequency: EnvVar.REMOVE_EXPIRED_FREQUENCY,
  removeExpiredOffsetOverride: EnvVar.REMOVE_EXPIRED_OFFSET_OVERRIDE,
  reportFrequencyOverride: EnvVar.REPORT_FREQUENCY_OVERRIDE,
  reportOffsetOverride: EnvVar.REPORT_OFFSET_OVERRIDE,
}

export const blockBasedReporterConfigEnvVars: EnvVarMap<BlockBasedReporterConfigSubset> = {
  ...baseReporterConfigEnvVars,
  maxBlockTimestampAgeMs: EnvVar.MAX_BLOCK_TIMESTAMP_AGE_MS,
  minReportPriceChangeThreshold: EnvVar.MIN_REPORT_PRICE_CHANGE_THRESHOLD,
  targetMaxHeartbeatPeriodMs: EnvVar.TARGET_MAX_HEARTBEAT_PERIOD_MS,
}

export function getComponentConfig<T>(defaultConfig: T, envVarMap: EnvVarMap<T>): T {
  const overrides: { [key: string]: any } = {}
  const invalidEnvVars = []
  for (const k of Object.keys(envVarMap)) {
    const key = k as keyof T
    const envVarName = envVarMap[key]
    try {
      const override = fetchParseValidateEnvVar(envVarName!)
      if (override !== undefined) {
        overrides[key as string] = override
      }
    } catch (err) {
      invalidEnvVars.push(err.message)
    }
  }
  if (invalidEnvVars.length) {
    throw Error(`EnvVar invalid input errors:\n${invalidEnvVars.join(', ')}`)
  }
  return {
    ...defaultConfig,
    ...overrides,
  }
}

/**
 * This function returns the OracleApplicationConfig that is defaultApplicationConfig
 * with any overrides from env variables found in applicationConfigEnvVars
 */
export function getApplicationConfig(): OracleApplicationConfig {
  const baseConfig = getComponentConfig(defaultApplicationConfig, applicationConfigEnvVars)
  const dataAggregatorConfig = getComponentConfig(
    defaultDataAggregatorConfig,
    dataAggregatorConfigEnvVars
  )
  let reporterConfig: BlockBasedReporterConfigSubset | TimerReporterConfigSubset
  switch (baseConfig.reportStrategy) {
    case ReportStrategy.BLOCK_BASED:
      reporterConfig = getComponentConfig(
        defaultBlockBasedReporterConfig,
        blockBasedReporterConfigEnvVars
      )
      break
    case ReportStrategy.TIMER_BASED:
      reporterConfig = getComponentConfig(
        defaultTimerReporterConfig,
        blockBasedReporterConfigEnvVars
      )
      break
    default:
      throw Error(`Invalid report strategy: ${baseConfig.reportStrategy}`)
  }
  return {
    ...baseConfig,
    dataAggregatorConfig,
    reporterConfig,
  }
}

async function startApp() {
  const appConfig = getApplicationConfig()
  const oracleApp = new OracleApplication(appConfig)
  await oracleApp.init()
  oracleApp.start()
}

export async function start() {
  try {
    await startApp()
  } catch (e) {
    baseLogger.error(e, 'Error starting up')
    // stop the process
    process.exit(1)
  }
}
