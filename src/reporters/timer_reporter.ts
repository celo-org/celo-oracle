import BigNumber from 'bignumber.js'
import { Context, ReportTrigger } from '../metric_collector'
import { doAsyncFnWithErrorContext, msToNextAction, ReportStrategy, secondsToMs } from '../utils'
import { BaseReporter, BaseReporterConfig } from './base'

export interface TimerReporterConfig extends BaseReporterConfig {
  /**
   * The frequency (in milliseconds) at which to check for expired reports, and
   * remove them if any exist.
   */
  removeExpiredFrequency: number
  /**
   * The number of milliseconds to offset from the base frequency
   *
   * Overrides the default behavior of calculating the offset based on this
   * oracle's position in the on-chain whitelist:
   *  removeExpiredFrequencyMs * oracleAccountIndexInWhitelist / totalNumberOfOracles
   */
  removeExpiredOffsetOverride?: number
  /**
   * Number of milliseconds between reports of the current price being sent
   * to chain.
   *
   * Overrides the default behavior of deriving this frequency from on-chain info:
   *   equal to updateFrequency in the Exchange contract
   */
  reportFrequencyOverride?: number
  /**
   * The purpose of the report offset is to space out oracle reports so they don't
   * all try to report simultaneously. To accomplish this, every oracle reporting
   * on this token should have a different offset (assuming they're all running at
   * the same frequency).
   *
   * The result of an offset is best described by example:
   *   if reportFrequencyMs = 300000 (5 minutes) and reportOffsetMs = 0,
   *   reports will happen at times *:00, *:05, *:10, etc...
   *
   *   if reportOffsetMs = 60000 (1 minute),
   *   reports will happen at times *:01, *:06, *:11, etc...
   *
   * Overrides the default behavior of calculating the offset based on this
   * oracle's position in the on-chain whitelist:
   *   reportFrequencyMs * oracleAccountIndexInWhitelist / totalNumberOfOracles
   */
  reportOffsetOverride?: number
}

/**
 * The TimerReporter sends report and expiry transactions according to a timer.
 */
export class TimerReporter extends BaseReporter {
  _reportStrategy = ReportStrategy.TIMER_BASED

  readonly config: TimerReporterConfig

  private reportTimerId: NodeJS.Timeout | undefined
  private reportRemovalTimerId: NodeJS.Timeout | undefined

  private _reportOffsetMs: number | undefined
  private _reportFrequencyMs: number | undefined
  private _removeExpiredOffsetMs: number | undefined

  /**
   * @param config Configuration for the TimerReporter instance
   */
  constructor(config: TimerReporterConfig) {
    super(config)
    this.config = config
  }

  /**
   * Verify that the account is whitelisted, and set frequencies and offsets
   * based on the situation on-chain
   */
  async init() {
    await super.init()
    await this.setReportFrequencies()
    await this.setOffsets()
    this.initialized = true
  }

  start(): void {
    super.start()

    if (this.reportTimerId) {
      this.logger.warn('Reporter timer is already set up')
    } else {
      this.setupNextReport()
      this.logger.info('Started reporter timer')
    }

    if (this.reportRemovalTimerId) {
      this.logger.warn('Expired report removal timer is already set up')
    } else {
      this.setupNextExpiredReportRemoval()
      this.logger.info('Started expired report removal timer')
    }
  }

  setupNextReport(): void {
    this.reportTimerId = setTimeout(async () => {
      this.setupNextReport()
      await doAsyncFnWithErrorContext({
        fn: this.doReport.bind(this),
        context: Context.REPORT,
        logger: this.logger,
        logMsg: 'Error reporting',
        metricCollector: this.config.metricCollector,
        swallowError: true,
      })
    }, this.msToNextReport)
  }

  setupNextExpiredReportRemoval(): void {
    this.reportRemovalTimerId = setTimeout(async () => {
      this.setupNextExpiredReportRemoval()
      await doAsyncFnWithErrorContext({
        fn: this.expire.bind(this),
        context: Context.EXPIRY,
        logger: this.logger,
        logMsg: 'Error expiring report',
        metricCollector: this.config.metricCollector,
        swallowError: true,
      })
    }, this.msToNextRemoveExpired)
  }

  async doReport(): Promise<void> {
    return this.report(await this.priceToReport(), ReportTrigger.TIMER)
  }

  stop(): void {
    if (this.reportTimerId) {
      clearTimeout(this.reportTimerId)
      this.reportTimerId = undefined
      this.logger.info('Stopped reporter timer')
    } else {
      this.logger.warn('Cannot stop reporter timer, it is not running')
    }

    if (this.reportRemovalTimerId) {
      clearTimeout(this.reportRemovalTimerId)
      this.reportRemovalTimerId = undefined
      this.logger.info('Stopped expired report removal timer')
    } else {
      this.logger.warn('Cannot stop expired report removal timer, it is not running')
    }
  }

  /**
   * Working off the assumption that each oracle should report once preceeding
   * each bucket update, set the frequency of reporting equal to the update
   * frequency that is set on-chain.
   */
  private async setReportFrequencies(): Promise<void> {
    if (this.config.reportFrequencyOverride) {
      this._reportFrequencyMs = this.config.reportFrequencyOverride
    } else {
      const exchange = await this.config.kit.contracts.getExchange()
      const bucketUpdateSeconds = await exchange.updateFrequency()
      this._reportFrequencyMs = secondsToMs(bucketUpdateSeconds.toNumber())
    }
  }

  /**
   * Sets the offsets for reporting and removing expired reports based on this
   * account's position in the whitelist, the total number of oracles, and assuming
   * that reports should be spaced evenly over the time between bucket updates.
   */
  private async setOffsets(): Promise<void> {
    const { reportOffsetOverride, removeExpiredOffsetOverride } = this.config

    let offsetScale: BigNumber
    if (reportOffsetOverride === undefined || removeExpiredOffsetOverride === undefined) {
      // _oracleIndex and _totalOracleCount are set in the super.init() call
      offsetScale = new BigNumber(this.oracleIndex!).div(this.totalOracleCount!)
    }
    this._reportOffsetMs =
      reportOffsetOverride !== undefined
        ? reportOffsetOverride
        : offsetScale!.times(this.reportFrequencyMs).decimalPlaces(0).toNumber()

    this._removeExpiredOffsetMs =
      removeExpiredOffsetOverride !== undefined
        ? removeExpiredOffsetOverride
        : offsetScale!.times(this.removeExpiredFrequencyMs).decimalPlaces(0).toNumber()
  }

  /**
   * This calculates the milliseconds until the next time a report should be made,
   * based on the current time, as defined by Date.now(), the reportingFrequency,
   * and the reportTimeOffset.
   */
  get msToNextReport(): number {
    return msToNextAction(this.reportFrequencyMs, this.reportOffsetMs)
  }

  /**
   * Calculates the milliseconds until the next time to remove expired reports,
   * based on the current time defined by Date.now(), the removeExpiredFrequencyMs,
   * and the removeExpiredOffsetMs.
   */
  get msToNextRemoveExpired(): number {
    return msToNextAction(this.removeExpiredFrequencyMs, this.removeExpiredOffsetMs)
  }

  get reportFrequencyMs(): number {
    return this._reportFrequencyMs!
  }

  get reportOffsetMs(): number {
    return this._reportOffsetMs!
  }

  get removeExpiredFrequencyMs(): number {
    return this.config.removeExpiredFrequency
  }

  get removeExpiredOffsetMs(): number {
    return this._removeExpiredOffsetMs!
  }
}
