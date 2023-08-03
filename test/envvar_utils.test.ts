import { EnvVar, fetchParseValidateEnvVar } from '../src/envvar_utils'

import { AggregationMethod } from '../src/utils'
import BigNumber from 'bignumber.js'

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
    process.env[EnvVar.MINIMUM_PRICE_SOURCES] = '2'
    expect(fetchParseValidateEnvVar(EnvVar.MINIMUM_PRICE_SOURCES)).toEqual(2)
  })
  it('correctly handles a non-integer number type envvar', () => {
    process.env[EnvVar.MIN_REPORT_PRICE_CHANGE_THRESHOLD] = '0.0123'
    expect(fetchParseValidateEnvVar(EnvVar.MIN_REPORT_PRICE_CHANGE_THRESHOLD)).toEqual(
      new BigNumber(0.0123)
    )
  })
  it('correctly handles a boolean', () => {
    process.env[EnvVar.METRICS] = 'true'
    expect(fetchParseValidateEnvVar(EnvVar.METRICS)).toEqual(true)
    process.env[EnvVar.METRICS] = 'false'
    expect(fetchParseValidateEnvVar(EnvVar.METRICS)).toEqual(false)
  })
  it('correctly handles currency pairs', () => {
    process.env[EnvVar.CURRENCY_PAIR] = 'CELOUSD'
    expect(fetchParseValidateEnvVar(EnvVar.CURRENCY_PAIR)).toEqual('CELOUSD')
    process.env[EnvVar.CURRENCY_PAIR] = 'CELOBTC'
    expect(fetchParseValidateEnvVar(EnvVar.CURRENCY_PAIR)).toEqual('CELOBTC')
  })
  it('correctly parses API_KEYS', () => {
    process.env[EnvVar.API_KEYS] = 'COINBASE:foo,BINANCE:bar'
    expect(fetchParseValidateEnvVar(EnvVar.API_KEYS)).toEqual({COINBASE: 'foo', BINANCE: 'bar'})

    process.env[EnvVar.API_KEYS] = 'invalidExchange:foo'
    expect(() => fetchParseValidateEnvVar(EnvVar.API_KEYS)).toThrow()
  })
  it('parses aggregation method correctly', () => {
    process.env[EnvVar.AGGREGATION_METHOD] = 'Midprices'
    expect(fetchParseValidateEnvVar(EnvVar.AGGREGATION_METHOD)).toEqual(AggregationMethod.MIDPRICES)
  })

  it('sets a missing REPORT_TARGET_OVERRIDE to undefined', () => {
    expect(fetchParseValidateEnvVar(EnvVar.REPORT_TARGET_OVERRIDE)).toEqual(undefined)
  })
})
