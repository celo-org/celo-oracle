import BigNumber from 'bignumber.js'

export class CeloTransactionObject {
  constructor() {
    // @ts-ignore
  }
  send = jest.fn(async () => ({
    waitReceipt: jest.fn(async () => ({
      transactionHash: '0x00000000000000000000000000000000000000000000000000000000000000aa',
    })),
  }))
}

const gasPriceMinGetGasPriceFn = jest.fn(async () => {
  return new BigNumber(100)
})

const sortedOraclesReportFn = jest.fn(
  async (_token: CeloToken, _value: BigNumber.Value, _oracleAddress: string) => {
    return new CeloTransactionObject()
  }
)

const sortedOraclesRemoveExpiredReportsFn = jest.fn(
  async (_token: CeloToken, _numReports?: number) => {
    return new CeloTransactionObject()
  }
)

const sortedOraclesIsOldestReportExpiredFn = jest.fn(
  async (_token: CeloToken): Promise<[boolean, string]> => {
    // @ts-ignore - contractkit stopped giving it in array form
    return {
      '0': false,
      '1': '0x0123',
    }
  }
)

const sortedOraclesIsOracleFn = jest.fn(
  async (_token: CeloToken, _oracleAddress: string): Promise<boolean> => {
    return true
  }
)

const sortedOraclesGetOraclesFn = jest.fn(
  async (_token: CeloToken): Promise<string[]> => {
    return ['0x0123']
  }
)

const sortedOraclesReportExpirySecondsFn = jest.fn(
  async (): Promise<BigNumber> => {
    return new BigNumber(5 * 60) // 5 minutes
  }
)

// Any number > 1 to allow expire to process transaction
const sortedOraclesNumRatesFn = jest.fn(
  async (_token: CeloToken): Promise<number> => {
    return 2
  }
)

export const newKit = () => ({
  addAccount: (_: string) => undefined,
  contracts: {
    getSortedOracles: async () => ({
      isOracle: sortedOraclesIsOracleFn,
      isOldestReportExpired: sortedOraclesIsOldestReportExpiredFn,
      getOracles: sortedOraclesGetOraclesFn,
      numRates: sortedOraclesNumRatesFn,
      removeExpiredReports: sortedOraclesRemoveExpiredReportsFn,
      report: sortedOraclesReportFn,
      reportExpirySeconds: sortedOraclesReportExpirySecondsFn,
    }),
    getExchange: async () => ({
      updateFrequency: jest.fn(async () => new BigNumber(5 * 60)),
    }),
    getGasPriceMinimum: async () => ({
      gasPriceMinimum: gasPriceMinGetGasPriceFn,
    }),
  },
  web3: {
    eth: {
      getTransaction: async (_: string) => Promise.resolve(),
      getBalance: async (_: string) => '100',
    },
  },
})

export enum CeloContract {
  Accounts = 'Accounts',
  Attestations = 'Attestations',
  BlockchainParameters = 'BlockchainParameters',
  DoubleSigningSlasher = 'DoubleSigningSlasher',
  DowntimeSlasher = 'DowntimeSlasher',
  Election = 'Election',
  EpochRewards = 'EpochRewards',
  Escrow = 'Escrow',
  Exchange = 'Exchange',
  FeeCurrencyWhitelist = 'FeeCurrencyWhitelist',
  GasPriceMinimum = 'GasPriceMinimum',
  GoldToken = 'GoldToken',
  Governance = 'Governance',
  LockedGold = 'LockedGold',
  Random = 'Random',
  Registry = 'Registry',
  Reserve = 'Reserve',
  SortedOracles = 'SortedOracles',
  StableToken = 'StableToken',
  Validators = 'Validators',
}

export type CeloToken = CeloContract.GoldToken | CeloContract.StableToken
