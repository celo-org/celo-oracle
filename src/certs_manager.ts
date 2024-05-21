import { Exchange } from './utils'
import localCertificates from './exchange_adapters/certificates.json'

import Logger from 'bunyan'

export class CertificateManager {
  private jsonUrl: string
  private refreshIntervalInMs: number
  private logger: Logger

  private certificates: Map<Exchange, string>
  private lastUpdated: number

  constructor(jsonUrl: string, refreshIntervalInMs: number, logger: Logger) {
    this.jsonUrl = jsonUrl
    this.refreshIntervalInMs = refreshIntervalInMs
    this.logger = logger.child({ context: 'certificate_manager' })

    this.certificates = new Map<Exchange, string>()
    this.setCertificates(localCertificates)
    this.lastUpdated = Date.now()
  }

  public get(exchange: Exchange): string {
    return this.certificates.get(exchange)!
  }

  public async refreshIfOutdated(): Promise<void> {
    if (Date.now() - this.lastUpdated < this.refreshIntervalInMs) {
      return
    }

    try {
      this.logger.info('Attempting to refresh certificates')
      const response = await fetch(this.jsonUrl)
      if (response.ok) {
        const data = await response.json()
        this.setCertificates(data)
        this.lastUpdated = Date.now()

        this.logger.info(`Certificates successfully updated`)
      } else {
        this.logger.error(`Error during fetch call (${response.status}): ${response.statusText}`)
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
