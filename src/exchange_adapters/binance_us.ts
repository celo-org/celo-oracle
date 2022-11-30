import { Exchange } from '../utils'
import { ExchangeAdapter } from './base'
import { BinanceAdapter } from './binance'

export class BinanceUSAdapter extends BinanceAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.binance.us/api/v3'
  readonly _exchangeName = Exchange.BINANCEUS
  // GeoTrust RSA CA 2018
  readonly _certFingerprint256 =
    '8C:C3:4E:11:C1:67:04:58:24:AD:E6:1C:49:07:A6:44:0E:DB:2C:43:98:E9:9C:11:2A:85:9D:66:1F:8E:2B:C7'
}