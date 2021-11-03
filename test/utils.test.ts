import { CeloContract, ContractKit } from '@celo/contractkit'
import BigNumber from 'bignumber.js'
import Logger from 'bunyan'
import Web3 from 'web3'
import { baseLogger } from '../src/default_config'
import { Context, MetricCollector } from '../src/metric_collector'
import {
  allSettled,
  doAsyncFnWithErrorContext,
  doFnWithErrorContext,
  ErrorFnWrapper,
  ErrorWrapper,
  isOutsideTolerance,
  isWithinTolerance,
  minutesToMs,
  msToNextAction,
  onError,
  OracleCurrencyPair,
  reportTargetForCurrencyPair,
  requireVariables,
  tryExponentialBackoff,
} from '../src/utils'

jest.mock('bunyan')
jest.mock('../src/metric_collector')
jest.mock('@celo/contractkit')
jest.mock('@celo/contractkit/lib/address-registry')

jest.setTimeout(10 * 1000)

describe('utils', () => {
  describe('#reportTargetForCurrencyPair', () => {
    // @ts-ignore because it's mocked
    let kit: ContractKit
    let registryLookup: jest.SpyInstance

    beforeEach(() => {
      jest.clearAllMocks()
      kit = ({ registry: { addressFor: jest.fn() } } as unknown) as ContractKit
      registryLookup = jest.spyOn(kit.registry, 'addressFor')
    })

    describe('with CELOUSD', () => {
      const pair = OracleCurrencyPair.CELOUSD
      it('is CeloContract.StableToken', async () => {
        expect(await reportTargetForCurrencyPair(pair, kit)).toEqual(CeloContract.StableToken)
        expect(registryLookup).not.toHaveBeenCalled()
      })
    })

    describe('with CELOEUR', () => {
      const pair = OracleCurrencyPair.CELOEUR
      it('looks up the registry', async () => {
        const addr = Web3.utils.randomHex(20)
        registryLookup.mockReturnValue(addr)
        expect(await reportTargetForCurrencyPair(pair, kit)).toEqual(addr)
        expect(registryLookup).toHaveBeenCalledWith('StableTokenEUR')
      })
    })

    describe('with CELOBRL', () => {
      const pair = OracleCurrencyPair.CELOBRL
      it('looks up the registry', async () => {
        const addr = Web3.utils.randomHex(20)
        registryLookup.mockReturnValue(addr)
        expect(await reportTargetForCurrencyPair(pair, kit)).toEqual(addr)
        expect(registryLookup).toHaveBeenCalledWith('StableTokenBRL')
      })
    })

    describe('with CELOBTC', () => {
      const pair = OracleCurrencyPair.CELOBTC
      it('derives the identifier', async () => {
        expect(await reportTargetForCurrencyPair(pair, kit)).toEqual(
          '0x018CAad1ED69eeDD40ed8309A81Eb78c937563a6'
        )
        expect(registryLookup).not.toHaveBeenCalled()
      })
    })
  })

  describe('tryExponentialBackoff', () => {
    const defaultMaxRetries = 10
    const defaultBaseBackoffMs = 1
    const defaultMaxBackoffMs = 2
    let onBackoffSpy: jest.Mock<any, any>

    beforeEach(() => {
      onBackoffSpy = jest.fn(() => {
        jest.advanceTimersToNextTimer(1)
      })
    })

    it('resolves with the resolved value of the provided fn', async () => {
      const result = await tryExponentialBackoff(
        () => Promise.resolve('foo'),
        defaultMaxRetries,
        defaultBaseBackoffMs,
        defaultMaxBackoffMs,
        onBackoffSpy
      )
      expect(result).toEqual('foo')
    })

    it('does not retry if the first try is successful', async () => {
      await tryExponentialBackoff(
        () => Promise.resolve('foo'),
        defaultMaxRetries,
        defaultBaseBackoffMs,
        defaultMaxBackoffMs,
        onBackoffSpy
      )
      expect(onBackoffSpy).not.toBeCalled()
    })

    it('retries until the first successful try', async () => {
      const retryCountUntilSuccess = 3
      let i = 1
      await tryExponentialBackoff(
        async () => {
          if (i === retryCountUntilSuccess) {
            return Promise.resolve('foo')
          }
          return Promise.reject()
        },
        defaultMaxRetries,
        defaultBaseBackoffMs,
        defaultMaxBackoffMs,
        (e: Error, backoffMs: number) => {
          i++
          onBackoffSpy(e, backoffMs)
        }
      )
      expect(onBackoffSpy).toBeCalledTimes(retryCountUntilSuccess - 1)
    })

    it('throws if maxTries is not >= 1', async () => {
      expect(async () =>
        tryExponentialBackoff(
          () => Promise.resolve('foo'),
          0,
          defaultBaseBackoffMs,
          defaultMaxBackoffMs,
          onBackoffSpy
        )
      ).rejects.toThrow(`maxTries must be >= 1`)
    })
  })

  describe('requireVariables()', () => {
    it('throws if one of the variables is undefined', () => {
      const foo = 'foo'
      const bar = 5
      const baz = undefined
      expect(() =>
        requireVariables({
          foo,
          bar,
          baz,
        })
      ).toThrow(`baz not defined`)
    })

    it('throws if more than one of the variables is undefined', () => {
      const foo = undefined
      const bar = 5
      const baz = undefined
      expect(() =>
        requireVariables({
          foo,
          bar,
          baz,
        })
      ).toThrow(`foo, baz not defined`)
    })

    it('does nothing if all variables are defined', () => {
      const foo = 'foo'
      const bar = 5
      const baz = { test: 'value' }
      expect(() =>
        requireVariables({
          foo,
          bar,
          baz,
        })
      ).not.toThrow()
    })
  })

  describe('msToNextAction', () => {
    let mockCurrentTime: number
    const mockCurrentTimeFn = jest.fn(() => mockCurrentTime)

    const frequencyMs = minutesToMs(5)
    let offsetMs: number

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockImplementation(mockCurrentTimeFn)
    })

    describe('when the offset is 0', () => {
      beforeAll(() => {
        offsetMs = 0
      })

      it('is frequencyMs when current time is 0', () => {
        mockCurrentTime = 0
        expect(msToNextAction(frequencyMs, offsetMs, 0)).toEqual(frequencyMs)
      })
      it('is frequencyMs - currentTime when currentTime < frequencyMs', () => {
        mockCurrentTime = 1000
        expect(msToNextAction(frequencyMs, offsetMs, 0)).toEqual(frequencyMs - mockCurrentTime)
      })
      it('is frequencyMs when current time is equal to frequencyMs', () => {
        mockCurrentTime = frequencyMs
        expect(msToNextAction(frequencyMs, offsetMs, 0)).toEqual(frequencyMs)
      })
      it('is frequencyMs when current time is a multiple of $reportFreqency', () => {
        mockCurrentTime = frequencyMs * 5
        expect(msToNextAction(frequencyMs, offsetMs, 0)).toEqual(frequencyMs)
      })
      it('gives the ms until the second action if the next action is less than minimumMs away', () => {
        mockCurrentTime = frequencyMs - 49
        expect(msToNextAction(frequencyMs, offsetMs, 50)).toEqual(
          frequencyMs + (frequencyMs - mockCurrentTime)
        )
      })
      it('gives the ms until the next action if the next action is more than minimumMs away', () => {
        mockCurrentTime = frequencyMs - 60
        expect(msToNextAction(frequencyMs, offsetMs, 50)).toEqual(frequencyMs - mockCurrentTime)
      })
    })

    describe('when the offset is non-zero', () => {
      beforeAll(() => {
        offsetMs = 2000
      })

      it('is offsetMs when current time is 0', () => {
        mockCurrentTime = 0
        expect(msToNextAction(frequencyMs, offsetMs, 0)).toEqual(offsetMs)
      })
      it('is frequencyMs when current time is equal to offsetMs', () => {
        mockCurrentTime = offsetMs
        expect(msToNextAction(frequencyMs, offsetMs, 0)).toEqual(frequencyMs)
      })
      it('is frequencyMs when current time is frequencyMs + offsetMs', () => {
        mockCurrentTime = frequencyMs + offsetMs
        expect(msToNextAction(frequencyMs, offsetMs, 0)).toEqual(frequencyMs)
      })
      it('is (offsetMs - current time) when current time is less than offsetMs', () => {
        mockCurrentTime = 1500
        expect(msToNextAction(frequencyMs, offsetMs, 0)).toEqual(offsetMs - mockCurrentTime)
      })
      it('is (frequency + offset - current) when (current % frequency) > offset', () => {
        mockCurrentTime = 3456
        expect(msToNextAction(frequencyMs, offsetMs, 0)).toEqual(
          frequencyMs + offsetMs - mockCurrentTime
        )
      })
      it('gives the ms until the second action if the next action is less than minimumMs away', () => {
        mockCurrentTime = 1951
        expect(msToNextAction(frequencyMs, offsetMs, 50)).toEqual(
          frequencyMs + offsetMs - mockCurrentTime
        )
      })
      it('gives the ms until the next action if the next action is more than minimumMs away', () => {
        mockCurrentTime = 1940
        expect(msToNextAction(frequencyMs, offsetMs, 50)).toEqual(offsetMs - mockCurrentTime)
      })
    })
  })

  describe('isWithinTolerance()', () => {
    let referenceValue: BigNumber
    let toleranceRatio: BigNumber
    beforeEach(() => {
      referenceValue = new BigNumber(100)
      toleranceRatio = new BigNumber(0.1)
    })

    it('returns true if the value is greater than the referenceValue and is inclusively within the tolerance', () => {
      expect(isWithinTolerance(referenceValue, new BigNumber(105), toleranceRatio)).toBe(true)
      expect(isWithinTolerance(referenceValue, new BigNumber(110), toleranceRatio)).toBe(true)
    })

    it('returns true if the value is less than the referenceValue and is inclusively within the tolerance', () => {
      expect(isWithinTolerance(referenceValue, new BigNumber(95), toleranceRatio)).toBe(true)
      expect(isWithinTolerance(referenceValue, new BigNumber(90), toleranceRatio)).toBe(true)
    })

    it('returns false if the value is greater than the referenceValue and is outside the tolerance', () => {
      expect(isWithinTolerance(referenceValue, new BigNumber(110.00001), toleranceRatio)).toBe(
        false
      )
      expect(isWithinTolerance(referenceValue, new BigNumber(111), toleranceRatio)).toBe(false)
      expect(isWithinTolerance(referenceValue, new BigNumber(100000), toleranceRatio)).toBe(false)
    })

    it('returns false if the value is less than the referenceValue and is outside the tolerance', () => {
      expect(isWithinTolerance(referenceValue, new BigNumber(89.9999), toleranceRatio)).toBe(false)
      expect(isWithinTolerance(referenceValue, new BigNumber(89), toleranceRatio)).toBe(false)
      expect(isWithinTolerance(referenceValue, new BigNumber(-1000), toleranceRatio)).toBe(false)
    })
  })

  describe('isOutsideTolerance()', () => {
    let referenceValue: BigNumber
    let toleranceRatio: BigNumber
    beforeEach(() => {
      referenceValue = new BigNumber(100)
      toleranceRatio = new BigNumber(0.1)
    })

    it('returns false if the value is greater than the referenceValue and is inclusively within the tolerance', () => {
      expect(isOutsideTolerance(referenceValue, new BigNumber(105), toleranceRatio)).toBe(false)
      expect(isOutsideTolerance(referenceValue, new BigNumber(110), toleranceRatio)).toBe(false)
    })

    it('returns false if the value is less than the referenceValue and is inclusively within the tolerance', () => {
      expect(isOutsideTolerance(referenceValue, new BigNumber(95), toleranceRatio)).toBe(false)
      expect(isOutsideTolerance(referenceValue, new BigNumber(90), toleranceRatio)).toBe(false)
    })

    it('returns true if the value is greater than the referenceValue and is outside the tolerance', () => {
      expect(isOutsideTolerance(referenceValue, new BigNumber(110.00001), toleranceRatio)).toBe(
        true
      )
      expect(isOutsideTolerance(referenceValue, new BigNumber(111), toleranceRatio)).toBe(true)
      expect(isOutsideTolerance(referenceValue, new BigNumber(100000), toleranceRatio)).toBe(true)
    })

    it('returns true if the value is less than the referenceValue and is outside the tolerance', () => {
      expect(isOutsideTolerance(referenceValue, new BigNumber(89.9999), toleranceRatio)).toBe(true)
      expect(isOutsideTolerance(referenceValue, new BigNumber(89), toleranceRatio)).toBe(true)
      expect(isOutsideTolerance(referenceValue, new BigNumber(-1000), toleranceRatio)).toBe(true)
    })
  })

  describe('allSettled()', () => {
    function doAsync(fn: () => any) {
      setTimeout(fn, 0)
    }
    beforeAll(() => {
      jest.useRealTimers()
    })
    it('waits for all promises if all resolve', async () => {
      let resolveCounter = 0
      await allSettled([
        new Promise((resolve) => {
          doAsync(() => resolve(++resolveCounter))
        }),
        new Promise((resolve) => {
          doAsync(() => resolve(++resolveCounter))
        }),
        new Promise((resolve) => {
          doAsync(() => resolve(++resolveCounter))
        }),
      ])
      expect(resolveCounter).toBe(3)
    })
    it('waits for all promises if some reject', async () => {
      let resolveCounter = 0
      let rejectCounter = 0
      await allSettled([
        new Promise((resolve) => {
          doAsync(() => resolve(++resolveCounter))
        }),
        new Promise((resolve) => {
          doAsync(() => resolve(++resolveCounter))
        }),
        new Promise((_, reject) => {
          doAsync(() => reject(++rejectCounter))
        }),
      ])
      expect(resolveCounter).toBe(2)
      expect(rejectCounter).toBe(1)
    })
    it('waits for all promises if all reject', async () => {
      let rejectCounter = 0
      await allSettled([
        new Promise((_, reject) => {
          doAsync(() => reject(++rejectCounter))
        }),
        new Promise((_, reject) => {
          doAsync(() => reject(++rejectCounter))
        }),
        new Promise((_, reject) => {
          doAsync(() => reject(++rejectCounter))
        }),
      ])
      expect(rejectCounter).toBe(3)
    })
    it('does not wait if allSettled is not awaited', () => {
      let resolveCounter = 0
      allSettled([
        new Promise((resolve) => {
          doAsync(() => resolve(++resolveCounter))
        }),
        new Promise((resolve) => {
          doAsync(() => resolve(++resolveCounter))
        }),
        new Promise((resolve) => {
          doAsync(() => resolve(++resolveCounter))
        }),
      ])
      expect(resolveCounter).toBe(0)
    })
  })

  describe('doFnWithErrorContext', () => {
    let metricCollector: MetricCollector

    beforeEach(() => {
      metricCollector = new MetricCollector(baseLogger)
    })

    it('records the error metric when fn throws, and throws when swallowError is false', async () => {
      const errorFnWrapper: { swallowError: false } & ErrorFnWrapper<any> = {
        fn: jest.fn(() => {
          throw Error('foo')
        }),
        context: Context.REPORT,
        metricCollector,
        swallowError: false,
      }
      expect(() => doFnWithErrorContext(errorFnWrapper)).toThrow('foo')
      expect(errorFnWrapper.fn).toBeCalled()
      expect(metricCollector.error).toBeCalledWith(errorFnWrapper.context)
    })

    it('records the error metric when fn throws, and resolves with undefined when swallowError is true', async () => {
      const errorFnWrapper: { swallowError: true } & ErrorFnWrapper<any> = {
        fn: jest.fn(() => {
          throw Error('foo')
        }),
        context: Context.REPORT,
        metricCollector,
        swallowError: true,
      }
      expect(doFnWithErrorContext(errorFnWrapper)).toBe(undefined)
      expect(errorFnWrapper.fn).toBeCalled()
      expect(metricCollector.error).toBeCalledWith(errorFnWrapper.context)
    })

    it('does not record the error metric when fn does not throw', async () => {
      const errorFnWrapper: { swallowError: false } & ErrorFnWrapper<any> = {
        fn: jest.fn(() => 'foo'),
        context: Context.REPORT,
        swallowError: false,
      }
      expect(doFnWithErrorContext(errorFnWrapper)).toBe('foo')
      expect(errorFnWrapper.fn).toBeCalled()
      expect(metricCollector.error).not.toBeCalled()
    })
  })

  describe('doAsyncFnWithErrorContext', () => {
    let metricCollector: MetricCollector

    beforeEach(() => {
      metricCollector = new MetricCollector(baseLogger)
    })

    it('records the error metric when fn throws, and throws when swallowError is false', async () => {
      const errorFnWrapper: { swallowError: false } & ErrorFnWrapper<Promise<any>> = {
        fn: jest.fn(async () => {
          throw Error('foo')
        }),
        context: Context.REPORT,
        metricCollector,
        swallowError: false,
      }
      await expect(doAsyncFnWithErrorContext(errorFnWrapper)).rejects.toThrow('foo')
      expect(errorFnWrapper.fn).toBeCalled()
      expect(metricCollector.error).toBeCalledWith(errorFnWrapper.context)
    })

    it('records the error metric when fn throws, and resolves with undefined when swallowError is true', async () => {
      const errorFnWrapper: { swallowError: true } & ErrorFnWrapper<Promise<any>> = {
        fn: jest.fn(async () => {
          throw Error('foo')
        }),
        context: Context.REPORT,
        metricCollector,
        swallowError: true,
      }
      await expect(doAsyncFnWithErrorContext(errorFnWrapper)).resolves.toBe(undefined)
      expect(errorFnWrapper.fn).toBeCalled()
      expect(metricCollector.error).toBeCalledWith(errorFnWrapper.context)
    })

    it('does not record the error metric when fn does not throw', async () => {
      const errorFnWrapper: { swallowError: false } & ErrorFnWrapper<Promise<any>> = {
        fn: jest.fn(async () => Promise.resolve('foo')),
        context: Context.REPORT,
        swallowError: false,
      }
      await expect(doAsyncFnWithErrorContext(errorFnWrapper)).resolves.toBe('foo')
      expect(errorFnWrapper.fn).toBeCalled()
      expect(metricCollector.error).not.toBeCalled()
    })
  })

  describe('onError()', () => {
    let metricCollector: MetricCollector

    beforeEach(() => {
      metricCollector = new MetricCollector(baseLogger)
    })

    it('throws if swallowError is false', () => {
      const error = Error('foo')
      const errorFnWrapper: { swallowError: false } & ErrorFnWrapper<Promise<any>> = {
        fn: () => {
          throw error
        },
        context: Context.REPORT,
        metricCollector,
        swallowError: false,
      }
      expect(() => onError(error, errorFnWrapper)).toThrow('foo')
      expect(metricCollector.error).toBeCalledWith(errorFnWrapper.context)
    })

    it('does not throw if swallowError is true', () => {
      const error = Error('foo')
      const errorFnWrapper: { swallowError: true } & ErrorFnWrapper<Promise<any>> = {
        fn: () => {
          throw error
        },
        context: Context.REPORT,
        metricCollector,
        swallowError: true,
      }
      expect(onError(error, errorFnWrapper)).toBe(undefined)
      expect(metricCollector.error).toBeCalledWith(errorFnWrapper.context)
    })

    it('does not throw if swallowError is true', () => {
      const error = Error('foo')
      const errorWrapper: ErrorWrapper = {
        context: Context.REPORT,
        metricCollector,
        swallowError: true,
      }
      expect(onError(error, errorWrapper)).toBe(undefined)
      expect(metricCollector.error).toBeCalledWith(errorWrapper.context)
    })

    it('logs the error if a logger is provided', () => {
      const error = Error('foo')
      const logger = Logger.createLogger({ name: 'test' })
      const errorWrapper: ErrorWrapper = {
        context: Context.REPORT,
        metricCollector,
        logger,
        swallowError: true,
      }
      onError(error, errorWrapper)
      expect(logger.error).toBeCalledWith(
        {
          err: error,
          errorContext: errorWrapper.context,
        },
        'An error occurred'
      )
      expect(metricCollector.error).toBeCalledWith(errorWrapper.context)
    })

    it('logs the error and custom message if provided', () => {
      const error = Error('foo')
      const logger = Logger.createLogger({ name: 'test' })
      const errorWrapper: ErrorWrapper = {
        context: Context.REPORT,
        metricCollector,
        logger,
        logMsg: 'uh oh',
        swallowError: true,
      }
      onError(error, errorWrapper)
      expect(logger.error).toBeCalledWith(
        {
          err: error,
          errorContext: errorWrapper.context,
        },
        errorWrapper.logMsg
      )
      expect(metricCollector.error).toBeCalledWith(errorWrapper.context)
    })

    it('logs the error and a custom object if provided', () => {
      const error = Error('foo')
      const logger = Logger.createLogger({ name: 'test' })
      const errorWrapper: ErrorWrapper = {
        context: Context.REPORT,
        metricCollector,
        logger,
        logMsg: 'uh oh',
        logObj: {
          foo: 'bar',
          bar: 'foo',
        },
        swallowError: true,
      }
      onError(error, errorWrapper)
      expect(logger.error).toBeCalledWith(
        {
          ...errorWrapper.logObj,
          err: error,
          errorContext: errorWrapper.context,
        },
        errorWrapper.logMsg
      )
      expect(metricCollector.error).toBeCalledWith(errorWrapper.context)
    })
  })
})
