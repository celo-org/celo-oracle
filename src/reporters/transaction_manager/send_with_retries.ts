import { CeloTransactionObject } from '@celo/connect'
import Logger from 'bunyan'
import { TransactionReceipt } from 'web3-core'
import { TransactionManagerConfig } from '../../app'
import { Context } from '../../metric_collector'
import { onError } from '../../utils'
import send from './send'

export default async function sendWithRetries(
  logger: Logger,
  tx: CeloTransactionObject<void>,
  config: TransactionManagerConfig,
  metricAction: <T>(fn: () => Promise<T>, action: string) => Promise<T>
): Promise<TransactionReceipt> {
  let lastCaughtError = null

    try {
      return await send(
        logger,
        tx,
        config.oracleAccount,
        metricAction
      )
    } catch (err: any) {
      lastCaughtError = err
      onError(err, {
        context: Context.TRANSACTION_MANAGER,
        logger: config.logger,
        logMsg: 'Unable to send transaction',
        metricCollector: config.metricCollector,
        swallowError: true,
      })
    }

  throw lastCaughtError
}
