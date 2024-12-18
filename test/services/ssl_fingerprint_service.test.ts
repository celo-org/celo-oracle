import { MetricCollector } from '../../src/metric_collector'
import {
  SSLFingerprintService,
  SSLFingerprintServiceConfig,
  formatFingerprint,
} from '../../src/services/SSLFingerprintService'
import { baseLogger } from '../../src/default_config'
import { Exchange } from '../../src/utils'
import Web3 from 'web3'

jest.mock('../../src/metric_collector')

let service: SSLFingerprintService
const metricCollector = new MetricCollector(baseLogger)
const sslRegistryAddress = '0xD5E9E0E53Ea1925BfBdAEA9525376D780FF8a4C3'
const wsRpcProviderUrl = 'ws://bar.foo'

const MOCK_FINGERPRINTS = Object.values(Exchange).map((_) => Web3.utils.randomHex(32))
const EXCHANGE_TO_FINGERPRINT = Object.fromEntries(
  Object.values(Exchange).map((e, i) => [e, formatFingerprint(MOCK_FINGERPRINTS[i])])
)

describe('SSLFingerprintService', () => {
  beforeEach(async () => {
    const config: SSLFingerprintServiceConfig = {
      wsRpcProviderUrl,
      sslRegistryAddress,
      metricCollector,
      baseLogger,
    }
    service = new SSLFingerprintService(config)
    // await service.init()
  })

  afterEach(() => {
    jest.clearAllMocks()
    service.stop()
  })

  beforeEach(async () => {
    jest.spyOn(service['registry'].methods, 'getFingerprints').mockImplementation(() => ({
      call: () => MOCK_FINGERPRINTS,
    }))
    jest.spyOn(service['registry'].events, 'FingerprintUpdated')
    await service.init()
  })

  describe('#init', () => {
    it('gets current fingerprints', async () => {
      Object.values(Exchange).forEach((e, index) => {
        expect(service.getFingerprint(e)).toBe(formatFingerprint(MOCK_FINGERPRINTS[index]))
      })
    })

    it('sets up an event subscription', async () => {
      expect(service['registry'].events.FingerprintUpdated).toHaveBeenCalledWith(
        {
          fromBlock: 'latest',
        },
        service['updateFingerprint']
      )
    })
  })

  describe('#updateFingerprint', () => {
    beforeAll(() => {
      jest.spyOn(service['logger'], 'error')
      jest.spyOn(service['logger'], 'info')
      jest.spyOn(service['fingerprintMapping'], 'set')
    })

    it('when called with an error, it logs', () => {
      const error = new Error('fail')
      service.updateFingerprint(error, undefined)
      expect(service['logger'].error).toHaveBeenCalledWith(error)
    })

    it('when the event object is invalid, it logs', () => {
      service.updateFingerprint(null, {
        returnValues: {},
      })
      expect(service['logger'].error).toHaveBeenCalledWith(
        `Failed to process FingerprintUpdated event`
      )
      expect(service['logger'].error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `FingerprintUpdated event is invalid or missing returnValues`,
        })
      )
    })

    it('when the identifier is unknown, it logs', () => {
      service.updateFingerprint(null, {
        returnValues: {
          identifier: 'NOT_AN_EXCHANGE',
          fingerprint: '0x0',
        },
      })
      expect(service['logger'].error).toHaveBeenCalledWith(
        `Failed to process FingerprintUpdated event`
      )
      expect(service['logger'].error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Unexpected identifier: NOT_AN_EXCHANGE`,
        })
      )
    })

    it('when the fingerprint is invalid, it logs', () => {
      service.updateFingerprint(null, {
        returnValues: {
          identifier: Exchange.OKX,
          fingerprint: '0x12',
        },
      })
      expect(service['logger'].error).toHaveBeenCalledWith(
        `Failed to process FingerprintUpdated event`
      )
      expect(service['logger'].error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Invalid fingerprint: 0x12`,
        })
      )
    })

    it('when the fingerprint is valid but 0, it logs', () => {
      service.updateFingerprint(null, {
        returnValues: {
          identifier: Exchange.OKX,
          fingerprint: '0x0000000000000000000000000000000000000000000000000000000000000000',
        },
      })
      expect(service['logger'].error).toHaveBeenCalledWith(
        `Failed to process FingerprintUpdated event`
      )
      expect(service['logger'].error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Fingerprint is empty`,
        })
      )
    })

    it('when all is well, it logs and updates the mapping', () => {
      const newFingerprint = Web3.utils.randomHex(32)
      service.updateFingerprint(null, {
        returnValues: {
          identifier: Exchange.OKX,
          fingerprint: newFingerprint,
        },
      })
      const formattedFingerprint = formatFingerprint(newFingerprint)

      expect(service['logger'].info).toHaveBeenCalledWith(
        `Updating ${Exchange.OKX} fingerprint to ${formattedFingerprint}`
      )
      expect(service.getFingerprint(Exchange.OKX)).toBe(formattedFingerprint)
    })
  })

  describe('#getFingerprint', () => {
    it('returns the fingerprint when found', () => {
      const fingerprint = service.getFingerprint(Exchange.BINANCE)
      expect(fingerprint).toBe(EXCHANGE_TO_FINGERPRINT[Exchange.BINANCE])
    })

    it('throws an error when not found, as this should never happen', () => {
      expect(() => service.getFingerprint('NOT_AN_EXCHANGE')).toThrow()
    })
  })
})
