#!/bin/bash
oracle_env=$1
case "$1" in
"test")
  registry="oracletest"
  image="oracletest.azurecr.io/test/oracle"
  ;;
"baklava")
  registry="celoprod"
  image="celoprod.azurecr.io/oracle"
  ;;
"rc1")
  registry="celoprod"
  image="celoprod.azurecr.io/oracle"
  ;;
*)
  echo "Usage: ./build.sh <env>" 
  echo "env: must be one of test, baklava or rc1"
  exit 1
esac

sha=$(git rev-parse HEAD)

if [ "`docker images -f reference=$image:$sha | wc -l`" -gt "1" ]; then
  echo "Image found. Skipping build. Run 'docker image rm $image:$sha' to force a rebuild."
else
  echo "Building image"
  docker build -f Dockerfile --build-arg COMMIT_SHA=$COMMIT_SHA -t $image:$sha .
fi

# How to push to registry
az acr login -n $registry
docker push $image:$sha
