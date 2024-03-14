# How to build:
# export COMMIT_SHA=$(git rev-parse HEAD)
# docker build -f Dockerfile --build-arg COMMIT_SHA=$COMMIT_SHA -t oracletest.azurecr.io/test/oracle:$COMMIT_SHA .

# How to push to registry
# az acr login -n oracletest
# docker push oracletest.azurecr.io/test/oracle:$COMMIT_SHA

# First stage, builder to install devDependencies to build TypeScript
FROM node:18.18.0 as base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

RUN apt-get update
RUN apt-get install -y libusb-1.0-0-dev

WORKDIR /celo-oracle

FROM base as BUILDER

# ensure pnpm-lock.yaml is evaluated by kaniko cache diff
COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY tsconfig.json ./

# copy contents
COPY src src

# build contents
RUN pnpm run build

# Second stage, create slimmed down production-ready image
FROM base as runtime

ARG COMMIT_SHA
ENV NODE_ENV production

COPY package.json package.json pnpm-lock.yaml tsconfig.json readinessProbe.sh ./

COPY --from=BUILDER /celo-oracle/lib ./lib

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN echo $COMMIT_SHA > /version
RUN ["chmod", "+x", "/celo-oracle/readinessProbe.sh"]

USER 1000:1000

CMD pnpm run start
