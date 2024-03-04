import {
  CeloTransactionObject,
  toTransactionObject,
  Connection,
  Contract,
  CeloTx,
  CeloTxReceipt,
  CeloTxObject,
} from '@celo/connect'
import BigNumber from 'bignumber.js'
import Web3 from 'web3'
import { PromiEvent, TransactionReceipt } from 'web3-core'
import { TransactionManagerConfig } from '../../src/app'
import { baseLogger } from '../../src/default_config'
import { BaseReporter } from '../../src/reporters/base'
import * as send from '../../src/reporters/transaction_manager/send'
import sendWithRetries from '../../src/reporters/transaction_manager/send_with_retries'
import * as utils from '../../src/utils'

const { ReportStrategy } = utils

const defaultReceipt: TransactionReceipt = {
  blockHash: 'xxx',
  blockNumber: 10,
  to: 'xxx',
  transactionHash: 'xxx',
  transactionIndex: 1,
  cumulativeGasUsed: 1,
  gasUsed: 1,
  logs: [],
  logsBloom: 'xxx',
  status: true,
  from: 'xxx',
  effectiveGasPrice: 123,
}

// @ts-ignore
const defaultTx = ({} as unknown) as CeloTransactionObject<void>

const fallbackGas = 4321

export class MockReporter extends BaseReporter {
  _reportStrategy = ReportStrategy.BLOCK_BASED
}

describe('transaction manager', () => {
  const initialGasPrice = 10
  // Randomly generated addresss
  const mockOracleAccount = '0x086bb25bFCD323f82a7d1c95E4Cf3807B8831270'

  let defaultConfig: TransactionManagerConfig
  const metricAction: <T>(fn: () => Promise<T>, action: string) => Promise<T> = jest.fn()
  let sendSpy: any

  beforeEach(async () => {
    sendSpy = jest.spyOn(send, 'default')
    sendSpy.mockImplementation(() => Promise.reject('error'))
    defaultConfig = {
      gasPriceMultiplier: new BigNumber(5.0),
      transactionRetryLimit: 0,
      transactionRetryGasPriceMultiplier: new BigNumber(0),
      oracleAccount: mockOracleAccount,
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("doesn't retry when 0 retry limit configured", async () => {
    expect(() =>
      sendWithRetries(
        baseLogger,
        defaultTx,
        initialGasPrice,
        defaultConfig,
        metricAction,
        fallbackGas
      )
    ).rejects.toEqual('error')
    expect(sendSpy).toHaveBeenCalled()
    expect(sendSpy).toBeCalledTimes(1)
    expect(sendSpy).toBeCalledWith(
      baseLogger,
      defaultTx,
      initialGasPrice,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
  })

  it('passes transaction receipt back on successful send', async () => {
    sendSpy.mockImplementation(() => Promise.resolve(defaultReceipt))
    const receipt = await sendWithRetries(
      baseLogger,
      defaultTx,
      initialGasPrice,
      defaultConfig,
      metricAction,
      fallbackGas
    )

    expect(sendSpy).toBeCalledTimes(1)
    expect(sendSpy).toBeCalledWith(
      baseLogger,
      defaultTx,
      initialGasPrice,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
    expect(receipt).toEqual(defaultReceipt)
  })

  it('retries when transactionRetryLimit is configured', async () => {
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.resolve(defaultReceipt))
    const result = await sendWithRetries(
      baseLogger,
      defaultTx,
      initialGasPrice,
      {
        ...defaultConfig,
        transactionRetryLimit: 2,
      },
      metricAction,
      fallbackGas
    )

    expect(sendSpy).toBeCalledTimes(3)
    expect(sendSpy).nthCalledWith(
      1,
      baseLogger,
      defaultTx,
      initialGasPrice,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
    expect(sendSpy).nthCalledWith(
      2,
      baseLogger,
      defaultTx,
      initialGasPrice,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
    expect(sendSpy).nthCalledWith(
      3,
      baseLogger,
      defaultTx,
      initialGasPrice,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
    expect(result).toEqual(defaultReceipt)
  })

  it('retries with increased gas price when transactionRetryGasPriceMultiplier is configured', async () => {
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.resolve(defaultReceipt))

    const result = await sendWithRetries(
      baseLogger,
      defaultTx,
      initialGasPrice,
      {
        ...defaultConfig,
        transactionRetryLimit: 2,
        transactionRetryGasPriceMultiplier: new BigNumber(0.1),
      },
      metricAction,
      fallbackGas
    )

    expect(sendSpy).toBeCalledTimes(3)
    expect(sendSpy).nthCalledWith(
      1,
      baseLogger,
      defaultTx,
      initialGasPrice,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
    expect(sendSpy).nthCalledWith(
      2,
      baseLogger,
      defaultTx,
      11,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
    expect(sendSpy).nthCalledWith(
      3,
      baseLogger,
      defaultTx,
      12,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
    expect(result).toEqual(defaultReceipt)
  })

  it('calls onError when transactionRetryLimit is reached with no successful send', async () => {
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))

    await expect(() =>
      sendWithRetries(
        baseLogger,
        defaultTx,
        initialGasPrice,
        {
          ...defaultConfig,
          transactionRetryLimit: 2,
          transactionRetryGasPriceMultiplier: new BigNumber(0.1),
        },
        metricAction,
        fallbackGas
      )
    ).rejects.toEqual('error')
    expect(sendSpy).toBeCalledTimes(3)
    expect(sendSpy).nthCalledWith(
      1,
      baseLogger,
      defaultTx,
      initialGasPrice,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
    expect(sendSpy).nthCalledWith(
      2,
      baseLogger,
      defaultTx,
      11,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
    expect(sendSpy).nthCalledWith(
      3,
      baseLogger,
      defaultTx,
      12,
      mockOracleAccount,
      metricAction,
      fallbackGas
    )
  })

  describe('fallback gas', () => {
    let mockTxObject: CeloTxObject<void>
    let connection: Connection
    // Just wraps the fn passed in, required by the send fn
    const mockMetricAction: <T>(fn: () => Promise<T>, action: string) => Promise<T> = async <T>(
      fn: () => Promise<T>,
      _action: string
    ) => fn()
    const mockEstimateGas = 1234

    // This is where we will record the amount of gas actually used in the send call
    let gas: string | number | undefined

    beforeEach(() => {
      jest.mock('web3')
      // Restore the `send` mock so we use the real implementation
      sendSpy.mockRestore()

      // The mocked result from a call to the tx object's `send` function.
      // PromiEvent involves an `on` function that calls a callback upon
      // a specified event occurring.
      // Disable type assertion lint error-- PromiEvent<CeloTxReceipt>
      // is a complex type and we only need certain features.
      // tslint:disable-next-line:no-object-literal-type-assertion
      const mockSendResult = {} as PromiEvent<CeloTxReceipt>
      mockSendResult.on = (event: string, fn: any) => {
        // Only immediately handle these events
        switch (event) {
          case 'transactionHash':
            fn('0xf00b00')
            break
          case 'receipt':
            fn(defaultReceipt)
            break
        }
        // Return sendResult to allow chaining of `.on`s
        return mockSendResult
      }

      // Reset gas
      gas = 0

      mockTxObject = {
        arguments: [],
        call: (_tx?: CeloTx) => Promise.resolve(),
        send: (tx?: CeloTx) => {
          gas = tx ? tx.gas : 0
          return mockSendResult
        },
        estimateGas: (_tx?: CeloTx) => Promise.resolve(mockEstimateGas),
        encodeABI: () => '',
        // Disable type assertion lint error-- Contract
        // is a complex type and it's not used in our test.
        // tslint:disable-next-line:no-object-literal-type-assertion
        _parent: {} as Contract,
      }

      // Create a new Connection
      connection = new Connection(new Web3('http://'))
    })

    it('uses estimated gas when gas estimation is successful', async () => {
      const txo = toTransactionObject(connection, mockTxObject)
      await send.default(
        baseLogger,
        txo,
        123,
        '0xf000000000000000000000000000000000000000',
        mockMetricAction,
        fallbackGas
      )
      // Contractkit will multiply the estimateGas result by gasInflationFactor
      // @ts-ignore because connection.config is private
      expect(gas).toEqual(Math.floor(mockEstimateGas * connection.config.gasInflationFactor))
    })

    it('uses fallback gas when gas estimation fails but eth_call does not', async () => {
      mockTxObject.estimateGas = (_tx?: CeloTx) => Promise.reject('intentional error!')

      // Mock eth_call to return 0x, indicating there was not a revert
      // We mock connection.web3.eth.call as that is what is used as the caller:
      // https://github.com/celo-org/celo-monorepo/blob/fc31eb0c327a33d426154ad13faade361540dd72/packages/sdk/connect/src/connection.ts#L238
      const connectionSendSpy = jest.spyOn(connection.web3.eth, 'call')
      connectionSendSpy.mockImplementation(() => Promise.resolve('0x'))
      // Craft a transaction object
      const txo = toTransactionObject(connection, mockTxObject)
      await send.default(
        baseLogger,
        txo,
        123,
        '0xf000000000000000000000000000000000000000',
        mockMetricAction,
        fallbackGas
      )
      expect(gas).toEqual(fallbackGas)
    })

    it('fails when gas estimation fails and eth_call indicates a revert occurred', async () => {
      mockTxObject.estimateGas = (_tx?: CeloTx) => Promise.reject('intentional error!')
      // This is grabbed from an intentionally crafted report transaction whose
      // lesser/greater values were incorrect.
      // 0x08c379a indicates a revert occurred, and the rest of the string can
      // be decoded to get the revert message:
      // web3.eth.abi.decodeParameter('string', '0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001e676574206c657373657220616e642067726561746572206661696c7572650000')
      // > 'get lesser and greater failure'
      // We mock connection.web3.eth.call as that is what is used as the caller:
      // https://github.com/celo-org/celo-monorepo/blob/fc31eb0c327a33d426154ad13faade361540dd72/packages/sdk/connect/src/connection.ts#L238
      const connectionSendSpy = jest.spyOn(connection.web3.eth, 'call')
      connectionSendSpy.mockImplementation(() =>
        Promise.resolve(
          '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001e676574206c657373657220616e642067726561746572206661696c7572650000'
        )
      )
      // Craft a transaction object
      const txo = toTransactionObject(connection, mockTxObject)
      await expect(() =>
        send.default(
          baseLogger,
          txo,
          123,
          '0xf000000000000000000000000000000000000000',
          mockMetricAction,
          fallbackGas
        )
      ).rejects.toThrow(
        'Gas estimation failed: get lesser and greater failure or intentional error!'
      )
    })
  })
})
