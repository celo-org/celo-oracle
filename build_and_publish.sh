#!/bin/bash
set -euo pipefail

REPOSITORY="us-west1-docker.pkg.dev/celo-testnet-production/celo-oracle"

PACKAGE_NAME=$(grep name package.json | awk -F \" '{print $4}')
PACKAGE_VERSION=$(grep version package.json | awk -F \" '{print $4}')
COMMIT_HASH=$(git log -1 --pretty=%h)

VERSION="$PACKAGE_NAME-$PACKAGE_VERSION"

gcloud artifacts docker tags list $REPOSITORY | grep $PACKAGE_VERSION > /dev/null 2>&1
PACKAGE_VERSION_EXISTS=`expr $? = 0` # if grep finds something exit code 0 otherwise 1

if [[ $BUILD_ENV != "production" && $BUILD_ENV != "staging" ]]; then
  echo "Invalid BUILD_ENV: $BUILD_ENV"
  exit 1;
fi

if [[ $PACKAGE_VERSION_EXISTS -eq 1 && $BUILD_ENV == "production" ]]; then
  echo "Package version already exists and build env is production."
  echo "In order to build a production image you should bump the package version."
  exit 1;
fi

echo "Building version $VERSION"
docker buildx build --platform linux/amd64 -t $PACKAGE_NAME .


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

# Pushing requires a one time set-up: 
# gcloud auth configure-docker \
#    us-west1-docker.pkg.dev