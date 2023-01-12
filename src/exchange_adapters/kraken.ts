import { Exchange } from '../utils'
import { BaseExchangeAdapter, ExchangeAdapter, ExchangeDataType, Ticker, Trade } from './base'

export class KrakenAdapter extends BaseExchangeAdapter implements ExchangeAdapter {
         baseApiUrl = 'https://api.kraken.com'
         readonly _exchangeName = Exchange.KRAKEN

         private static readonly tokenSymbolMap = KrakenAdapter.standardTokenSymbolMap

         // Krakens's GTS CA 1P5 fingerprint.
         readonly _certFingerprint256 =
           '97:D4:20:03:E1:32:55:29:46:09:7F:20:EF:95:5F:5B:1C:D5:70:AA:43:72:D7:80:03:3A:65:EF:BE:69:75:8D'

         protected generatePairSymbol(): string {
           const base = KrakenAdapter.tokenSymbolMap.get(this.config.baseCurrency)
           const quote = KrakenAdapter.tokenSymbolMap.get(this.config.quoteCurrency)
           return `${base}${quote}`
         }

         async fetchTicker(): Promise<Ticker> {
           const json = await this.fetchFromApi(
             ExchangeDataType.TICKER,
             `0/public/Ticker?pair=${this.pairSymbol}`
           )
           return this.parseTicker(json)
         }

         async fetchTrades(): Promise<Trade[]> {
           // Trade data is not needed by oracle but is required by the parent class.
           // This function along with all other functions that are not needed by the oracle will
           // be removed in a future PR. 
           // -- @bayological ;) --
           return []
         }

         /**
          * @param json a json object representing the ticker from Kraken's API
          * Expected format can be seen in the public docs": https://docs.kraken.com/rest/#tag/Market-Data/operation/getTickerInformation
          *
          */
         parseTicker(json: any): Ticker {  
          const data = json.result[Object.keys(json.result)[0]] 
          
          const baseVolume = this.safeBigNumberParse(data.v[1])!
          const lastPrice = this.safeBigNumberParse(data.p[1])! 
          
          const quoteVolume = baseVolume?.multipliedBy(lastPrice) 

          const ticker = {
            ...this.priceObjectMetadata,
            ask: this.safeBigNumberParse(data.a[0])!,
            baseVolume: baseVolume,
            bid: this.safeBigNumberParse(data.b[0])!,
            lastPrice: lastPrice,
            low: this.safeBigNumberParse(data.l[1]),
            quoteVolume: quoteVolume!,
            timestamp: 0, // Timestamp is not provided by Kraken and is not used by the oracle
          }
          this.verifyTicker(ticker)
          return ticker
         }

         /**
          * Checks status of orderbook
          * https://api.kraken.com/0/public/SystemStatus"
          *
          *  {
          *    "error": [],
          *    "result": {
          *      "status": "string ("online"|"maintenance"|"cancel_only"|"post_only")",
          *      "timestamp": "timestamp"
          *    }
          *  }
          *
          * @returns bool
          */
         async isOrderbookLive(): Promise<boolean> {
           const response = await this.fetchFromApi(
             ExchangeDataType.ORDERBOOK_STATUS,
             `0/public/SystemStatus`
           )
           return response.result.status === 'online'
         }
       }
