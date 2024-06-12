import {
  AggregationMethod,
  Exchange,
  OracleCurrencyPair,
  ReportStrategy,
  WalletType,
  minutesToMs,
  secondsToMs,
} from '../src/utils'
import {
  BaseReporterConfigSubset,
  BlockBasedReporterConfigSubset,
  DataAggregatorConfigSubset,
  OracleApplication,
  OracleApplicationConfig,
} from '../src/app'

import BigNumber from 'bignumber.js'
import { BlockBasedReporter } from '../src/reporters/block_based_reporter'
import { CeloContract } from '@celo/contractkit'
import { DataAggregator } from '../src/data_aggregator'
import { MetricCollector } from '../src/metric_collector'
import { baseLogger } from '../src/default_config'

jest.mock('@celo/contractkit')
jest.mock('@celo/wallet-hsm-azure')
jest.mock('../src/metric_collector')

const mockPrivateKeyPath = '/foo/bar/barfoo'
// Randomly generated private key and addresss
// const mockPrivateKey = '7482878ff61eee0d53caad3246eabe69cb2a17204df0276986bfc77b1b32acad'
const mockOracleAccount = '0x086bb25bFCD323f82a7d1c95E4Cf3807B8831270'

const mockAzureKeyVaultName = 'mockAzureKeyVault'

jest.mock('../src/data_aggregator')
jest.mock('../src/reporters/base')
jest.mock('../src/reporters/block_based_reporter')

describe('OracleApplication', () => {
  const address = mockOracleAccount
  const aggregationMethod = AggregationMethod.MIDPRICES
  const aggregationWindowDuration = minutesToMs(6)
  const apiKeys: Partial<Record<Exchange, string>> = {
    BINANCE: 'mockBinanceApiKey',
    COINBASE: 'mockCoinbaseApiKey',
  }
  const awsKeyRegion = 'eu-central-1'
  const azureKeyVaultName = mockAzureKeyVaultName
  const azureHsmInitMaxRetryBackoffMs = secondsToMs(30)
  const azureHsmInitTryCount = 5
  const circuitBreakerPriceChangeThresholdMax = new BigNumber(0.1)
  const circuitBreakerPriceChangeThresholdMin = new BigNumber(0.1)
  const circuitBreakerPriceChangeThresholdTimeMultiplier = new BigNumber(0.0075)
  const circuitBreakerDurationTimeMs = 20 * 60 * 1000 // 20 minutes.
  const currencyPair = OracleCurrencyPair.CELOUSD
  const expectedBlockTimeMs = secondsToMs(5)
  const httpRpcProviderUrl = 'http://test.foo'
  const metrics = true
  const maxBlockTimestampAgeMs = secondsToMs(30)
  const maxSourceWeightShare = new BigNumber(0.99)
  const maxPercentageBidAskSpread = new BigNumber(0.1)
  const maxPercentageDeviation = new BigNumber(0.2)
  const minPriceSourceCount = 1
  const minReportPriceChangeThreshold = new BigNumber(0.05)
  const privateKeyPath = mockPrivateKeyPath
  const prometheusPort = 9090
  const reportStrategy = ReportStrategy.BLOCK_BASED
  const minAggregatedVolume = new BigNumber(1000)
  const walletType = WalletType.AZURE_HSM
  const wsRpcProviderUrl = 'ws://test.foo'

  const defaultBaseReporterConfig: BaseReporterConfigSubset = {
    baseLogger,
    circuitBreakerPriceChangeThresholdMax,
    circuitBreakerPriceChangeThresholdMin,
    circuitBreakerPriceChangeThresholdTimeMultiplier,
    circuitBreakerDurationTimeMs,
    devMode: false,
    gasPriceMultiplier: new BigNumber(5.0),
    transactionRetryLimit: 0,
    transactionRetryGasPriceMultiplier: new BigNumber(0),
    unusedOracleAddresses: [],
  }

  const blockBasedReporterConfig: BlockBasedReporterConfigSubset = {
    ...defaultBaseReporterConfig,
    expectedBlockTimeMs,
    maxBlockTimestampAgeMs,
    minReportPriceChangeThreshold,
    unusedOracleAddresses: [],
  }

  const dataAggregatorConfig: DataAggregatorConfigSubset = {
    aggregationMethod,
    aggregationWindowDuration,
    baseLogger,
    certificateManagerJsonUrl: '',
    certificateManagerRefreshIntervalMs: 1000,
    devMode: false,
    minPriceSourceCount,
    maxSourceWeightShare,
    maxPercentageBidAskSpread,
    maxPercentageDeviation,
    minAggregatedVolume,
  }

  const appConfig: OracleApplicationConfig = {
    address,
    apiKeys,
    awsKeyRegion,
    azureKeyVaultName,
    azureHsmInitMaxRetryBackoffMs,
    azureHsmInitTryCount,
    baseLogger,
    currencyPair,
    dataAggregatorConfig,
    devMode: false,
    httpRpcProviderUrl,
    metrics,
    mockAccount: '', // It is not relevant as devMode is disabled
    privateKeyPath,
    prometheusPort,
    reporterConfig: blockBasedReporterConfig,
    reportStrategy,
    walletType,
    wsRpcProviderUrl,
    reportTargetOverride: undefined,
  }

  let oracleApplication: OracleApplication

  beforeEach(() => {
    oracleApplication = new OracleApplication(appConfig)
  })

  it('set up a data aggregator with the appropriate, passed-through config', () => {
    expect(DataAggregator).toHaveBeenCalledWith({
      ...dataAggregatorConfig,
      apiKeys,
      currencyPair: 'CELOUSD',
      metricCollector: oracleApplication.metricCollector,
    })
  })

  describe('init()', () => {
    it('throws an error if it is already initialized', async () => {
      Object.defineProperty(oracleApplication, 'initialized', { value: true })
      await expect(async () => oracleApplication.init()).rejects.toThrow('App is initialized')
    })

    it('sets up a BlockBasedReporter instance with appropriate params if specified', async () => {
      oracleApplication = new OracleApplication({
        ...appConfig,
        reportStrategy: ReportStrategy.BLOCK_BASED,
        reporterConfig: blockBasedReporterConfig,
      })
      await oracleApplication.init()
      expect(BlockBasedReporter).toHaveBeenCalledWith({
        baseLogger: expect.anything(),
        currencyPair,
        dataAggregator: expect.any(DataAggregator),
        devMode: false,
        expectedBlockTimeMs,
        gasPriceMultiplier: new BigNumber(5),
        transactionRetryLimit: 0,
        transactionRetryGasPriceMultiplier: new BigNumber(0),
        kit: expect.anything(),
        circuitBreakerPriceChangeThresholdMax,
        circuitBreakerPriceChangeThresholdMin,
        circuitBreakerPriceChangeThresholdTimeMultiplier,
        circuitBreakerDurationTimeMs,
        maxBlockTimestampAgeMs,
        minReportPriceChangeThreshold,
        metricCollector: expect.any(MetricCollector),
        oracleAccount: mockOracleAccount,
        reportTarget: CeloContract.StableToken,
        unusedOracleAddresses: blockBasedReporterConfig.unusedOracleAddresses,
        wsRpcProviderUrl,
      })
    })

    it('validates private key correctly', () => {
      // key is too short to be a valid private key
      let key = '7482878ff61eee0d53caad3246eabe69cb2a17204df0276986b'
      expect(oracleApplication.validPrivateKey(key)).toBe(false)
      // key has non hex characters at the end
      key = '7482878ff61eee0d53caad3246eabe69cb2a17204df0276986bfc77b1b32axxx'
      expect(oracleApplication.validPrivateKey(key)).toBe(false)
      // valid key
      key = '7482878ff61eee0d53caad3246eabe69cb2a17204df0276986bfc77b1b32acad'
      expect(oracleApplication.validPrivateKey(key)).toBe(true)
      // leading 0x
      key = '0x7482878ff61eee0d53caad3246eabe69cb2a17204df0276986bfc77b1b32acad'
      expect(oracleApplication.validPrivateKey(key)).toBe(true)
    })
  })

  describe('start()', () => {
    describe('when the app is not initialized', () => {
      it('throws an error', () => {
        expect(() => {
          oracleApplication.start()
        }).toThrowError('App is not initialized')
      })
    })
    describe('when the app is initialized', () => {
      beforeEach(async () => {
        await oracleApplication.init()
      })
      it('starts the reporter', () => {
        oracleApplication.start()
        expect(oracleApplication.reporter.start).toHaveBeenCalledTimes(1)
      })
    })
  })
})
