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
 * @param gasPrice the gas price for the transaction
 * @param from the from address for the transaction
 * @param metricAction a function that wraps the sending of the tx, intended to record any metrics
 * @param fallbackGas the fallback gas to use in the event gas estimation incorrectly fails
 */
export default async function send(
  logger: Logger,
  tx: CeloTransactionObject<void>,
  gasPrice: number,
  from: string,
  metricAction: <T>(fn: () => Promise<T>, action: string) => Promise<T>,
  fallbackGas?: number
) {
  const txResult = await metricAction(
    async () => {
      try {
        // First, attempt to send transaction without a gas amount to have
        // contractkit estimate gas
        return await tx.send({
          from,
          gasPrice,
        })
      } catch (err) {
        // If anything fails, the error is caught here.
        // We seek the case where gas estimation has failed but the subsequent
        // eth_call made by contractkit to get the revert reason has not given
        // a revert reason. In this situation, the following string will be
        // included in the error string: 'Gas estimation failed: Could not decode transaction failure reason'
        if (err.message.includes('Gas estimation failed: Could not decode transaction failure reason') && fallbackGas !== undefined) {
          logger.info({
            tx,
            gasPrice,
            from,
            fallbackGas,
            err
          }, 'Gas estimation failed but eth_call did not, using fallback gas')
          // Retry with the fallbackGas to avoid gas estimation
          return tx.send({
            from,
            gasPrice,
            gas: fallbackGas
          })
        }
        // If there was a legitimate error, we still throw
        throw err
      }
    },
    'send'
  )
  return metricAction<TransactionReceipt>(() => txResult.waitReceipt(), 'waitReceipt')
}
