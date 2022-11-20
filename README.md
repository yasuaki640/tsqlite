# tsqlite

An implementation of [Tutorial (Let's Build a Simple Database)](https://github.com/cstack/db_tutorial) in TypeScript.

This implementation can't use in production.

## Requirements

```shell
$ node -v
v19.0.1
```

## Usage

```shell
$ npm start mydb.db

> tsqlite@0.0.0 start
> node build/src/main.js mydb.db

db > select
(1, tako, ika@uni.com)
Executed.
db > insert 2 surume mebach@iwashi.com
Executed.
db > select
(1, tako, ika@uni.com)
(2, surume, mebach@iwashi.com)
Executed.
db > .exit
```
