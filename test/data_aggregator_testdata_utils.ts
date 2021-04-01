import BigNumber from 'bignumber.js'
import { Ticker } from '../src/exchange_adapters/base'
import { Exchange } from '../src/utils'

// Ticker test cases: The combination of rows i of each testTicker array make test case i
const testTickerAsks = [
  [11.0, 11.2, 10.8],
  [0.111, 0.09, 0.14],
  [2.1, 2.1, 2.2],
  [0, 2.0, 2.2],
  [2.1, 2.0, 2.2],
  [2.1, 2.0, 2.2],
  [1.9, 2.1, 2.2],
  [2.4, 2.1, 2.2],
  [2.3, 1.6, 2.2],
  [2.1, 2.0, 2.2],
  [2.1, 2.0, 2.2],
  [2.1, 2.2, 2.151],
  [2.1, 2.0, 2.2],
  [11.0, 11.2, 10.8],
  [11.0, 11.2, 10.8],
  [0, 0, 0],
]

const testTickerBids = [
  [10.0, 9.8, 10.2],
  [0.11, 0.088, 0.13412],
  [1.9, 2.0, 2.1],
  [1.9, 2.0, 2.1],
  [1.9, 2.0, -0.1],
  [1.9, 2.0, 2.1],
  [2.1, 2.0, 2.1],
  [1.9, 2.0, 2.1],
  [2.0, 1.5, 2.0],
  [1.9, 1.3, 2.1],
  [1.9, 2.0, 2.1],
  [1.9, 2.0, 2.149],
  [1.9, 2.0, 2.1],
  [1.9, 2.0, 2.1],
  [1.9, 2.0, 2.1],
  [1.9, 2.0, 2.1],
]

const testTickerVolumes = [
  [1000, 40000, 12000],
  [1000000, 12000, 40000],
  [1000, 2000, 2000],
  [1000, 2000, 2000],
  [1000, 2000, 2000],
  [-1000, 2000, 2000],
  [1000, 2000, 2000],
  [1000, 2000, 2000],
  [1000, 2000, 2000],
  [1000, 2000, 2000],
  [1000, 2000, 1000000],
  [100000, 60000, 40000],
  [1000, 2000, 2000],
  [1000, 2000, 2000],
  [-1000, -2000, -2000],
  [1000, 2000, 2000],
]

const testTickerExchanges = [
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.OKCOIN],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
  [Exchange.COINBASE, Exchange.OKCOIN, Exchange.BITTREX],
]

export const testTickerArray: Ticker[][] = testTickerAsks.map((row, rowIndex) => {
  const thisTickerRow = row.map((thisAsk, colIndex) => {
    let thisTicker: Ticker
    thisTicker = {
      source: testTickerExchanges[rowIndex][colIndex],
      symbol: 'CELO/USD',
      timestamp: 1000000 + rowIndex * 100,
      ask: new BigNumber(thisAsk),
      bid: new BigNumber(testTickerBids[rowIndex][colIndex]),
      lastPrice: new BigNumber(testTickerBids[rowIndex][colIndex] - 0.03),
      baseVolume: new BigNumber(testTickerVolumes[rowIndex][colIndex]),
    }
    return thisTicker
  })
  return thisTickerRow
})

export function generateGoodTicker(exchange: Exchange): Ticker {
  return {
    source: exchange,
    symbol: 'CELO/USD',
    timestamp: 1590599679,
    ask: new BigNumber(1.1),
    bid: new BigNumber(1.05),
    lastPrice: new BigNumber(1.07),
    baseVolume: new BigNumber(1000),
  }
}
