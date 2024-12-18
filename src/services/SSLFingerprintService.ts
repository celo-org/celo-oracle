import Logger from 'bunyan'
import { MetricCollector } from '../metric_collector'
import { Exchange } from '../utils'
import { AbiItem, Contract } from '@celo/connect'
import Web3 from 'web3'
import { WebsocketProvider } from 'web3-core'
import { Subscription } from 'web3-core-subscriptions'

export interface ISSLFingerprintService {
  getFingerprint(identifier: string): string | undefined
}

const ALL_EXCHANGE_IDENTIFIERS = Object.values(Exchange)
const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getFingerprints',
    inputs: [
      {
        name: 'identifiers',
        type: 'string[]',
        internalType: 'string[]',
      },
    ],
    outputs: [
      {
        name: 'fingerprints',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'FingerprintUpdated',
    inputs: [
      {
        name: 'hashedIdentifier',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'fingerprint',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'identifier',
        type: 'string',
        indexed: false,
        internalType: 'string',
      },
    ],
    anonymous: false,
  },
] as AbiItem[]

export interface SSLFingerprintServiceConfig {
  /**
   * The registry contract address
   * See: https://github.com/mento-protocol/oracle-ssl-registry
   */
  sslRegistryAddress: string
  /**
   * Used to create a web3 instance that can subscribe to chain events.
   */
  wsRpcProviderUrl: string
  /**
   * A base instance of the logger that can be extended for a particular context
   */
  baseLogger: Logger
  /** An optional MetricCollector instance to report metrics */
  metricCollector?: MetricCollector
  /**
   * The currency in which to get the price of the baseCurrency.
   */
}

export const formatFingerprint = (hexString: string) => {
  // Remove the leading '0x' if present
  if (hexString.startsWith('0x')) {
    hexString = hexString.slice(2)
  }

  // Convert to uppercase
  hexString = hexString.toUpperCase()

  // Add colons every 2 characters
  return hexString.match(/.{1,2}/g)!.join(':')
}

export class SSLFingerprintService implements ISSLFingerprintService {
  private readonly logger: Logger
  private readonly sslRegistryAddress: string
  private readonly fingerprintMapping: Map<string, string>
  private readonly registry: Contract
  private readonly web3: Web3
  private readonly provider: WebsocketProvider
  private eventSubscription: Subscription<any> | undefined

  private readonly wsConnectionOptions = {
    // to enable auto reconnection
    reconnect: {
      auto: true,
      delay: 5000, // ms, roughly a block
    },
  }

  constructor(config: SSLFingerprintServiceConfig) {
    this.sslRegistryAddress = config.sslRegistryAddress
    this.logger = config.baseLogger.child({
      context: 'ssl_fingerprint_service',
    })
    this.fingerprintMapping = new Map<string, string>()
    this.provider = new Web3.providers.WebsocketProvider(
      config.wsRpcProviderUrl,
      this.wsConnectionOptions
    )
    this.web3 = new Web3(this.provider)
    this.registry = new this.web3.eth.Contract(REGISTRY_ABI, this.sslRegistryAddress)
  }

  async init() {
    const fingerprints = await this.registry.methods
      .getFingerprints(ALL_EXCHANGE_IDENTIFIERS)
      .call()
    for (let i = 0; i < ALL_EXCHANGE_IDENTIFIERS.length; i++) {
      this.fingerprintMapping.set(ALL_EXCHANGE_IDENTIFIERS[i], formatFingerprint(fingerprints[i]))
    }
    this.eventSubscription = this.registry.events.FingerprintUpdated(
      {
        fromBlock: 'latest',
      },
      this.updateFingerprint
    )
    this.logger.info('Pulled SSL Certificates from registry')
  }

  stop() {
    this.eventSubscription?.unsubscribe()
    this.provider.disconnect()
  }

  updateFingerprint = (error: any, event: any) => {
    if (error) {
      this.logger.error(error)
      return
    }
    this.logger.info('Fingerprint update detected')
    try {
      if (
        !event.returnValues ||
        !event.returnValues.fingerprint ||
        !event.returnValues.identifier
      ) {
        throw new Error(`FingerprintUpdated event is invalid or missing returnValues`)
      }
      const { fingerprint, identifier } = event.returnValues
      if (!(identifier in Exchange)) {
        throw new Error(`Unexpected identifier: ${identifier}`)
      }
      if (!/0x[a-zA-Z0-9]{32}/.exec(fingerprint)) {
        throw new Error(`Invalid fingerprint: ${fingerprint}`)
      }
      if (/0x0{32}/.exec(fingerprint)) {
        throw new Error(`Fingerprint is empty`)
      }
      const formattedFingerprint = formatFingerprint(fingerprint)
      this.logger.info(`Updating ${identifier} fingerprint to ${formattedFingerprint}`)
      this.fingerprintMapping.set(identifier, formattedFingerprint)
    } catch (e) {
      this.logger.error('Failed to process FingerprintUpdated event')
      this.logger.error(e)
    }
  }

  getFingerprint(identifier: string): string {
    const fingerprint = this.fingerprintMapping.get(identifier)
    if (!!fingerprint) return fingerprint
    throw new Error(`${identifier} not found in fingerprint mapping. 
Either the service is not initialized or the you've added a new exchange type that wasn't updated in the SSL Registry.
See: https://github.com/mento-protocol/oracle-ssl-registry`)
  }
}
