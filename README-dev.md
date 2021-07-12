# Development Guide

## Prerequisites

Running the Celo Oracle locally is the easiest way to get started contributing to the code base. We leverage a few existing Celo specific tools so make sure to have the [celo-monorepo](https://github.com/celo-org/celo-monorepo) and [celo-blockchain](https://github.com/celo-org/celo-blockchain) cloned locally and follow their respective setup guides before continuing. The folder structure most commonly used is:

```shell
~/celo/celo-monorepo
~/celo/celo-blockchain
~/celo/celo-oracle
```

For more information on how the Oracles work on Celo take a look at the [Oracles](https://docs.celo.org/celo-codebase/protocol/stability/oracles) section of the [docs](https://docs.celo.org).

<!-- todo: mention oracle blog post? -->

<!-- todo: recommendations to not run production oracle with in memory private key? -->

## How to develop the oracle locally

To run the oracle we need a couple of things:

1. A private key for your Oracle to sign transactions
2. A running Celo blockchain with relevant migrations applied
   - this means we need to register your Oracle's address in the migration overrides

### Generate private key and address

To accomplish we'll use the celocli package from the monorepo, run the following in your terminal from the monorepo directory:

```shell
➜ ~/celo/celo-monorepo yarn run celocli account:new
...
...
mnemonic: ahead puppy smile edge interest resource element piano stem protect flush spring leader urban paddle gospel fuel rotate offer calm bottom enemy awake hub
accountAddress: 0x2665BBD75eca45870a7202371dA328B8DbF66B09
privateKey: 371c2cd7e789496861d483b20c71ec8c49b8cb93739d3648cd7364b318c8923e
publicKey: 02a8243ec653a3e5244d436077ca7da13d2fdc1122fb97794acf5df6625d213dfa
```

Because we'll be using an in memory private key for development we can go ahead and copy that private key into the file `/tmp/defaultPrivateKey`. The file to use is configurable via the environment variable `PRIVATE_KEY_PATH` when running an Oracle later.

We'll need to add this account address in two places, once in the `migration-override.json` file so our address is registered as an Oracle, and once again in an `initial-accounts.json` file where we assign it a balance of CELO so we can make reports. The diff may look something like this:

```diff
--- a/packages/dev-utils/src/migration-override.json
+++ b/packages/dev-utils/src/migration-override.json
   },
   "stableToken": {
@@ -59,11 +59,17 @@
       "0x5409ED021D9299bf6814279A6A1411A7e866A631",
       "0xE36Ea790bc9d7AB70C55260C66D52b1eca985f84",
       "0x06cEf8E666768cC40Cc78CF93d9611019dDcB628",
-      "0x7457d5E02197480Db681D3fdF256c7acA21bDc12"
+      "0x7457d5E02197480Db681D3fdF256c7acA21bDc12",
+      "0x2665BBD75eca45870a7202371dA328B8DbF66B09"
     ],
     "frozen": false
 }
```

```diff
--- a/initial-accounts.json
+++ b/initial-accounts.json
+ [
+   {
+     "address": "0x2665BBD75eca45870a7202371dA328B8DbF66B09",
+     "balance": "120000000000000000000000000"
+   }
+ ]
```

### Run a local Celo blockchain node

This step requires you to have the helper tool `celotooljs` installed on your path, if you didn't do that while setting up the monorepo add this to your `.bashrc`/`.zshrc`/`.XXXrc` file `alias celotooljs=<YOUR_PATH_TO_MONOREPO>/packages/celotool/bin/celotooljs.sh`.

1. Make sure you have [built](https://github.com/celo-org/celo-blockchain/blob/master/README.md#building-the-source) the `geth` package on the blockchain repo.
   
2. Run the following command in a new terminal window or tab to start up a blockchain node:

```shell
➜ ~/celo/celo-oracle celotooljs geth start --data-dir /tmp/chain-data --geth-dir ~/celo/celo-blockchain --verbose --migrate --purge --monorepo-dir ~/celo/celo-monorepo --mining --verbosity 1 --migration-overrides ~/celo/celo-monorepo/packages/dev-utils/src/migration-override.json --migrateTo 24 --initial-accounts ~/celo/celo-monorepo/initial-accounts.json

...
...
...

... done migrating contracts!
```

This may take a while.

### Startup the oracle

Back in your original terminal run the following:

```shell
➜ ~/celo/celo-oracle yarn build && yarn start | npx bunyan
```

After running this your Oracle should be observing blocks and reporting prices to your node.
