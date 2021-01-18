import { CeloContract } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import { EnvVar, fetchParseValidateEnvVar } from '../src/envvar_utils'
import { AggregationMethod, Exchange, ExternalCurrency } from '../src/utils'

describe('fetchParseValidateEnvVar()', () => {
  const env = { ...process.env }

  beforeEach(() => {
    // Ensure no envvars are set
    for (const k of Object.keys(EnvVar)) {
      delete process.env[EnvVar[k as EnvVar]]
    }
  })

  afterEach(() => (process.env = env))

  it('returns undefined when the given envvar has not been set', () => {
    expect(fetchParseValidateEnvVar(EnvVar.ADDRESS)).toBeUndefined()
  })
  it('returns undefined with the value is a blank string', () => {
    process.env[EnvVar.AZURE_KEY_VAULT_NAME] = ''
    expect(fetchParseValidateEnvVar(EnvVar.AZURE_KEY_VAULT_NAME)).toBeUndefined()
  })
  it('correctly handles a defined number-type envvar', () => {
    process.env[EnvVar.MINIMUM_EXCHANGES] = '2'
    expect(fetchParseValidateEnvVar(EnvVar.MINIMUM_EXCHANGES)).toEqual(2)
  })
  it('correctly handles a non-integer number type envvar', () => {
    process.env[EnvVar.AGGREGATION_SCALING_RATE] = '0.0123'
    expect(fetchParseValidateEnvVar(EnvVar.AGGREGATION_SCALING_RATE)).toEqual(new BigNumber(0.0123))
  })
  it('handles transformation of exchange strings to values in exchange enum', () => {
    process.env[EnvVar.EXCHANGES] = 'COINBASE,BITTREX'
    expect(fetchParseValidateEnvVar(EnvVar.EXCHANGES)).toEqual([
      Exchange.COINBASE,
      Exchange.BITTREX,
    ])
  })
  it('correctly handles a boolean', () => {
    process.env[EnvVar.METRICS] = 'true'
    expect(fetchParseValidateEnvVar(EnvVar.METRICS)).toEqual(true)
    process.env[EnvVar.METRICS] = 'false'
    expect(fetchParseValidateEnvVar(EnvVar.METRICS)).toEqual(false)
  })
  it('parses a token correctly', () => {
    process.env[EnvVar.TOKEN] = 'StableToken'
    expect(fetchParseValidateEnvVar(EnvVar.TOKEN)).toEqual(CeloContract.StableToken)
  })
  it("parses a currency correctly when it's a CeloToken", () => {
    process.env[EnvVar.BASE_CURRENCY] = 'GoldToken'
    expect(fetchParseValidateEnvVar(EnvVar.BASE_CURRENCY)).toEqual(CeloContract.GoldToken)
  })
  it("parses a currency correctly when it's not a CeloToken", () => {
    process.env[EnvVar.QUOTE_CURRENCY] = 'USD'
    expect(fetchParseValidateEnvVar(EnvVar.QUOTE_CURRENCY)).toEqual(ExternalCurrency.USD)
  })
  it('parses aggregation method correctly', () => {
    process.env[EnvVar.AGGREGATION_METHOD] = 'trades'
    expect(fetchParseValidateEnvVar(EnvVar.AGGREGATION_METHOD)).toEqual(AggregationMethod.TRADES)
    process.env[EnvVar.AGGREGATION_METHOD] = 'Midprices'
    expect(fetchParseValidateEnvVar(EnvVar.AGGREGATION_METHOD)).toEqual(AggregationMethod.MIDPRICES)
  })
})
