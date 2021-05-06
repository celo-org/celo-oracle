import BigNumber from 'bignumber.js'
import { checkIndividualTickerData } from '../src/aggregator_functions'
import { testTickerArray } from './data_aggregator_testdata_utils'

describe('checkIndividualTickerData', () => {
  const maxPercentageBidAskSpread = new BigNumber(0.1)

  it('tickers with zero ask are removed', () => {
    expect(checkIndividualTickerData(testTickerArray[3], maxPercentageBidAskSpread)).toStrictEqual(
      testTickerArray[3].slice(1)
    )
  })

  it('all tickers with zero ask throws', () => {
    expect(() => checkIndividualTickerData(testTickerArray[15], maxPercentageBidAskSpread)).toThrow(
      `No valid tickers available`
    )
  })

  it('ticker with negative bids are removed', () => {
    expect(checkIndividualTickerData(testTickerArray[4], maxPercentageBidAskSpread)).toStrictEqual(
      testTickerArray[4].slice(0, 2)
    )
  })

  it('all tickers with negative volume throws', () => {
    expect(() => checkIndividualTickerData(testTickerArray[14], maxPercentageBidAskSpread)).toThrow(
      `No valid tickers available`
    )
  })

  it('tickers with ask < bid are removed', () => {
    expect(checkIndividualTickerData(testTickerArray[6], maxPercentageBidAskSpread)).toStrictEqual(
      testTickerArray[6].slice(1)
    )
  })

  it('tickers with a too large bid-ask spread are removed', () => {
    expect(checkIndividualTickerData(testTickerArray[7], maxPercentageBidAskSpread)).toStrictEqual(
      testTickerArray[7].slice(1)
    )
  })
})
