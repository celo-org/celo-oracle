import { Exchange } from '../utils'
import { ExchangeAdapter } from './base'
import { BinanceAdapter } from './binance'

export class BinanceUSAdapter extends BinanceAdapter implements ExchangeAdapter {
  baseApiUrl = 'https://api.binance.us/api/v3'
  readonly _exchangeName = Exchange.BINANCEUS
  // *.binance.us - validity not after: 11/09/2024, 01:59:59 CEST
  _certFingerprint256 =
    '45:48:18:31:2F:B1:60:5F:70:EA:FA:B8:67:B1:A5:5A:05:96:BE:74:66:C7:60:E4:F7:AF:D3:3F:0A:2E:D9:32'
}
