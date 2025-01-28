import { CeloTransactionObject } from '@celo/connect'
import Logger from 'bunyan'
import { TransactionReceipt } from 'web3-core'

/**
 * Sends a transaction wrapped by the metricAction. Gas is estimated--
 * in the event that gas estimation fails due to this race condition:
 * https://github.com/celo-org/celo-blockchain/issues/1419, which can be identified
 * by gas estimation failing but the subsequent eth_call done by contractkit not
 * indicating a revert, fallbackGas is used.
 * @param tx the transaction to send
 * @param from the from address for the transaction
 * @param metricAction a function that wraps the sending of the tx, intended to record any metrics
 * @param fallbackGas the fallback gas to use in the event gas estimation incorrectly fails
 */
export default async function send(
  logger: Logger,
  tx: CeloTransactionObject<void>,
  from: string,
  metricAction: <T>(fn: () => Promise<T>, action: string) => Promise<T>
) {
  const txResult = await metricAction(async () => {
    try {
      // First, attempt to send transaction without a gas amount to have
      // contractkit estimate gas
      return await tx.send({
        from,
      })
    } catch (err: any) {
      logger.info({
        tx,
        from,
        err,
      })
      throw err
    }
  }, 'send')
  return metricAction<TransactionReceipt>(() => txResult.waitReceipt(), 'waitReceipt')
}
