import localCertificates from './exchange_adapters/certificates.json'
import { Exchange } from './utils'
import Logger from 'bunyan'

export class CertificateManager {
  private readonly REFRESH_INTERVAL_IN_SECONDS: number = 60 * 10 // 10 minutes
  private certificates: Map<Exchange, string>
  private lastUpdated: number
  private fetchUrl: string
  private logger: Logger

  constructor(fetchUrl: string, logger: Logger) {
    this.fetchUrl = fetchUrl
    this.logger = logger.child({ context: 'certificate_manager' })

    this.certificates = new Map<Exchange, string>()
    this.setCertificates(localCertificates)
    this.lastUpdated = Date.now()
  }

  public get(exchange: Exchange): string {
    return this.certificates.get(exchange)!
  }

  public async refreshIfOutdated(): Promise<void> {
    const sinceLastRefresh = (Date.now() - this.lastUpdated) / 1000
    if (sinceLastRefresh < this.REFRESH_INTERVAL_IN_SECONDS) {
      return
    }

    try {
      this.logger.info('Attempting to refresh certificates')
      const response = await fetch(this.fetchUrl)
      if (response.ok) {
        const data = await response.json()
        this.setCertificates(data)
        this.lastUpdated = Date.now()

        this.logger.info(`Certificates successfully updated`)
      } else {
        this.logger.error(`Error while fetching certificates: ${response.statusText}`)
      }
    } catch (error) {
      this.logger.error(`Error while refreshing certificates: ${error}`)
    }
  }

  private setCertificates(certs: Record<Exchange, string>): void {
    for (const [exchange, fingerprint] of Object.entries(certs)) {
      this.certificates.set(exchange as Exchange, fingerprint)
    }
  }
}
