#!/bin/bash
# Default port for Prometheus is 9090
port=$1
currencyPair=$2
# Look for success metric line at /metrics endpoint
successMetric="oracle_transaction_success_count{type=\"report\",currencyPair=\"$currencyPair\"}"
match=$(curl 'http://127.0.0.1:'$port'/metrics' | grep -Po "$successMetric \d*")
# Remove all but the count
successCount="${match/$successMetric/}"

if [[ "$successCount" -gt 0 ]]; then
  echo "Found successful reports";
  exit 0;
fi

echo "No successful reports yet";
exit 1;