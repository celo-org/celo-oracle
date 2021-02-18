import BigNumber from 'bignumber.js'
import Web3 from 'web3'
import { OracleApplicationConfig } from '../src/app'
import { defaultApplicationConfig } from '../src/default_config'
import { EnvVar } from '../src/envvar_utils'
import { getApplicationConfig } from '../src/run_app'
import { AggregationMethod, Exchange, OracleCurrencyPair, WalletType } from '../src/utils'

const env = { ...process.env }

describe('run_app', () => {
  afterEach(() => {
    process.env = env
  })

  describe('getApplicationConfig', () => {
    beforeEach(() => {
      // Ensure none of the overrides are set
      for (const k of Object.keys(EnvVar)) {
        // @ts-ignore
        delete process.env[EnvVar[k]]
      }
    })

    describe('validEnvVar', () => {
      function setAndTestEnvVarValue(
        envVarName: EnvVar,
        correctInputs: any[],
        incorrectInputs: any[]
      ) {
        delete process.env[envVarName]
        for (const correct of correctInputs) {
          process.env[envVarName] = correct
          expect(getApplicationConfig).not.toThrowError()
          delete process.env[envVarName]
        }
        for (const incorrect of incorrectInputs) {
          process.env[envVarName] = incorrect
          expect(getApplicationConfig).toThrowError()
          delete process.env[envVarName]
        }
      }
      it('correctly processes AZURE_KEY_VAULT_NAME', () => {
        const corrects = [
          'mA89n2-flkdi123-c2',
          '90878Ad-kjsdaf-123',
          '012',
          '123456789-123456789-1234',
        ]
        const incorrects = [
          'hi',
          'a+=-|h820-fn vfd',
          'mA89n2-flkdi123-c2 ',
          'mA89n2 - flkdi123 - c2',
          '0123456789-0123456789-0123456789-0123456789',
        ]
        setAndTestEnvVarValue(EnvVar.AZURE_KEY_VAULT_NAME, corrects, incorrects)
      })

      it('correctly processes UNUSED_ORACLE_ADDRESSES', () => {
        const corrects = [
          '0x0000000000000000000000000000000123456789,0x0000000000000000000000000000000123456781,0x0000000000000000000000000000000123456782,0x0000000000000000000000000000000123456783',
        ]
        const incorrects = [
          '0x0000000000000000000000000000000123456789,0z0000000000000000000123456789,0lkasjdf',
        ]
        setAndTestEnvVarValue(EnvVar.UNUSED_ORACLE_ADDRESSES, corrects, incorrects)
      })

      it('correctly processes WS_RPC_PROVIDER_URL', () => {
        const corrects = ['ws://bar.foo', 'wss://bar.foo.foo']
        const incorrects = ['ws:/bar.foo', 'wss:/bar.foo']
        setAndTestEnvVarValue(EnvVar.WS_RPC_PROVIDER_URL, corrects, incorrects)
      })

      it('correctly processes REPORT_STRATEGY', () => {
        const corrects = ['BLOCK_BASED', 'TIMER_BASED', 'block_based', 'timer_based']
        const incorrects = ['timerbased', 'block']
        setAndTestEnvVarValue(EnvVar.REPORT_STRATEGY, corrects, incorrects)
      })

      it('correctly processes CURRENCY_PAIR', () => {
        const corrects = ['CELOUSD', 'CELOBTC', 'CELOEUR']
        const incorrects = ['celousd', 'celobtc', 'celoeth', 'invalidpair']
        setAndTestEnvVarValue(EnvVar.CURRENCY_PAIR, corrects, incorrects)
      })

      it('correctly processes REPORT_TARGET_OVERRIDE', () => {
        const corrects = [Web3.utils.randomHex(20), undefined]
        const incorrects = ['string', '0x0123123a']
        setAndTestEnvVarValue(EnvVar.REPORT_TARGET_OVERRIDE, corrects, incorrects)
      })

      it('correctly processes AGGREGATION_SCALING_RATE', () => {
        const corrects = [0, 0.000123, 0.9999999]
        const incorrects = [1, 1.23, -0.01]
        setAndTestEnvVarValue(EnvVar.AGGREGATION_SCALING_RATE, corrects, incorrects)
      })

      it('correctly processes AGGREGATION_METHOD', () => {
        const corrects = ['TRADES', 'MIDPRICES', 'midPRiCes']
        const incorrects = ['NOPE', 123]
        setAndTestEnvVarValue(EnvVar.AGGREGATION_METHOD, corrects, incorrects)
      })

      it('correctly processes OVERRIDE_INDEX', () => {
        const corrects = ['0', '13']
        const incorrects = ['-23', 'ac', '1.934']
        setAndTestEnvVarValue(EnvVar.OVERRIDE_INDEX, corrects, incorrects)
      })

      it('correctly processes AGGREGATION_SCALING_RATE', () => {
        const corrects = ['0.01', '0', '0.999999999']
        const incorrects = ['-23', 'asdff', '2', '1']
        setAndTestEnvVarValue(EnvVar.AGGREGATION_SCALING_RATE, corrects, incorrects)
      })

      it('correctly processes PROMETHEUS_PORT', () => {
        const corrects = ['9090', '65535']
        const incorrects = ['65536', '9090.123', '0.1', '0']
        setAndTestEnvVarValue(EnvVar.PROMETHEUS_PORT, corrects, incorrects)
      })
    })

    it('defaults to defaultApplicationConfig', () => {
      const appConfig = getApplicationConfig()
      expect(appConfig).toEqual(defaultApplicationConfig)
    })

    it('overrides with env vars according to applicationConfigEnvVars', () => {
      const envVarValues: { [key: string]: any } = {
        [EnvVar.ADDRESS]: '0x0000000000000000000000000000000123456789',
        [EnvVar.AGGREGATION_SCALING_RATE]: '0.000123',
        [EnvVar.AZURE_KEY_VAULT_NAME]: 'testKeyVaultName',
        [EnvVar.AGGREGATION_METHOD]: 'TRADES',
        [EnvVar.EXCHANGES]: 'COINBASE,BITTREX',
        [EnvVar.HTTP_RPC_PROVIDER_URL]: 'http://bar.foo',
        [EnvVar.MINIMUM_EXCHANGES]: '2',
        [EnvVar.PRIVATE_KEY_PATH]: 'testPkeyPath',
        [EnvVar.REPORT_OFFSET_OVERRIDE]: '5000',
        [EnvVar.CURRENCY_PAIR]: 'CELOBTC',
        [EnvVar.WALLET_TYPE]: 'AZURE_HSM',
        [EnvVar.WS_RPC_PROVIDER_URL]: 'ws://bar.foo',
      }
      for (const k of Object.keys(envVarValues)) {
        process.env[k] = envVarValues[k]
      }
      const expectedAppConfig: OracleApplicationConfig = {
        ...defaultApplicationConfig,
        address: '0x0000000000000000000000000000000123456789',
        azureKeyVaultName: 'testKeyVaultName',
        dataAggregatorConfig: {
          ...defaultApplicationConfig.dataAggregatorConfig,
          aggregationMethod: AggregationMethod.TRADES,
          exchanges: [Exchange.COINBASE, Exchange.BITTREX],
          minExchangeCount: 2,
          scalingRate: new BigNumber(0.000123), // Verifies that it handles non-int numbers correctly
        },
        httpRpcProviderUrl: 'http://bar.foo',
        privateKeyPath: 'testPkeyPath',
        reporterConfig: {
          ...defaultApplicationConfig.reporterConfig,
        },
        currencyPair: OracleCurrencyPair.CELOBTC,
        walletType: WalletType.AZURE_HSM,
        wsRpcProviderUrl: 'ws://bar.foo',
      }
      const appConfig = getApplicationConfig()
      expect(appConfig).toEqual(expectedAppConfig)
    })
  })
})
