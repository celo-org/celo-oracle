import { ensureLeading0x, isValidAddress } from '@celo/utils/lib/address'
import BigNumber from 'bignumber.js'
import Web3 from 'web3'
import { baseLogger } from './default_config'
import {
  AggregationMethod,
  Exchange,
  OracleCurrencyPair,
  ReportStrategy,
  WalletType,
} from './utils'

export class EnvVarValidationError extends Error {
  constructor(envVar: EnvVar, value: string, message: string) {
    super(`${envVar} value "${value}": ${message}`)
  }
}

export enum EnvVar {
  ADDRESS = 'ADDRESS',
  AGGREGATION_METHOD = 'AGGREGATION_METHOD',
  AGGREGATION_PERIOD = 'AGGREGATION_PERIOD',
  AGGREGATION_SCALING_RATE = 'AGGREGATION_SCALING_RATE',
  API_REQUEST_TIMEOUT = 'API_REQUEST_TIMEOUT',
  AWS_KEY_REGION = 'AWS_KEY_REGION',
  AZURE_HSM_INIT_MAX_RETRY_BACKOFF_MS = 'AZURE_HSM_INIT_MAX_RETRY_BACKOFF_MS',
  AZURE_HSM_INIT_TRY_COUNT = 'AZURE_HSM_INIT_TRY_COUNT',
  AZURE_KEY_VAULT_NAME = 'AZURE_KEY_VAULT_NAME',
  CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_MAX = 'CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_MAX',
  CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_MIN = 'CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_MIN',
  CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_TIME_MULTIPLIER = 'CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_TIME_MULTIPLIER',
  CURRENCY_PAIR = 'CURRENCY_PAIR',
  DATA_FETCH_FREQUENCY = 'DATA_FETCH_FREQUENCY',
  EXCHANGES = 'EXCHANGES',
  GAS_PRICE_MULTIPLIER = 'GAS_PRICE_MULTIPLIER',
  HTTP_RPC_PROVIDER_URL = 'HTTP_RPC_PROVIDER_URL',
  MAX_BLOCK_TIMESTAMP_AGE_MS = 'MAX_BLOCK_TIMESTAMP_AGE_MS',
  METRICS = 'METRICS',
  MID_AGGREGATION_ASK_MAX_PERCENTAGE_DEVIATION = 'MID_AGGREGATION_ASK_MAX_PERCENTAGE_DEVIATION',
  MID_AGGREGATION_BID_MAX_PERCENTAGE_DEVIATION = 'MID_AGGREGATION_BID_MAX_PERCENTAGE_DEVIATION',
  MID_AGGREGATION_MAX_EXCHANGE_VOLUME_SHARE = 'MID_AGGREGATION_MAX_EXCHANGE_VOLUME_SHARE',
  MID_AGGREGATION_MAX_PERCENTAGE_BID_ASK_SPREAD = 'MID_AGGREGATION_MAX_PERCENTAGE_BID_ASK_SPREAD',
  MIN_REPORT_PRICE_CHANGE_THRESHOLD = 'MIN_REPORT_PRICE_CHANGE_THRESHOLD',
  MINIMUM_DATA = 'MINIMUM_DATA',
  MINIMUM_EXCHANGES = 'MINIMUM_EXCHANGES',
  OVERRIDE_INDEX = 'OVERRIDE_INDEX',
  OVERRIDE_ORACLE_COUNT = 'OVERRIDE_ORACLE_COUNT',
  PRIVATE_KEY_PATH = 'PRIVATE_KEY_PATH',
  PROMETHEUS_PORT = 'PROMETHEUS_PORT',
  REMOVE_EXPIRED_FREQUENCY = 'REMOVE_EXPIRED_FREQUENCY',
  REMOVE_EXPIRED_OFFSET_OVERRIDE = 'REMOVE_EXPIRED_OFFSET_OVERRIDE',
  REPORT_FREQUENCY_OVERRIDE = 'REPORT_FREQUENCY_OVERRIDE',
  REPORT_OFFSET_OVERRIDE = 'REPORT_OFFSET_OVERRIDE',
  REPORT_STRATEGY = 'REPORT_STRATEGY',
  REPORT_TARGET_OVERRIDE = 'REPORT_TARGET_OVERRIDE',
  TARGET_MAX_HEARTBEAT_PERIOD_MS = 'TARGET_MAX_HEARTBEAT_PERIOD_MS',
  TRANSACTION_RETRY_GAS_PRICE_MULTIPLIER = 'TRANSACTION_RETRY_GAS_PRICE_MULTIPLIER',
  TRANSACTION_RETRY_LIMIT = 'TRANSACTION_RETRY_LIMIT',
  UNUSED_ORACLE_ADDRESSES = 'UNUSED_ORACLE_ADDRESSES',
  WALLET_TYPE = 'WALLET_TYPE',
  WS_RPC_PROVIDER_URL = 'WS_RPC_PROVIDER_URL',
}

type WebProtocol = 'http' | 'ws'

function fetchEnv(name: string): string | undefined {
  if (process.env[name] === undefined || process.env[name] === '') {
    return undefined
  }
  return process.env[name] as string
}

const envVarValidations = {
  isFinite(value: BigNumber): void {
    if (!value.isFinite()) {
      throw Error('is not a finite numerical value')
    }
  },
  isInteger(value: BigNumber): void {
    if (!value.isInteger()) {
      throw Error('is not an integer')
    }
  },
  isGreaterThan(value: BigNumber, minValue: number, allowEqual: boolean): void {
    if (allowEqual) {
      if (value.isLessThan(minValue)) {
        throw Error(`is less than minimum value: ${minValue}`)
      }
    } else {
      if (!value.isGreaterThan(minValue)) {
        throw Error(`must be greater than ${minValue}`)
      }
    }
  },
  isLessThan(value: BigNumber, maxValue: number, allowEqual: boolean): void {
    if (allowEqual) {
      if (value.isGreaterThan(maxValue)) {
        throw Error(`is greater than maximum value: ${maxValue}`)
      }
    } else {
      if (!value.isLessThan(maxValue)) {
        throw Error(`must be less than ${maxValue}`)
      }
    }
  },
  isGreaterThanZero(value: BigNumber): void {
    envVarValidations.isGreaterThan(value, 0, false)
  },
  isInSet<T>(value: T, validValues: T[]): void {
    if (!validValues.includes(value)) {
      throw Error(`is not included in: "${validValues}"`)
    }
  },
  allAreInSet<T>(values: T[], validValues: T[]): void {
    if (values.find((val) => !validValues.includes(val)) !== undefined) {
      throw Error(`includes values not in set: ${validValues.join(', ')}`)
    }
  },
  isValidUrl(value: string, protocol: WebProtocol): void {
    value = value.toLowerCase()
    if (protocol === 'http' && value.startsWith('http://')) {
      baseLogger.warn(`An HTTP url is detected for RPC. Note that it is recommended to use HTTPS.`)
    } else if (!(value.startsWith(`${protocol}s://`) || value.startsWith(`${protocol}://`))) {
      throw Error(`is not a valid ${protocol} or ${protocol}s url`)
    }
  },
}

interface EnvVarHandling {
  parseFn?: (unparsed: string) => any
  validationFns: ((value: any) => void)[]
  outputFn?: (parsed: any) => any
}

const numberEnvVarHandling: EnvVarHandling = {
  parseFn: (unparsed: string): BigNumber => new BigNumber(unparsed),
  validationFns: [envVarValidations.isFinite],
}

const integerEnvVarHandling: EnvVarHandling = {
  ...numberEnvVarHandling,
  outputFn: (value: BigNumber): number => value.toNumber(),
  validationFns: [envVarValidations.isInteger],
}

const envVarHandlingMap = new Map<EnvVar, EnvVarHandling>([
  [
    EnvVar.ADDRESS,
    {
      validationFns: [
        (value: string): void => {
          if (!isValidAddress(value)) {
            throw Error('must be a valid address')
          }
        },
      ],
    },
  ],
  [
    EnvVar.AGGREGATION_METHOD,
    {
      parseFn: (unparsed: string) => unparsed.toUpperCase() as AggregationMethod,
      validationFns: [
        (value: AggregationMethod) =>
          envVarValidations.isInSet(value, Object.values(AggregationMethod)),
      ],
    },
  ],
  [
    EnvVar.AGGREGATION_PERIOD,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.API_REQUEST_TIMEOUT,
    {
      ...integerEnvVarHandling,
      validationFns: [
        envVarValidations.isInteger,
        (value: BigNumber) => envVarValidations.isGreaterThan(value, 0, true),
      ],
    },
  ],
  [
    EnvVar.AGGREGATION_SCALING_RATE,
    {
      ...numberEnvVarHandling,
      validationFns: [
        envVarValidations.isFinite,
        (value: BigNumber) => envVarValidations.isGreaterThan(value, 0, true),
        (value: BigNumber) => envVarValidations.isLessThan(value, 1, false),
      ],
    },
  ],
  [
    EnvVar.AWS_KEY_REGION,
    {
      validationFns: [
        (value: string) => {
          if (
            !(
              RegExp('^[a-z]+-[a-z]+-[0-9]$').test(value) &&
              value.length >= 3 &&
              value.length <= 24
            )
          ) {
            throw Error('is not a valid AWS region')
          }
        },
      ],
    },
  ],
  [
    EnvVar.AZURE_HSM_INIT_MAX_RETRY_BACKOFF_MS,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.AZURE_HSM_INIT_TRY_COUNT,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.AZURE_KEY_VAULT_NAME,
    {
      validationFns: [
        (value: string) => {
          if (!(RegExp('^[a-zA-Z0-9-]*$').test(value) && value.length >= 3 && value.length <= 24)) {
            throw Error('is not a valid Azure Key Vault name')
          }
        },
      ],
    },
  ],
  [
    EnvVar.CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_MAX,
    {
      ...numberEnvVarHandling,
      validationFns: [envVarValidations.isFinite, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_MIN,
    {
      ...numberEnvVarHandling,
      validationFns: [envVarValidations.isFinite, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.CIRCUIT_BREAKER_PRICE_CHANGE_THRESHOLD_TIME_MULTIPLIER,
    {
      ...numberEnvVarHandling,
      validationFns: [envVarValidations.isFinite, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.CURRENCY_PAIR,
    {
      parseFn: (unparsed: string) => unparsed,
      validationFns: [
        (value: OracleCurrencyPair) => {
          if (!Object.keys(OracleCurrencyPair).includes(value)) {
            throw Error('the currency pair is either invalid or unsupported')
          }
        },
      ],
    },
  ],
  [
    EnvVar.REPORT_TARGET_OVERRIDE,
    {
      parseFn: (unparsed: string) => unparsed,
      validationFns: [
        (value: string | undefined) => {
          if (value !== undefined) {
            if (!Web3.utils.isAddress(value)) {
              throw Error('the report target is not a valid address')
            }
          }
        },
      ],
    },
  ],
  [
    EnvVar.DATA_FETCH_FREQUENCY,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.EXCHANGES,
    {
      parseFn: (unparsed: string): Exchange[] => {
        const exchangeNames = unparsed.split(',').map((e) => e.trim().toUpperCase())
        return exchangeNames.map((e) => Exchange[e as keyof typeof Exchange])
      },
      validationFns: [
        (values: Exchange[]) => envVarValidations.allAreInSet(values, Object.values(Exchange)),
      ],
    },
  ],
  [
    EnvVar.GAS_PRICE_MULTIPLIER,
    {
      ...numberEnvVarHandling,
      validationFns: [
        envVarValidations.isFinite,
        (value: BigNumber) => envVarValidations.isGreaterThan(value, 1, true),
      ],
    },
  ],
  [
    EnvVar.HTTP_RPC_PROVIDER_URL,
    {
      parseFn: (unparsed: string): string => unparsed.toLowerCase(),
      validationFns: [(value: string) => envVarValidations.isValidUrl(value, 'http')],
    },
  ],
  [
    EnvVar.MAX_BLOCK_TIMESTAMP_AGE_MS,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.METRICS,
    {
      parseFn: (unparsed: string): boolean => unparsed.toLowerCase() === 'true',
      validationFns: [],
    },
  ],
  [
    EnvVar.MID_AGGREGATION_ASK_MAX_PERCENTAGE_DEVIATION,
    {
      ...numberEnvVarHandling,
      validationFns: [envVarValidations.isFinite, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.MID_AGGREGATION_BID_MAX_PERCENTAGE_DEVIATION,
    {
      ...numberEnvVarHandling,
      validationFns: [envVarValidations.isFinite, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.MID_AGGREGATION_MAX_EXCHANGE_VOLUME_SHARE,
    {
      ...numberEnvVarHandling,
      validationFns: [
        envVarValidations.isFinite,
        envVarValidations.isGreaterThanZero,
        (value: BigNumber) => envVarValidations.isLessThan(value, 1, true),
      ],
    },
  ],
  [
    EnvVar.MID_AGGREGATION_MAX_PERCENTAGE_BID_ASK_SPREAD,
    {
      ...numberEnvVarHandling,
      validationFns: [envVarValidations.isFinite, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.MIN_REPORT_PRICE_CHANGE_THRESHOLD,
    {
      ...numberEnvVarHandling,
      validationFns: [envVarValidations.isFinite, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.MINIMUM_DATA,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.MINIMUM_EXCHANGES,
    {
      ...integerEnvVarHandling,
      validationFns: [
        envVarValidations.isInteger,
        (value: BigNumber) =>
          envVarValidations.isLessThan(value, Object.keys(Exchange).length, true),
      ],
    },
  ],
  [
    EnvVar.OVERRIDE_INDEX,
    {
      ...integerEnvVarHandling,
      validationFns: [
        envVarValidations.isInteger,
        (value: BigNumber) => envVarValidations.isGreaterThan(value, 0, true),
      ],
    },
  ],
  [
    EnvVar.OVERRIDE_ORACLE_COUNT,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [EnvVar.PRIVATE_KEY_PATH, { validationFns: [] }],
  [
    EnvVar.PROMETHEUS_PORT,
    {
      ...integerEnvVarHandling,
      validationFns: [
        envVarValidations.isInteger,
        envVarValidations.isGreaterThanZero,
        (value: BigNumber) => envVarValidations.isLessThan(value, 65535, true),
      ],
    },
  ],
  [
    EnvVar.REMOVE_EXPIRED_FREQUENCY,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.REMOVE_EXPIRED_OFFSET_OVERRIDE,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.REPORT_FREQUENCY_OVERRIDE,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.REPORT_OFFSET_OVERRIDE,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [
    EnvVar.REPORT_STRATEGY,
    {
      parseFn: (unparsed: string) => unparsed.toUpperCase() as ReportStrategy,
      validationFns: [
        (value: ReportStrategy) => envVarValidations.isInSet(value, Object.values(ReportStrategy)),
      ],
    },
  ],
  [
    EnvVar.TARGET_MAX_HEARTBEAT_PERIOD_MS,
    {
      ...integerEnvVarHandling,
      validationFns: [envVarValidations.isInteger, envVarValidations.isGreaterThanZero],
    },
  ],
  [EnvVar.TRANSACTION_RETRY_GAS_PRICE_MULTIPLIER, numberEnvVarHandling],
  [
    EnvVar.TRANSACTION_RETRY_LIMIT,
    {
      ...integerEnvVarHandling,
      validationFns: [
        envVarValidations.isInteger,
        (value: BigNumber) => envVarValidations.isGreaterThan(value, 0, true),
      ],
    },
  ],
  [
    EnvVar.UNUSED_ORACLE_ADDRESSES,
    {
      parseFn: (unparsed) => unparsed.split(',').map(ensureLeading0x),
      validationFns: [
        (values: string[]) => {
          if (values.find((val: string) => !isValidAddress(val)) !== undefined) {
            throw Error('contains invalid addresses')
          }
        },
      ],
    },
  ],
  [
    EnvVar.WALLET_TYPE,
    {
      parseFn: (unparsed: string) => unparsed.toUpperCase() as WalletType,
      validationFns: [
        (value: WalletType) => envVarValidations.isInSet(value, Object.values(WalletType)),
      ],
    },
  ],
  [
    EnvVar.WS_RPC_PROVIDER_URL,
    {
      parseFn: (unparsed: string) => unparsed.toLowerCase(),
      validationFns: [(value: string) => envVarValidations.isValidUrl(value, 'ws')],
    },
  ],
])

/**
 * Fetches the given EnvVar's value, checks that it's valid, and outputs it in
 * the necessary type
 * @param envVar name of the EnvVar
 */
export function fetchParseValidateEnvVar(envVar: EnvVar): any {
  const unparsed = fetchEnv(envVar)
  if (unparsed === undefined) {
    return undefined
  }

  const handling = envVarHandlingMap.get(envVar)
  const parsed = handling?.parseFn ? handling.parseFn(unparsed) : unparsed

  if (!handling) {
    baseLogger.warn(
      `EnvVar "${envVar}" has no defined parsing or validation. Assuming input is valid`
    )
  } else {
    for (const validationFn of handling.validationFns) {
      try {
        validationFn(parsed)
      } catch (err) {
        throw new EnvVarValidationError(envVar, unparsed, err.message)
      }
    }
  }
  return handling?.outputFn ? handling.outputFn(parsed) : parsed
}
