#!/bin/bash

REPOSITORY="us-west1-docker.pkg.dev/celo-testnet-production/celo-oracle"

PACKAGE_NAME=$(grep name package.json | awk -F \" '{print $4}')
PACKAGE_VERSION=$(grep version package.json | awk -F \" '{print $4}')
COMMIT_HASH=$(git log -1 --pretty=%h)

VERSION="$PACKAGE_NAME-$PACKAGE_VERSION"

# Check if the package version already exists in the repository
# 2>&1 is used to redirect stderr to stdout so that grep can 
# search in the full output of the gcloud command
gcloud artifacts docker tags list $REPOSITORY --filter "tag~$PACKAGE_VERSION\$" 2>&1 | grep "Listed 0 items" > /dev/null
# if grep finds "Listed 0 items" exit code is 0 which means that the package version does not exist
PACKAGE_VERSION_EXISTS=$?

if [[ $PACKAGE_VERSION_EXISTS -eq 1 && $BUILD_ENV == "production" ]]; then
  echo "Package version already exists and build env is production."
  echo "In order to build a production image you should bump the package version."
  exit 1
fi

if [[ $BUILD_ENV != "production" && $BUILD_ENV != "staging" ]]; then
  echo "Invalid BUILD_ENV: $BUILD_ENV"
  exit 1
fi

echo "Building version $VERSION"
docker buildx build --platform linux/amd64 -t $PACKAGE_NAME .

if [[ $? -ne 0 ]]; then
  echo "Build failed"
  exit 1
fi

echo "Tagging and pushing"
docker tag $PACKAGE_NAME $REPOSITORY/$PACKAGE_NAME:$COMMIT_HASH
docker push $REPOSITORY/$PACKAGE_NAME:$COMMIT_HASH

if [[ $BUILD_ENV == "production" ]]; then 
  docker tag $PACKAGE_NAME $REPOSITORY/$PACKAGE_NAME:$PACKAGE_VERSION
  docker push $REPOSITORY/$PACKAGE_NAME:$PACKAGE_VERSION
else
  docker tag $PACKAGE_NAME $REPOSITORY/$PACKAGE_NAME:latest
  docker push $REPOSITORY/$PACKAGE_NAME:latest
fi
