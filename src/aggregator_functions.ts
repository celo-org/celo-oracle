import BigNumber from 'bignumber.js'
import Logger from 'bunyan'
import { DataAggregatorConfig } from './data_aggregator'
import { Ticker, Trade } from './exchange_adapters/base'
import { doFnWithErrorContext } from './utils'

export function weightedMedian(trades: Trade[], needsSorting: boolean = true): BigNumber {
  if (needsSorting) {
    trades.sort((a: Trade, b: Trade) => a.price.comparedTo(b.price))
  }

  const weights = trades.map((trade: Trade) => trade.amount)
  for (const weight of weights) {
    if (weight.isLessThan(0)) {
      throw Error(`Weight cannot be negative: ${weight}`)
    }
  }
  const weightsSum = weights.reduce(
    (sum: BigNumber, weight: BigNumber) => sum.plus(weight),
    new BigNumber(0)
  )
  if (weightsSum.isZero() || !weightsSum.isFinite()) {
    throw Error(`Invalid weight sum value ${weightsSum}`)
  }
  const halfWeight = weightsSum.multipliedBy(0.5)

  let indexAbove = 0
  let cumulativeWeight = new BigNumber(0)

  for (; cumulativeWeight.isLessThan(halfWeight); ++indexAbove) {
    cumulativeWeight = cumulativeWeight.plus(weights[indexAbove])
  }

  if (cumulativeWeight.isEqualTo(halfWeight) && indexAbove < trades.length) {
    return trades[indexAbove - 1].price.plus(trades[indexAbove].price).multipliedBy(0.5)
  }
  return trades[indexAbove - 1].price
}

/**
 * exponentialWeights is mixing BigNumber and Math/Number operations. BigNumber does not support fractional powers.
 */
export function exponentialWeights(weight: BigNumber, time: number, rate: BigNumber): BigNumber {
  return weight.multipliedBy(Math.exp(rate.negated().times(time).toNumber()))
}

export function weightedMeanMidPrice(tickerData: Ticker[]): BigNumber {
  const asks = tickerData.map((ticker: Ticker) => ticker.ask)
  const bids = tickerData.map((ticker: Ticker) => ticker.bid)
  const baseVolumes = tickerData.map((ticker: Ticker) => ticker.baseVolume)
  const mids = asks.map((ask, i) => ask.plus(bids[i]).div(new BigNumber(2)))
  const weightedMids = mids.map((mid, i) => mid.multipliedBy(baseVolumes[i]))

  const baseVolumesSum = baseVolumes.reduce(
    (sum: BigNumber, mid: BigNumber) => sum.plus(mid),
    new BigNumber(0)
  )
  const weightedMidsSum = weightedMids.reduce(
    (sum: BigNumber, mid: BigNumber) => sum.plus(mid),
    new BigNumber(0)
  )
  const weightedMidAverage = weightedMidsSum.div(baseVolumesSum)

  return weightedMidAverage
}

/**
 * checks to be performed on each ticker individually
 */
export function checkIndividualTickerData(
  tickerData: Ticker[],
  config: DataAggregatorConfig,
  logger: Logger
): Ticker[] {
  const validTickerData: Ticker[] = []

  for (const thisTickerData of tickerData) {
    // 1. Non-recoverable errors (should lead to the client not reporting)
    // Ignore individual ticker if any of these checks fail
    const checkRecoverableErrors = () => {
      // types
      assert(
        typeof thisTickerData.timestamp === 'number',
        `${thisTickerData.source}: timestamp is ${thisTickerData.timestamp} and not of type number`
      )
      assert(
        BigNumber.isBigNumber(thisTickerData.ask),
        `${thisTickerData.source}: ask is ${thisTickerData.ask} and not of type BigNumber`
      )
      assert(
        BigNumber.isBigNumber(thisTickerData.bid),
        `${thisTickerData.source}: bid is ${thisTickerData.bid} and not of type BigNumber`
      )
      assert(
        BigNumber.isBigNumber(thisTickerData.baseVolume),
        `${thisTickerData.source}: baseVolume is ${thisTickerData.baseVolume} and not of type BigNumber`
      )
      // Check percentage bid-ask spread smaller than maxPercentageBidAskSpread
      const percentageBidAskSpread = thisTickerData.ask
        .minus(thisTickerData.bid)
        .div(thisTickerData.ask)
      assert(
        percentageBidAskSpread.isLessThanOrEqualTo(config.maxPercentageBidAskSpread),
        `${thisTickerData.source}: percentage bid-ask spread (${percentageBidAskSpread}) larger than maxPercentageBidAskSpread (${config.maxPercentageBidAskSpread})`
      )
      // values are greater than zero
      assert(
        thisTickerData.ask.isGreaterThan(0),
        `${thisTickerData.source}: ask (${thisTickerData.ask}) not positive`
      )
      assert(
        thisTickerData.bid.isGreaterThan(0),
        `${thisTickerData.source}: bid (${thisTickerData.bid}) not positive`
      )
      // ask bigger equal bid
      assert(
        thisTickerData.ask.isGreaterThanOrEqualTo(thisTickerData.bid),
        `${thisTickerData.source}: bid (${thisTickerData.bid}) larger than ask (${thisTickerData.ask})`
      )
      // Check that there is some volume on the exchange
      assert(
        thisTickerData.baseVolume.isGreaterThan(0),
        `${thisTickerData.source}: volume (${thisTickerData.baseVolume}) not positive`
      )
      // TODO: Check timestamp not older than X (X as config parameter) seconds

      // keep current ticker if all checks passed
      validTickerData.push(thisTickerData)
    }

    doFnWithErrorContext({
      fn: checkRecoverableErrors,
      context: thisTickerData.source,
      metricCollector: config.metricCollector,
      logger,
      logMsg: 'Recoverable error in individual ticker check',
      swallowError: true,
    })
  }
  assert(validTickerData.length > 0, `No valid tickers available`)
  return validTickerData
}

/**
 * checks to be performed across tickers
 */
export function crossCheckTickerData(tickerData: Ticker[], config: DataAggregatorConfig): Ticker[] {
  // 1. Asks should not deviate more than askMaxPercentageDeviation
  const asks = tickerData.map((ticker: Ticker) => ticker.ask)
  const askMaxNormalizedAbsMeanDev = maxPercentageDeviaton(asks)
  assert(
    askMaxNormalizedAbsMeanDev.isLessThanOrEqualTo(config.askMaxPercentageDeviation),
    `Max ask price cross-sectional deviation too large (${askMaxNormalizedAbsMeanDev} >= ${config.askMaxPercentageDeviation})`
  )

  // 2. Bids should not deviate more than bidMaxPercentageDeviation
  const bids = tickerData.map((ticker: Ticker) => ticker.bid)
  const bidsMaxNormalizedAbsMeanDev = maxPercentageDeviaton(bids)
  assert(
    bidsMaxNormalizedAbsMeanDev.isLessThanOrEqualTo(config.bidMaxPercentageDeviation),
    `Max bid price cross-sectional deviation too large (${bidsMaxNormalizedAbsMeanDev} >= ${config.bidMaxPercentageDeviation} )`
  )

  // 3. No exchange should make up more than maxExchangeVolumeShare
  const volumes = tickerData.map((ticker: Ticker) => ticker.baseVolume)
  const volumesSum = volumes.reduce(
    (sum: BigNumber, el: BigNumber) => sum.plus(el),
    new BigNumber(0)
  )
  const exchangeVolumeShares = volumes.map((el: BigNumber) => el.div(volumesSum))
  const largestExchangeVolumeShare = BigNumber.max.apply(null, exchangeVolumeShares)
  assert(
    largestExchangeVolumeShare.isLessThanOrEqualTo(config.maxExchangeVolumeShare),
    `The volume share of one exchange is too large (${largestExchangeVolumeShare} > ${config.maxExchangeVolumeShare})`
  )

  // 4. No exchange should be represented by more than one ticker
  const sources = tickerData.map((ticker: Ticker) => ticker.source)
  assert(
    new Set(sources).size === sources.length,
    `Received multiple tickers for the same exchange`
  )

  // 5. The sum of all exchange volume should be greater than the min threshold
  const validTickerAggregateVolume: BigNumber = tickerData.reduce(
    (sum, el) => sum.plus(el.baseVolume),
    new BigNumber(0)
  )
  assert(
    validTickerAggregateVolume.isGreaterThanOrEqualTo(config.minAggregatedVolume),
    `Aggregate volume ${validTickerAggregateVolume} is less than minimum threshold ${config.minAggregatedVolume}`
  )

  return tickerData
}

export function maxPercentageDeviaton(arr: BigNumber[]) {
  const arrSum = arr.reduce((sum: BigNumber, el: BigNumber) => sum.plus(el), new BigNumber(0))
  const arrMean = arrSum.div(arr.length)
  const arrNormalizedAbsMeanDev = arr.map((el: BigNumber) => el.div(arrMean).minus(1).abs())
  const arrMaxNormalizedAbsMeanDev = BigNumber.max.apply(null, arrNormalizedAbsMeanDev)

  return arrMaxNormalizedAbsMeanDev
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw Error(message)
  }
}
