import { ISSLFingerprintService } from "../../src/services/SSLFingerprintService";

export class MockSSLFingerprintService implements ISSLFingerprintService {
  public mapping = new Map<string, string>();

  getFingerprint(identifier: string): string {
    return this.mapping.get(identifier) || "mock-fingerprint";
  }
}
