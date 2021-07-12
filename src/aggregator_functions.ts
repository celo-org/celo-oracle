import BigNumber from 'bignumber.js'
import Logger from 'bunyan'
import { DataAggregatorConfig } from './data_aggregator'
import { Ticker, Trade } from './exchange_adapters/base'
import { doFnWithErrorContext } from './utils'
import { MetricCollector } from './metric_collector'
import { WeightedPrice } from './price_source'

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

export function weightedMeanPrice(prices: WeightedPrice[]): BigNumber {
  const baseVolumes = prices.map((price: WeightedPrice) => price.weight)
  const mids = prices.map((price: WeightedPrice) => price.price)
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
 * Checks to be performed for a ticker.
 */
export function individualTickerChecks(tickerData: Ticker, maxPercentageBidAskSpread: BigNumber) {
  // types
  assert(
    typeof tickerData.timestamp === 'number',
    `${tickerData.source}: timestamp is ${tickerData.timestamp} and not of type number`
  )
  assert(
    BigNumber.isBigNumber(tickerData.ask),
    `${tickerData.source}: ask is ${tickerData.ask} and not of type BigNumber`
  )
  assert(
    BigNumber.isBigNumber(tickerData.bid),
    `${tickerData.source}: bid is ${tickerData.bid} and not of type BigNumber`
  )
  assert(
    BigNumber.isBigNumber(tickerData.baseVolume),
    `${tickerData.source}: baseVolume is ${tickerData.baseVolume} and not of type BigNumber`
  )

  // Check percentage bid-ask spread smaller than maxPercentageBidAskSpread.
  const percentageBidAskSpread = tickerData.ask.minus(tickerData.bid).div(tickerData.ask)
  assert(
    percentageBidAskSpread.isLessThanOrEqualTo(maxPercentageBidAskSpread),
    `${tickerData.source}: percentage bid-ask spread (${percentageBidAskSpread}) larger than maxPercentageBidAskSpread (${maxPercentageBidAskSpread})`
  )
  // values are greater than zero
  assert(
    tickerData.ask.isGreaterThan(0),
    `${tickerData.source}: ask (${tickerData.ask}) not positive`
  )
  assert(
    tickerData.bid.isGreaterThan(0),
    `${tickerData.source}: bid (${tickerData.bid}) not positive`
  )
  // ask bigger equal bid
  assert(
    tickerData.ask.isGreaterThanOrEqualTo(tickerData.bid),
    `${tickerData.source}: bid (${tickerData.bid}) larger than ask (${tickerData.ask})`
  )
  // Check that there is some volume on the exchange
  assert(
    tickerData.baseVolume.isGreaterThan(0),
    `${tickerData.source}: volume (${tickerData.baseVolume}) not positive`
  )
  // TODO: Check timestamp not older than X (X as config parameter) seconds
}

export function checkIndividualTickerData(
  tickerData: Ticker[],
  maxPercentageBidAskSpread: BigNumber,
  metricCollector?: MetricCollector,
  logger?: Logger
): Ticker[] {
  const validTickerData: Ticker[] = []

  for (const thisTickerData of tickerData) {
    // 1. Non-recoverable errors (should lead to the client not reporting)
    // Ignore individual ticker if any of these checks fail
    const checkRecoverableErrors = () => {
      individualTickerChecks(thisTickerData, maxPercentageBidAskSpread)
      // keep current ticker if all checks passed
      validTickerData.push(thisTickerData)
    }

    doFnWithErrorContext({
      fn: checkRecoverableErrors,
      context: thisTickerData.source,
      metricCollector,
      logger,
      logMsg: 'Recoverable error in individual ticker check',
      swallowError: true,
    })
  }
  assert(validTickerData.length > 0, `No valid tickers available`)
  return validTickerData
}

/**
 * checks to be performed across prices
 */
export function crossCheckPriceData(
  tickerData: WeightedPrice[],
  config: DataAggregatorConfig
): WeightedPrice[] {
  // 1. Prices should not deviate more than maxPercentageDeviation.
  const prices = tickerData.map((price: WeightedPrice) => price.price)
  const maxNormalizedAbsMeanDev = maxPercentageDeviaton(prices)
  assert(
    maxNormalizedAbsMeanDev.isLessThanOrEqualTo(config.maxPercentageDeviation),
    `Max price cross-sectional deviation too large (${maxNormalizedAbsMeanDev} >= ${config.maxPercentageDeviation} )`
  )

  // 2. No source should make up more than maxSourceWeightShare
  const volumes = tickerData.map((price: WeightedPrice) => price.weight)
  const volumesSum = volumes.reduce(
    (sum: BigNumber, el: BigNumber) => sum.plus(el),
    new BigNumber(0)
  )
  const exchangeVolumeShares = volumes.map((el: BigNumber) => el.div(volumesSum))
  const largestExchangeVolumeShare = BigNumber.max.apply(null, exchangeVolumeShares)
  assert(
    largestExchangeVolumeShare.isLessThanOrEqualTo(config.maxSourceWeightShare),
    `The weight share of one source is too large (${largestExchangeVolumeShare} > ${config.maxSourceWeightShare})`
  )

  // 3. The sum of all weights should be greater than the min threshold
  const validTickerAggregateVolume: BigNumber = tickerData.reduce(
    (sum, el) => sum.plus(el.weight),
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
