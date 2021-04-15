import { ContractKit, newKit } from '@celo/contractkit'
import { ReportTarget } from '@celo/contractkit/lib/wrappers/SortedOracles'
import { ensureLeading0x, isValidPrivateKey, privateKeyToAddress } from '@celo/utils/lib/address'
import { AwsHsmWallet } from '@celo/wallet-hsm-aws'
import { AzureHSMWallet } from '@celo/wallet-hsm-azure'
import Logger from 'bunyan'
import fs from 'fs'
import { DataAggregator, DataAggregatorConfig } from './data_aggregator'
import { Context, MetricCollector } from './metric_collector'
import { BaseReporter, BaseReporterConfig } from './reporters/base'
import { BlockBasedReporter, BlockBasedReporterConfig } from './reporters/block_based_reporter'
import {
  OracleCurrencyPair,
  ReportStrategy,
  reportTargetForCurrencyPair,
  requireVariables,
  secondsToMs,
  tryExponentialBackoff,
  WalletType,
} from './utils'

/**
 * Omit the fields that are passed in by the Application
 */
type DataAggregatorConfigToOmit = 'metricCollector' | 'currencyPair'
export type DataAggregatorConfigSubset = Omit<DataAggregatorConfig, DataAggregatorConfigToOmit>
type ReporterConfigToOmit =
  | 'dataAggregator'
  | 'kit'
  | 'metricCollector'
  | 'oracleAccount'
  | 'currencyPair'
  | 'reportTarget'
export type BaseReporterConfigSubset = Omit<BaseReporterConfig, ReporterConfigToOmit>
export type BlockBasedReporterConfigSubset = Omit<
  BlockBasedReporterConfig,
  ReporterConfigToOmit | 'wsRpcProviderUrl'
>
export type TransactionManagerConfig = Pick<
  BaseReporterConfig,
  | 'gasPriceMultiplier'
  | 'oracleAccount'
  | 'transactionRetryGasPriceMultiplier'
  | 'transactionRetryLimit'
  | 'metricCollector'
> & {
  logger?: Logger
}

/**
 * This specifies configurations to the OracleApplication
 */
export interface OracleApplicationConfig {
  /**
   * The address this oracle will send transactions from.
   * Only needed when using HSM signing in Azure. If using `privateKeyPath`,
   * this is ignored and the address is derived from the private key
   */
  address?: string
  /**
   * The name in code form of the AWS region the key is located in.
   * Only used if walletType is AWS_HSM.
   * eg: eu-central-1
   */
  awsKeyRegion: string
  /**
   * The name of an Azure Key Vault where an HSM with the address `address` exists.
   * Has higher precedence over `privateKeyPath`.
   */
  azureKeyVaultName?: string
  /**
   * The number of times to try initializing the AzureHSMWallet if the previous
   * init was unsuccessful.
   */
  azureHsmInitTryCount?: number
  /**
   * The max backoff in ms between AzureHSMWallet init retries.
   */
  azureHsmInitMaxRetryBackoffMs?: number
  /**
   * A base instance of the logger that can be extended for a particular context
   */
  baseLogger: Logger
  /** The currency pair that this oracle is reporting upon */
  currencyPair: OracleCurrencyPair
  /** Configuration for the Data Aggregator */
  dataAggregatorConfig: DataAggregatorConfigSubset
  /** The http URL of a web3 provider to send RPCs to */
  httpRpcProviderUrl: string
  /**
   * Controls whether to report metrics for this app instance
   */
  metrics: boolean
  /**
   * The path to a file where the private key for tx signing is stored.
   * The account address is derived from this private key.
   * If `azureKeyVaultName` is specified, this is ignored.
   */
  privateKeyPath?: string
  /**
   * If collecting metrics, specify the port for Prometheus
   */
  prometheusPort?: number
  /**
   * Configuration specific to the Reporter. Includes things like overrides to
   * the default reporting schedule,
   */
  reporterConfig: BlockBasedReporterConfigSubset
  /**
   * The report strategy
   */
  reportStrategy: ReportStrategy
  /* To override the default identifier when reporting to chain */
  reportTargetOverride: ReportTarget | undefined
  /** The type of wallet to use for signing transaction */
  walletType: WalletType
  /** The websocket URL of a web3 provider to listen to events through with block-based reporting */
  wsRpcProviderUrl: string
}

export class OracleApplication {
  private initialized: boolean
  private readonly config: OracleApplicationConfig

  private _dataAggregator: DataAggregator
  private _reporter: BaseReporter | undefined

  private readonly logger: Logger
  readonly metricCollector: MetricCollector | undefined

  /**
   * @param config configuration values for the oracle application
   */
  constructor(config: OracleApplicationConfig) {
    this.config = config

    if (this.config.metrics) {
      const { prometheusPort } = this.config
      requireVariables({ prometheusPort })
      this.metricCollector = new MetricCollector(this.config.baseLogger)
      this.metricCollector.startServer(prometheusPort!)
    }
    this._dataAggregator = new DataAggregator({
      ...config.dataAggregatorConfig,
      currencyPair: this.config.currencyPair,
      metricCollector: this.metricCollector,
    })
    this.logger = this.config.baseLogger.child({ context: 'app' })
    this.logger.info(
      {
        config: this.prettyConfig(),
      },
      'Created app'
    )
    this.initialized = false
  }

  async init() {
    this.requireUninitialized()

    const {
      address,
      awsKeyRegion,
      azureKeyVaultName,
      azureHsmInitTryCount,
      azureHsmInitMaxRetryBackoffMs,
      httpRpcProviderUrl,
      privateKeyPath,
      currencyPair,
      walletType,
      wsRpcProviderUrl,
    } = this.config
    let kit: ContractKit

    this.logger.info(
      {
        address: this.config.address,
        azureKeyVaultName,
        privateKeyPath,
      },
      'Initializing app'
    )

    switch (this.config.walletType) {
      case WalletType.AWS_HSM:
        requireVariables({
          address,
          awsKeyRegion,
        })
        const awsHsmWallet = new AwsHsmWallet({
          region: awsKeyRegion,
          apiVersion: '2014-11-01',
        })
        await awsHsmWallet.init()
        kit = newKit(httpRpcProviderUrl, awsHsmWallet)
        break
      case WalletType.AZURE_HSM:
        requireVariables({
          address,
          azureHsmInitTryCount,
          azureHsmInitMaxRetryBackoffMs,
        })
        // It can take time (up to ~1-2 minutes) for the pod to be given its appropriate
        // AAD identity for it to access Azure Key Vault. To prevent the client from
        // crashing and possibly sending the pod into a CrashLoopBackoff, we
        // try to authenticate and exponentially backoff between retries.
        let azureHsmWallet: AzureHSMWallet
        await tryExponentialBackoff(
          async () => {
            // Credentials are set in the constructor, so we must create a fresh
            // wallet for each try
            azureHsmWallet = new AzureHSMWallet(azureKeyVaultName!)
            await azureHsmWallet.init()
          },
          azureHsmInitTryCount!,
          secondsToMs(5),
          azureHsmInitMaxRetryBackoffMs!,
          (e: Error, backoffMs: number) => {
            this.logger.info(e, `Failed to init wallet, backing off ${backoffMs} ms`)
            this.metricCollector?.error(Context.WALLET_INIT)
          }
        )
        // wallet will be defined if we are here
        kit = newKit(httpRpcProviderUrl, azureHsmWallet!)
        break
      case WalletType.PRIVATE_KEY:
        kit = newKit(httpRpcProviderUrl)
        const privateKey = this.getPrivateKeyFromPath(privateKeyPath!)
        kit.addAccount(privateKey)
        this.config.address = privateKeyToAddress(privateKey)
        break
      default:
        throw Error(`Invalid wallet type: ${walletType}`)
    }

    const commonReporterConfig = {
      baseLogger: this.config.baseLogger,
      dataAggregator: this.dataAggregator,
      kit,
      metricCollector: this.metricCollector,
      oracleAccount: this.config.address!,
      reportTarget: this.config.reportTargetOverride
        ? this.config.reportTargetOverride
        : await reportTargetForCurrencyPair(this.config.currencyPair, kit),
      currencyPair,
    }

    switch (this.config.reportStrategy) {
      case ReportStrategy.BLOCK_BASED:
        this._reporter = new BlockBasedReporter({
          ...(this.config.reporterConfig as BlockBasedReporterConfigSubset),
          ...commonReporterConfig,
          wsRpcProviderUrl,
        })
        break
      default:
        throw Error(`Invalid report strategy: ${this.config.reportStrategy}`)
    }

    await this._reporter.init()

    this.initialized = true
  }

  start(): void {
    this.requireInitialized()
    this.reporter.start()
  }

  stop(): void {
    this.reporter.stop()
  }

  get reporter(): BaseReporter {
    this.requireInitialized()

    return this._reporter!
  }

  get dataAggregator(): DataAggregator {
    return this._dataAggregator
  }

  getPrivateKeyFromPath(privateKeyPath: string): string {
    if (fs.existsSync(privateKeyPath)) {
      const privateKey = fs.readFileSync(privateKeyPath).toString()
      if (!this.validPrivateKey(privateKey)) {
        throw Error(`Invalid private key: ${privateKey}.`)
      }
      return privateKey
    }
    throw Error(`no file found at privateKeyPath: ${this.config.privateKeyPath}`)
  }

  validPrivateKey(privateKey: string): boolean {
    return isValidPrivateKey(ensureLeading0x(privateKey))
  }

  private requireInitialized() {
    if (!this.initialized) {
      throw Error(`App is not initialized`)
    }
  }

  private requireUninitialized() {
    if (this.initialized) {
      throw Error(`App is initialized`)
    }
  }

  /**
   * prettyConfig gives the config that is fit for logging to prevent unnecessarily
   * logging the `baseLogger` instances in the OracleApplicationConfig, DataAggregatorConfig,
   * and BaseReporterConfig
   */
  private prettyConfig(): OracleApplicationConfig {
    const removeBaseLogger = (config: any) => ({
      ...config,
      baseLogger: undefined,
    })
    return removeBaseLogger({
      ...this.config,
      dataAggregatorConfig: removeBaseLogger(this.config.dataAggregatorConfig),
      reporterConfig: removeBaseLogger(this.config.reporterConfig),
    })
  }
}
