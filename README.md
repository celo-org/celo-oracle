# celo-oracle

## Introduction

Oracles bring off-chain information on-chain, making that information accessible to the Smart Contracts. The Celo Protocol  contains a Smart Contract called "[SortedOracles](https://github.com/celo-org/celo-monorepo/blob/master/packages/protocol/contracts/stability/SortedOracles.sol)". This Smart Contract receives price reports from Oracles, keeps track of the median value of these price reports, and references these price reports against a list of addresses that are permitted to provide price reports.  One significant function of Oracles on Celo is supporting the [stability mechanism](https://docs.celo.org/celo-codebase/protocol/stability/doto). Oracles  provide the price of CELO in the fiat currency to which a stable value asset is linked, such as cUSD (stable value asset) to the fiat currency to which it is linked (US Dollar).

This Oracle application does the off-chain work of determining the current exchange rate of a given currency pair. It does this by aggregating data across multiple exchanges where these currencies are traded, and reporting the results of this processing to the aforementioned SortedOracles contract.

## Configuration

Before running the Oracle, you'll need to configure it. Configuration is done with Environment Variables. See the [Configuration Guide](README-config.md) for the full list of options.

To run using the defaults, the only thing you will need to set up the Oracle is the oracle's identity. This means you must ensure that the Oracle has access to a private key for an address that is allowed to act as an Oracle.

There are two ways to do this:

1. When using an HSM (Azure or AWS)\
This method assumes that you're using an HSM (Hardware Security Module) on Azure or AWS, and have already generated a private key and address in that setup.\
Set the relevant EnvVars:\
`ADDRESS`: the address associated with HSM private key\
`AZURE_KEY_VAULT_NAME`: if using Azure, the name of the Azure Key Vault. Omit if using AWS.
1. Reading a private key from a file (this is not recommended in production)\
Make sure the private key is accessible to the running oracle application, and set the following EnvVar:\
`PRIVATE_KEY_PATH`: path to the file

## Running

Dependencies must be installed:

```shell
yarn
```

Before running or testing, the TypeScript must be re-built:

```shell
yarn build
```

[Bunyan](https://github.com/trentm/node-bunyan) is used for structured logging. To start the oracle with JSON formatted logs (how it should be run in production), run:

```shell
yarn start
```

For a friendlier developer experience, the bunayn CLI can be used to output prettier logs:

```shell
yarn start | npx bunyan
```

## Deployment

Docker images are pushed to a public container [registry](https://console.cloud.google.com/artifacts/docker/celo-testnet-production/us-west1/celo-oracle/celo-oracle) upon every release. The latest price sources and data aggregation parameters can be found as helm charts in the celo [monorepo](https://github.com/celo-org/celo-monorepo/tree/master/packages/helm-charts/oracle).

The recommended configuration at the moment is [76f02ea](https://github.com/celo-org/celo-monorepo/tree/76f02ea65b9284f3d0e47e256dece82dc0747a6e/packages/helm-charts/oracle).


## Component Overview

<!-- TODO: Add architecture diagram here -->

### **ExchangeAdapters**

Each ExchangeAdapter is responsible for querying information from a specific exchange's API, and transforming the response into the standard format expected by ExchangePriceSource.

Currently supported exchanges are: [Binance](src/exchange_adapters/binance.ts), [Bittrex](src/exchange_adapters/bittrex.ts), [Coinbase](src/exchange_adapters/coinbase.ts), and [OKCoin](src/exchange_adapters/okcoin.ts).

### **PriceSources**

PriceSource is an interface representing an entity capable of fetching a price and an associated weight.

Currently the only implemented price source is [ExchangePriceSource](src/exchange_price_source.ts) which calculates an implied rate from a sequence of pairs, where each pair is a symbol traded on an exchange.

### **DataAggregator**

The DataAggregator orchestrates the collection of data via a set of PriceSources. Using this collected data, it calculates the price for the current moment. If using Ticker data, it takes a volume-weighted mean across all exchanges.

This component is also responsible for validating the data, and determining whether there is enough certainty in the data in order to calculate anything.

### **Reporter**

The Reporter takes the current price determined by the DataAggregator and reports it to the SortedOracles contract on a regular schedule. The ideal reporting schedule is one which results in a set reports from all participating oracles, spread out evenly over a period of time defined by the expiration period. For example, if the maximum age of a report is 5 minutes and there are 10 participating oracles, every 30 seconds, an oracle should send a report.

### **MetricCollector**

The MetricCollector collects information from a running oracle application instance. Its purpose is to provide insight into the health and behavior of an Oracle.

## Safeguards

### **Circuit Breaker**

<!-- TODO: resolve feedback from Brynly in this section -->
If extreme market volatility is detected, the “circuit breaker” will shut down the Oracle. The current implementation assumes that all participating Oracles are operating with a circuit breaker and using the same configuration. The coordinated shutdown of all Oracles prevents the on-chain exchange rate from being updated. Until the circuit breakers are reset, the on-chain exchange rate adjusts dynamically. One-sided trading with the reserve will push the exchange rate towards the current market price, while limiting the effect on the reserve of having a rate that is "wrong".

### **Minimum Number of Exchanges**

The concept here: the more exchanges contributing data, the more accurate the final price. The minimum number of exchanges is a configurable threshold. If the number of exchanges with usable data is below this threshold, the Oracle application does not try to calculate the current price and will not report.

### **Maximum Bid-Ask Spread**

Ticker data contains the current _bid_ and _ask_ on that exchange. Bid is the price buyers are willing to pay, and the ask is the price at which sellers are willing to sell. There is generally a gap, or a "spread", between these, and the actual price is somewhere in between. If the spread is small, the Oracle can be relatively certain of the price. If it is large, it may be less certain.

Using this safeguard, the Oracle ignores tickers with a spread that is deemed too large.

### **Maximum Volume Share per Exchange**

The current price calculation is volume-weighted. This means that the price on an exchange with high trading volume has a larger effect on the price calculation than an exchange with lower trading volume.

This configurable threshold allows setting a cap on how much weight any one exchange can have in the calculation.

### **Maximum Deviation of Prices**

If the prices from different sources (i.e. exchanges) deviate too much, it suggests there is too much uncertainty in the current market conditions. When a set threshold is exceeded, the Oracle will avoid reporting a new value until the sources are in closer agreement.

## Contributing

Feel free to jump on the Celo 🚂🚋🚋🚋. Improvements and contributions are highly encouraged! 🙏👊

See the [contributing guide](https://docs.celo.org/community/contributing) for details on how to participate.

Not yet ready to contribute but do like the project? Support Celo with a ⭐ or share the love in a [![Twitter URL](https://img.shields.io/twitter/url?style=social&url=https%3A%2F%2Fcelo.org%2F)](https://twitter.com/intent/tweet?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DkKggE5OvyhE&via=celohq&text=Checkout%20celo%21%20Love%20what%20they%20are%20building.&hashtags=celo)
