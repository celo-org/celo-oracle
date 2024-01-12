#!/bin/bash

# This script retrieves the intermediate certificate with the specified index
# from the certificate chain of the specified server and computes its SHA-256
# fingerprint.

# The script requires the following arguments:
#   - server_name: the name of the server to connect to
#   - intermediate_cert_index: the index of the intermediate certificate to

# The script can be run from the root directory of the project as follows:
# yarn get-cert [server_name] [intermediate_cert_index]
# yarn get-cert api-cloud.bitmart.com 1

# Check if two arguments are provided
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <server_name> <intermediate_cert_index>"
    exit 1
fi

SERVER_NAME=$1
CERT_INDEX=$2

# Retrieve the entire certificate chain and store it in an array
mapfile -t CERT_CHAIN < <(echo | openssl s_client -servername $SERVER_NAME -connect $SERVER_NAME:443 -showcerts 2>/dev/null | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p')

# Check if the specified index is valid
if [ "$CERT_INDEX" -lt 1 ] || [ "$CERT_INDEX" -gt "${#CERT_CHAIN[@]}" ]; then
    echo "Invalid intermediate certificate index: $CERT_INDEX"
    exit 2
fi

# Extract the specified intermediate certificate
INTERMEDIATE_CERT=""
for ((i=0; i<${#CERT_CHAIN[@]}; i++)); do
    if [[ ${CERT_CHAIN[$i]} =~ 'BEGIN CERTIFICATE' ]]; then
        let cert_count++
    fi
    if [ $cert_count -eq $CERT_INDEX ]; then
        INTERMEDIATE_CERT+="${CERT_CHAIN[$i]}"$'\n'
    fi
done

# Check if the intermediate certificate was found
if [ -z "$INTERMEDIATE_CERT" ]; then
    echo "Intermediate certificate with index $CERT_INDEX not found."
    exit 3
fi

# Compute and display the SHA-256 fingerprint
echo "$INTERMEDIATE_CERT" | openssl x509 -noout -fingerprint -sha256

