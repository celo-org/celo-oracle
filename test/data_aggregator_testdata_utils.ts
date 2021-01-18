import BigNumber from 'bignumber.js'
import { Ticker, Trade } from '../src/exchange_adapters/base'
import { Exchange } from '../src/utils'

const testArray1 = [
  [205, 10],
  [209, 10],
  [210, 10],
  [230, 10],
  [255, 10],
  [300, 10],
]

const testArray2 = [
  [201, 10],
  [204, 10],
  [209, 10],
  [225, 100],
  [211, 10],
  [320, 10],
  [255, 10],
]

export const testArrayBig1: Trade[] = testArray1.map((a, i) => {
  let temp: Trade
  temp = {
    source: Exchange.OKCOIN,
    id: '12',
    symbol: 'CELO-USD',
    timestamp: i * 6000,
    price: new BigNumber(a[0]),
    amount: new BigNumber(a[1]),
    cost: new BigNumber(0),
  }
  return temp
})

export const testArrayBig2: Trade[] = testArray2.map((a, i) => {
  let temp: Trade
  temp = {
    source: Exchange.COINBASE,
    id: '12',
    symbol: 'CELO-USD',
    timestamp: i * 6000 + 2000,
    price: new BigNumber(a[0]),
    amount: new BigNumber(a[1]),
    cost: new BigNumber(0),
  }
  return temp
})

export const testArrayBig3 = testArray1.map((a, i) => {
  let temp: Trade
  temp = {
    source: Exchange.OKCOIN,
    id: '12',
    symbol: 'CELO-USD',
    timestamp: i * 6000,
    price: new BigNumber(a[0]),
    amount: new BigNumber(a[1]).multipliedBy(
      Math.exp((-0.1 / 1000) * ((testArray1.length - 1 - i) * 6000))
    ),
    cost: new BigNumber(0),
  }
  return temp
})

export const testArraySmallAmounts1 = testArray1.map((a, i) => {
  let temp: Trade
  temp = {
    source: Exchange.OKCOIN,
    id: '12',
    symbol: 'CELO-USD',
    timestamp: i * 6000,
    price: new BigNumber(a[0]),
    amount: new BigNumber(a[1]).multipliedBy(new BigNumber('1e-390')),
    cost: new BigNumber(0),
  }
  return temp
})

export const testArraySmallAmounts2 = testArray2.map((a, i) => {
  let temp: Trade
  temp = {
    source: Exchange.COINBASE,
    id: '12',
    symbol: 'CELO-USD',
    timestamp: i * 6000 + 2000,
    price: new BigNumber(a[0]),
    amount: new BigNumber(a[1]).multipliedBy(new BigNumber('1e-390')),
    cost: new BigNumber(0),
  }
  return temp
})

export const testArrayLarge1: Trade[] = []
for (let i = 1; i < 10001; i++) {
  const temp: Trade = {
    source: Exchange.COINBASE,
    id: '12',
    symbol: 'CELO-USD',
    timestamp: (i / 10000) * 300000,
    price: new BigNumber(0.0001 * i + 160),
    amount: new BigNumber(10),
    cost: new BigNumber(0),
  }
  testArrayLarge1.push(temp)
}

export const testArrayLarge2 = testArrayLarge1.map((x) => {
  return {
    ...x,
    price: x.price.minus(1),
  }
})

export const testArrayLarge3 = testArrayLarge1.map((x) => {
  return {
    ...x,
    price: x.price.minus(2),
  }
})

export const testArrayLarge4 = testArrayLarge1.map((x) => {
  return {
    ...x,
    price: x.price.plus(1),
  }
})

export const testArrayLarge5 = testArrayLarge1.map((x) => {
  return {
    ...x,
    price: x.price.plus(2),
  }
})

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

/**
 * Helper function to calculate a test case
 * If weights are set the same for each trade, exponential time scaling is used and
 * time stamp is increseing with index, this function calculates the index of the
 * halfWeight to determine the weighted Median.
 */

export function halfWeightExponentialScaling(
  scalingRate: BigNumber,
  windowSize: number,
  numberOfTrades: number
) {
  return (
    numberOfTrades -
    Math.ceil(
      -Math.log(
        (1 / 2) *
          (1 +
            Math.exp(
              scalingRate.negated().times(windowSize).dividedBy(numberOfTrades).toNumber()
            ) **
              (numberOfTrades + 1))
      ) /
        scalingRate.times(windowSize).div(numberOfTrades).toNumber() -
        1
    )
  )
}

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
