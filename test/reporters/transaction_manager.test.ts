import { CeloTransactionObject } from '@celo/connect'
import BigNumber from 'bignumber.js'
import { TransactionReceipt } from 'web3-core'
import { TransactionManagerConfig } from '../../src/app'
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
}

// @ts-ignore
const defaultTx = ({} as unknown) as CeloTransactionObject<void>

export class MockReporter extends BaseReporter {
  _reportStrategy = ReportStrategy.BLOCK_BASED
}

describe('transaction manager', () => {
  const initialGasPrice = 10
  // Randomly generated addresss
  const mockOracleAccount = '0x086bb25bFCD323f82a7d1c95E4Cf3807B8831270'

  let defaultConfig: TransactionManagerConfig
  const metricAction: <T>(fn: () => Promise<T>, action: string) => Promise<T> = jest.fn()
  const sendSpy = jest.spyOn(send, 'default')
  sendSpy.mockImplementation(() => Promise.reject('error'))

  beforeEach(async () => {
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
      sendWithRetries(defaultTx, initialGasPrice, defaultConfig, metricAction)
    ).rejects.toEqual('error')
    expect(sendSpy).toHaveBeenCalled()
    expect(sendSpy).toBeCalledTimes(1)
    expect(sendSpy).toBeCalledWith(defaultTx, initialGasPrice, mockOracleAccount, metricAction)
  })

  it('passes transaction receipt back on successful send', async () => {
    sendSpy.mockImplementation(() => Promise.resolve(defaultReceipt))
    const receipt = await sendWithRetries(defaultTx, initialGasPrice, defaultConfig, metricAction)

    expect(sendSpy).toBeCalledTimes(1)
    expect(sendSpy).toBeCalledWith(defaultTx, initialGasPrice, mockOracleAccount, metricAction)
    expect(receipt).toEqual(defaultReceipt)
  })

  it('retries when transactionRetryLimit is configured', async () => {
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.resolve(defaultReceipt))
    const result = await sendWithRetries(
      defaultTx,
      initialGasPrice,
      {
        ...defaultConfig,
        transactionRetryLimit: 2,
      },
      metricAction
    )

    expect(sendSpy).toBeCalledTimes(3)
    expect(sendSpy).nthCalledWith(1, defaultTx, initialGasPrice, mockOracleAccount, metricAction)
    expect(sendSpy).nthCalledWith(2, defaultTx, initialGasPrice, mockOracleAccount, metricAction)
    expect(sendSpy).nthCalledWith(3, defaultTx, initialGasPrice, mockOracleAccount, metricAction)
    expect(result).toEqual(defaultReceipt)
  })

  it('retries with increased gas price when transactionRetryGasPriceMultiplier is configured', async () => {
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.resolve(defaultReceipt))

    const result = await sendWithRetries(
      defaultTx,
      initialGasPrice,
      {
        ...defaultConfig,
        transactionRetryLimit: 2,
        transactionRetryGasPriceMultiplier: new BigNumber(0.1),
      },
      metricAction
    )

    expect(sendSpy).toBeCalledTimes(3)
    expect(sendSpy).nthCalledWith(1, defaultTx, initialGasPrice, mockOracleAccount, metricAction)
    expect(sendSpy).nthCalledWith(2, defaultTx, 11, mockOracleAccount, metricAction)
    expect(sendSpy).nthCalledWith(3, defaultTx, 12, mockOracleAccount, metricAction)
    expect(result).toEqual(defaultReceipt)
  })

  it('calls onError when transactionRetryLimit is reached with no successful send', async () => {
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))
    sendSpy.mockImplementationOnce(() => Promise.reject('error'))

    await expect(() =>
      sendWithRetries(
        defaultTx,
        initialGasPrice,
        {
          ...defaultConfig,
          transactionRetryLimit: 2,
          transactionRetryGasPriceMultiplier: new BigNumber(0.1),
        },
        metricAction
      )
    ).rejects.toEqual('error')
    expect(sendSpy).toBeCalledTimes(3)
    expect(sendSpy).nthCalledWith(1, defaultTx, initialGasPrice, mockOracleAccount, metricAction)
    expect(sendSpy).nthCalledWith(2, defaultTx, 11, mockOracleAccount, metricAction)
    expect(sendSpy).nthCalledWith(3, defaultTx, 12, mockOracleAccount, metricAction)
  })
})
