import { CeloTransactionObject } from '@celo/connect'
import { TransactionReceipt } from 'web3-core'
import { TransactionManagerConfig } from '../../app'
import { Context } from '../../metric_collector'
import { onError } from '../../utils'
import send from './send'

export default async function sendWithRetries(
  tx: CeloTransactionObject<void>,
  initialGasPrice: number,
  config: TransactionManagerConfig,
  metricAction: <T>(fn: () => Promise<T>, action: string) => Promise<T>
): Promise<TransactionReceipt> {
  let attempt = 0
  let lastCaughtError = null

  do {
    const calculatedGasPrice = config.transactionRetryGasPriceMultiplier
      .times(attempt)
      .times(initialGasPrice)
      .plus(initialGasPrice)
      .toNumber()
    try {
      return await send(tx, calculatedGasPrice, config.oracleAccount, metricAction)
    } catch (e) {
      lastCaughtError = e
      onError(e, {
        context: Context.TRANSACTION_MANAGER,
        logger: config.logger,
        logMsg: 'Unable to send transaction',
        metricCollector: config.metricCollector,
        swallowError: true,
      })
    }
    attempt++
  } while (attempt <= config.transactionRetryLimit)

  throw lastCaughtError
}