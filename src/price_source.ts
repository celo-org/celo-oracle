import BigNumber from 'bignumber.js'

export type WeightedPrice = {
  price: BigNumber
  weight: BigNumber
}

export interface PriceSource {
  name(): string
  fetchWeightedPrice(): Promise<WeightedPrice>
}
