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
  it('correctly handles API_KEYS', () => {
    process.env[EnvVar.API_KEYS] = 'COINBASE:foo,BINANCE:bar'
    expect(fetchParseValidateEnvVar(EnvVar.API_KEYS)).toEqual({ COINBASE: 'foo', BINANCE: 'bar' })

    process.env[EnvVar.API_KEYS] = 'BITSTAMP:foo'
    expect(fetchParseValidateEnvVar(EnvVar.API_KEYS)).toEqual({ BITSTAMP: 'foo'})

    process.env[EnvVar.API_KEYS] = 'invalidExchange:foo'
    expect(() => fetchParseValidateEnvVar(EnvVar.API_KEYS)).toThrow()
  })

  describe('correctly handles PRICE_SOURCES', () => {
    it('parses a single source correctly', () => {
      process.env[EnvVar.PRICE_SOURCES] = '[[{ exchange: "COINBASE", symbol: "CELOBTC", toInvert: false }]]'
      const parsed = fetchParseValidateEnvVar(EnvVar.PRICE_SOURCES)

      expect(parsed.length).toEqual(1)
      expect(parsed[0].pairs.length).toEqual(1)
      expect(parsed[0].pairs[0]).toEqual({
        exchange: 'COINBASE',
        symbol: 'CELOBTC',
        toInvert: false,
        ignoreVolume: false
      })
    })
    it('handles ignoreVolume property correctly', () => {
      process.env[EnvVar.PRICE_SOURCES] = '[[{ exchange: "COINBASE", symbol: "CELOBTC", toInvert: false, ignoreVolume: true }]]'
      const parsed = fetchParseValidateEnvVar(EnvVar.PRICE_SOURCES)
      expect(parsed[0].pairs[0].ignoreVolume).toBeTruthy()

      process.env[EnvVar.PRICE_SOURCES] = '[[{ exchange: "BINANCE", symbol: "CELOBTC", toInvert: false, ignoreVolume: false }]]'
      const parsed2 = fetchParseValidateEnvVar(EnvVar.PRICE_SOURCES)
      expect(parsed2[0].pairs[0].ignoreVolume).toBeFalsy()

      process.env[EnvVar.PRICE_SOURCES] = '[[{ exchange: "KRAKEN", symbol: "CELOBTC", toInvert: false}]]'
      const parsed3 = fetchParseValidateEnvVar(EnvVar.PRICE_SOURCES)
      expect(parsed3[0].pairs[0].ignoreVolume).toBeFalsy()
    })
    it('throws when any property has an invalid value', () => {
      process.env[EnvVar.PRICE_SOURCES] = '[[{ exchange: 123, symbol: "CELOBTC", toInvert: false}]]'
      expect(() => fetchParseValidateEnvVar(EnvVar.PRICE_SOURCES)).toThrow("exchange is 123 and not of type string")

      process.env[EnvVar.PRICE_SOURCES] = '[[{ exchange: "BINANCE", symbol: true, toInvert: false}]]'
      expect(() => fetchParseValidateEnvVar(EnvVar.PRICE_SOURCES)).toThrow("symbol is true and not of type string")

      process.env[EnvVar.PRICE_SOURCES] = '[[{ exchange: "BINANCE", symbol: "CELOBTC", toInvert: 345}]]'
      expect(() => fetchParseValidateEnvVar(EnvVar.PRICE_SOURCES)).toThrow("toInvert is 345 and not of type boolean")

      process.env[EnvVar.PRICE_SOURCES] = '[[{ exchange: "BINANCE", symbol: "CELOBTC", toInvert: false, ignoreVolume: "BTC"}]]'
      expect(() => fetchParseValidateEnvVar(EnvVar.PRICE_SOURCES)).toThrow("ignoreVolume is BTC and not of type boolean")
    })
    it('parses multiple source correctly', () => {
      process.env[EnvVar.PRICE_SOURCES] = `
        [
          [
            { exchange: "COINBASE", symbol: "CELOBTC", toInvert: false},
            { exchange: "BINANCE", symbol: "CELOBTC", toInvert: false, ignoreVolume: true}
          ],
          [
            { exchange: "BITTREX", symbol: "CELOBTC", toInvert: true, ignoreVolume: false }
          ]
        ]
      `
      const parsed = fetchParseValidateEnvVar(EnvVar.PRICE_SOURCES)

      expect(parsed.length).toEqual(2)
      expect(parsed[0].pairs.length).toEqual(2)
      expect(parsed[1].pairs.length).toEqual(1)
      expect(parsed[0].pairs).toEqual([
        {exchange: 'COINBASE', symbol: 'CELOBTC', toInvert: false, ignoreVolume: false},
        {exchange: 'BINANCE', symbol: 'CELOBTC', toInvert: false, ignoreVolume: true}
      ])
      expect(parsed[1].pairs[0]).toEqual(
        {exchange: 'BITTREX', symbol: 'CELOBTC', toInvert: true, ignoreVolume: false}
      )
    })
  })

  it('parses aggregation method correctly', () => {
    process.env[EnvVar.AGGREGATION_METHOD] = 'Midprices'
    expect(fetchParseValidateEnvVar(EnvVar.AGGREGATION_METHOD)).toEqual(AggregationMethod.MIDPRICES)
  })

  it('sets a missing REPORT_TARGET_OVERRIDE to undefined', () => {
    expect(fetchParseValidateEnvVar(EnvVar.REPORT_TARGET_OVERRIDE)).toEqual(undefined)
  })
})
