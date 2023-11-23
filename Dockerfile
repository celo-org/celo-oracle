# How to build:
# export COMMIT_SHA=$(git rev-parse HEAD)
# docker build -f Dockerfile --build-arg COMMIT_SHA=$COMMIT_SHA -t oracletest.azurecr.io/test/oracle:$COMMIT_SHA .

# How to push to registry
# az acr login -n oracletest
# docker push oracletest.azurecr.io/test/oracle:$COMMIT_SHA

# First stage, builder to install devDependencies to build TypeScript
FROM node:18.18.0 as BUILDER

RUN apt-get update
RUN apt-get install -y libusb-1.0-0-dev

WORKDIR /celo-oracle

# ensure yarn.lock is evaluated by kaniko cache diff
COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --network-timeout 100000 && yarn cache clean

COPY tsconfig.json ./

# copy contents
COPY src src

# build contents
RUN yarn build

# Second stage, create slimmed down production-ready image
FROM node:18.18.0
ARG COMMIT_SHA

RUN apt-get update
RUN apt-get install -y libusb-1.0-0-dev

WORKDIR /celo-oracle
ENV NODE_ENV production

COPY package.json package.json yarn.lock tsconfig.json readinessProbe.sh ./

COPY --from=BUILDER /celo-oracle/lib ./lib

RUN yarn install --production --frozen-lockfile --network-timeout 100000 && yarn cache clean
RUN echo $COMMIT_SHA > /version
RUN ["chmod", "+x", "/celo-oracle/readinessProbe.sh"]

USER 1000:1000

CMD yarn start
