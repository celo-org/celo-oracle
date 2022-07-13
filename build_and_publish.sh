#!/bin/bash

REPOSITORY="us-west1-docker.pkg.dev/celo-testnet-production/celo-oracle"

PACKAGE_NAME=$(grep name package.json | awk -F \" '{print $4}')
PACKAGE_VERSION=$(grep version package.json | awk -F \" '{print $4}')
COMMIT_HASH=$(git log -1 --pretty=%h)

VERSION="$PACKAGE_NAME-$PACKAGE_VERSION-testing"

echo "Building version $VERSION"

docker build -t $PACKAGE_NAME .

echo "Taggimg image"
docker tag $PACKAGE_NAME $REPOSITORY/$PACKAGE_NAME:$PACKAGE_VERSION
docker tag $PACKAGE_NAME $REPOSITORY/$PACKAGE_NAME:$COMMIT_HASH

echo "Pushing"

# Pushing requires a one time set-up: 
# gcloud auth configure-docker \
#    us-west1-docker.pkg.dev

docker push $REPOSITORY/$PACKAGE_NAME:$PACKAGE_VERSION
docker push $REPOSITORY/$PACKAGE_NAME:$COMMIT_HASH


# export CONF=$(cat devReportConfig.txt)
# docker run --name celo-oracle --env-file .env.prod -e PRICE_SOURCES=$CONF us-west1-docker.pkg.dev/celo-testnet-production/celo-oracle/celo-oracle:1.0.0-rc1