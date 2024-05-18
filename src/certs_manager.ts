import localCertificates from './exchange_adapters/certificates.json';
import { Exchange } from './utils';
import Logger from 'bunyan'

export class CertificateManager {
    private certificates: Map<Exchange, string>;
    private lastUpdated: number;
    private refreshIntervalInSeconds: number;
    private fetchUrl: string;
    private logger: Logger;

    constructor(logger: Logger, fetchUrl: string, refreshIntervalInSeconds: number = 60 * 5) {
        this.logger = logger.child({context: 'certificates_manager'});
        this.fetchUrl = fetchUrl;
        this.refreshIntervalInSeconds = refreshIntervalInSeconds;


        this.certificates = new Map<Exchange, string>();
        this.setCertificates(localCertificates);
        this.lastUpdated = Date.now();
    }

    public get(exchange: Exchange): string {
        return this.certificates.get(exchange)!;
    }

    public async refreshIfOutdated(): Promise<void> {
      const sinceLastRefresh = (Date.now() - this.lastUpdated) / 1000;
      if (sinceLastRefresh < this.refreshIntervalInSeconds) {
        return
      }

      try {
        this.logger.info('Attempting to refresh certificates')
        const response = await fetch(this.fetchUrl);
        if (response.ok) {
            const data = await response.json();
            this.setCertificates(data);
            this.lastUpdated = Date.now();

            this.logger.info(`Certificates successfully updated`)
        } else {
            console.error(`Failed to fetch certificates: ${response.statusText}`);
        }
      } catch (error) {
          console.error(`Error fetching certificates: ${error}`);
      }
    }

    private setCertificates(certs: Record<Exchange, string>): void {
      for (const [exchange, fingerprint] of Object.entries(certs)) {
        this.certificates.set(exchange as Exchange, fingerprint)
      }
    }
}