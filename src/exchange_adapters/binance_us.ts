import { Exchange } from '../utils'
import { ExchangeAdapter } from './base'
import { BinanceAdapter } from './binance'

export class BinanceUSAdapter extends BinanceAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.binance.us/api/v3'
  readonly _exchangeName = Exchange.BINANCEUS
  // *.binance.com - validity not after: 17/02/2024, 00:59:59 CET
  readonly _certFingerprint256 =
    '93:07:DE:DD:AF:3A:78:77:1D:B1:B7:68:3E:9F:18:8E:28:83:AE:A1:77:58:87:D4:5C:F6:F9:C8:71:1A:72:49'
}
