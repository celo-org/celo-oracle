# Metrics

If the application is configured such that `METRICS` is true, various metrics using [prom-client](https://github.com/siimon/prom-client) are kept track of and exposed at port `http://localhost:${PROMETHEUS_PORT}/metrics`. The recommended [default metrics](https://github.com/siimon/prom-client#default-metrics) are also exposed.

## Metric breakdown

### `oracle_action_duration_bucket`

This is a histogram that keeps track of the durations in seconds for various async actions of a specific type.

Labels:
```
['type', 'action', 'token']
```

Example labels:
```
{type="report",action="getSortedOracles",token="StableToken"}
```

Valid types and their actions:
```
type: report
actions: getSortedOracles, report, send, waitReceipt, getTransaction

type: expiry
actions: getSortedOracles, isOldestReportExpired, removeExpiredReports, send, waitReceipt, getTransaction
```

### `oracle_errors_total`

This is a counter that keeps track of the total number of errors in various contexts.

Labels:
```
['context']
```

Example labels:
```
{context="report"}
```

Valid contexts:
```
type Context = 'app' | 'block_header_subscription' | 'wallet_init' | 'expiry' | 'report' | 'report_price' | Exchange
```

### `oracle_exchange_api_request_duration_seconds`

This is a histogram that keeps track of the API request durations in seconds for each exchange.

Labels:
```
['exchange', 'endpoint', 'pair']
```

Example labels:
```
{exchange="Bittrex",endpoint="markets/CELO-USD/ticker",pair="CELO/USD"}
```

### `oracle_exchange_api_request_error_count`

This is a counter that shows how many API request errors have occurred for an exchange, endpoint, and either an HTTP status code or another type of error (fetching or json parsing).

Labels:
```
['exchange', 'endpoint', 'pair', 'type']
```

Example labels:
```
{exchange="Bittrex",endpoint="markets/CELO-USD/ticker",pair="CELO/USD",type="404"}
{exchange="Bittrex",endpoint="markets/CELO-USD/ticker",pair="CELO/USD",type="fetch"}
{exchange="Bittrex",endpoint="markets/CELO-USD/ticker",pair="CELO/USD",type="json_parse"}
```

### `oracle_last_block_header_number`

This is a gauge that indicates the number of the most recent block header seen when using block-based reporting.

Labels:
```
['type']
```

Example labels:
```
{type="assigned"}
```

Valid types:
```
all, assigned
```

### `oracle_potential_report_value`

This is a gauge to show the most recently evaluated price to report when using block-based reporting.

Labels:
```
['token']
```

Example labels:
```
{token="StableToken"}
```

### `oracle_report_count`

This is a counter that counts the number of reports by trigger.

Labels:
```
['token', 'trigger']
```

Example labels:
```
{token="StableToken",trigger="heartbeat"}
```

Valid triggers:
```
timer, heartbeat, price_change
```

### `oracle_report_time_since_last_report_seconds`

This is a gauge that keeps track of the time in seconds between the last report and the report before that.

Labels:
```
['token']
```

Example labels:
```
{token="StableToken"}
```

### `oracle_report_value`

This is a gauge that keeps track of the price of the most recent Oracle report.

Labels:
```
['token']
```

Example labels:
```
{token="StableToken"}
```

### `oracle_ticker_property`

This is a gauge that provides some properties of the last ticker data retrieved from a particular exchange.

Labels:
```
['exchange', 'pair', 'property']
```

Example labels:
```
{exchange="BITTREX",pair="CELO/USD",property="ask"}
```

Valid property values:
```
ask, baseVolume, bid, lastPrice, timestamp
```

### `oracle_trades_count`

This is a gauge that shows the number of in-memory trades for each exchange and pair.

Labels:
```
['exchange', 'pair']
```

Example labels:
```
{exchange="BITTREX",pair="CELO/USD"}
```

### `oracle_trades_price_stats`

This is a gauge that provides various statistics on in-memory trade prices for each exchange and pair.

Labels:
```
['exchange', 'pair', 'stat']
```

Example labels:
```
{exchange="BITTREX",pair="CELO/USD",stat="mean"}
```

Valid stats:
```
max, mean, median, min, std (std deviation)
```

### `oracle_trades_timestamp`

This is a gauge that shows basic information on the timestamps of in-memory trades for each exchange and pair.

Labels:
```
['exchange', 'pair', 'stat']
```

Example labels:
```
{exchange="BITTREX",pair="CELO/USD",stat="max"}
```

Valid stats:
```
max, min
```

### `oracle_trades_volume_total`

This is a gauge that gives the sum of volume across all in-memory trades for each exchange and pair.

Labels:
```
['exchange', 'pair']
```

Example labels:
```
{exchange="BITTREX",pair="CELO/USD"}
```

### `oracle_transaction_block_number`

This is a gauge that keeps track of the block number of the most recent transaction of a given type.

Labels:
```
['type', 'token']
```

Example labels:
```
{type="report",token="StableToken"}
```

Valid types:
```
report, expiry
```

### `oracle_transaction_gas`

This is a gauge that keeps track of the amount of gas provided for the most recent transaction of a given type.

Labels:
```
['type', 'token']
```

Example labels:
```
{type="report",token="StableToken"}
```

Valid types:
```
report, expiry
```

### `oracle_transaction_gas_price`

This is a gauge that keeps track of the gas price for the most recent transaction of a given type.

Labels:
```
['type', 'token']
```

Example labels:
```
{type="report",token="StableToken"}
```

Valid types:
```
report, expiry
```

### `oracle_transaction_gas_used`

This is a gauge that keeps track of the gas used for the most recent transaction of a given type.

Labels:
```
['type', 'token']
```

Example labels:
```
{type="report",token="StableToken"}
```

Valid types:
```
report, expiry
```

### `oracle_transaction_success_count`

This is a counter that records the number of transactions for a given type that have successfully been mined.

Labels:
```
['type', 'token']
```

Example labels:
```
{type="report",token="StableToken"}
```

Valid types:
```
report, expiry
```

### `oracle_websocket_provider_setup_counter`

This is a counter that records the number of times the websocket provider has been setup. This only occurs when using block-based reporting, and happens when there is an error with the existing websocket provider.

Labels: none
