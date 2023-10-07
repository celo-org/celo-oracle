import { Exchange } from '../utils'
import { ExchangeAdapter } from './base'
import { BinanceAdapter } from './binance'

export class BinanceUSAdapter extends BinanceAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.binance.us/api/v3'
  readonly _exchangeName = Exchange.BINANCEUS
  // GeoTrust TLS RSA CA G1 - validity not after: 02/11/2027, 09:23:37 GMT-3
  _certFingerprint256 =
    'C0:6E:30:7F:7C:FC:1D:32:FA:72:A4:C0:33:C8:7B:90:01:9A:F2:16:F0:77:5D:64:97:8A:2E:CA:6C:8A:23:0E'
}
