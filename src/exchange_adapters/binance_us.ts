import { Exchange } from '../utils'
import { ExchangeAdapter } from './base'
import { BinanceAdapter } from './binance'

export class BinanceUSAdapter extends BinanceAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.binance.us/api/v3'
  readonly _exchangeName = Exchange.BINANCEUS
  // GeoTrust TLS RSA CA G1 - validity not after: 02/11/2027, 09:23:37 GMT-3
  _certFingerprint256 =
    '21:F8:8F:E6:6E:A2:D5:4E:39:E0:47:18:56:1B:D3:BC:60:08:EB:22:DA:E9:2A:99:67:B8:97:76:3A:63:6B:3D'
}
