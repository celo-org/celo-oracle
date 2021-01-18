FROM node:10

RUN apt-get update
RUN apt-get install -y libusb-1.0-0-dev

WORKDIR /celo-oracle

# ensure yarn.lock is evaluated by kaniko cache diff
COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --network-timeout 100000 && yarn cache clean

COPY tsconfig.json ./

# copy contents
COPY src src
COPY test test
COPY __mocks__ __mocks__

# build contents
RUN yarn build

# lint check
COPY tslint.json ./
RUN yarn lint
COPY .prettierignore ./
COPY .prettierrc.js ./
RUN yarn run prettify:diff
RUN yarn run lint:tests

# run tests
COPY jest.config.js jest.config.js
RUN yarn test