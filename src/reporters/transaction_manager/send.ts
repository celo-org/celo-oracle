import { CeloTransactionObject } from '@celo/connect'
import { TransactionReceipt } from 'web3-core'

export default async function send(
  tx: CeloTransactionObject<void>,
  gasPrice: number,
  from: string,
  metricAction: <T>(fn: () => Promise<T>, action: string) => Promise<T>
) {
  const txResult = await metricAction(
    () =>
      tx.send({
        from,
        gasPrice,
      }),
    'send'
  )
  return metricAction<TransactionReceipt>(() => txResult.waitReceipt(), 'waitReceipt')
}
