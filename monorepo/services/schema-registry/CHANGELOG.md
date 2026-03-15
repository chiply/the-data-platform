# Changelog

## [0.1.9](https://github.com/chiply/the-data-platform/compare/schema-registry-v0.1.8...schema-registry-v0.1.9) (2026-03-15)


### Features

* add DELETE endpoint and fix live_update file ownership ([#49](https://github.com/chiply/the-data-platform/issues/49)) ([56f7c40](https://github.com/chiply/the-data-platform/commit/56f7c40754a9f6359fa0e681e9554bc65dfe9af7))


### Bug Fixes

* push base image to registry in CI so buildx can resolve it ([#46](https://github.com/chiply/the-data-platform/issues/46)) ([6ca8d79](https://github.com/chiply/the-data-platform/commit/6ca8d79177ec69edd67d8b9ce5a6b70f5fed9847))

## [0.1.8](https://github.com/chiply/the-data-platform/compare/schema-registry-v0.1.7...schema-registry-v0.1.8) (2026-03-15)


### Bug Fixes

* schema-registry local dev DB config ([#44](https://github.com/chiply/the-data-platform/issues/44)) ([8218f28](https://github.com/chiply/the-data-platform/commit/8218f28ef7f6d08d8b100bba2ae440f6be4ee83d))

## [0.1.7](https://github.com/chiply/the-data-platform/compare/schema-registry-v0.1.6...schema-registry-v0.1.7) (2026-03-15)


### Features

* [TDP-007-03] define schema registry SQLAlchemy models ([8170345](https://github.com/chiply/the-data-platform/commit/8170345df88ef726cd83fbfea85e6092fefdaad3))
* [TDP-007-04] create initial Alembic migration ([11e7fd9](https://github.com/chiply/the-data-platform/commit/11e7fd97f497983e5308fa59631a9293cafe9da1))
* [TDP-007-05] wire database session into schema registry routers ([8c5b112](https://github.com/chiply/the-data-platform/commit/8c5b1121c8d92065516c860be4af68426a59b9ae))
* [TDP-007-06] implement migration execution strategy ([df55aa2](https://github.com/chiply/the-data-platform/commit/df55aa230ba9dd2d1342abd53e50a0e5ff68d8d7))
* [TDP-007-07] configure DATABASE_URL injection via K8s secrets ([33f9e45](https://github.com/chiply/the-data-platform/commit/33f9e45b65c54b4f54ffbe23febbef0fe57aa802))
* [TDP-007-08] update Copier template database defaults ([652a7e7](https://github.com/chiply/the-data-platform/commit/652a7e7243f787edafcad56a71614fdf9021f603))
* add Conflict exception and handle duplicate subject creation ([fe6c847](https://github.com/chiply/the-data-platform/commit/fe6c847c3daba94fcf77b41ac378f58e940cf725))
* PostgreSQL infrastructure (design doc 007) ([#32](https://github.com/chiply/the-data-platform/issues/32)) ([f707357](https://github.com/chiply/the-data-platform/commit/f707357b1b9b4e6f56dd400b9ffa942774ea8ff7))


### Bug Fixes

* address Copilot review feedback on PR [#32](https://github.com/chiply/the-data-platform/issues/32) ([3e50449](https://github.com/chiply/the-data-platform/commit/3e5044976fa97178e83a700d16f588c6b22c3193))
* resolve CNPG initdb failures and schema-registry local dev issues ([dcbe903](https://github.com/chiply/the-data-platform/commit/dcbe9037abc8c0dfff7212a561cec57665c3a8b2))
* use nested transactions in test fixtures for session.commit() ([5d4565a](https://github.com/chiply/the-data-platform/commit/5d4565a5063b3ab6c2b4aebf64e9dc65df1f64c6))

## [0.1.6](https://github.com/chiply/the-data-platform/compare/schema-registry-v0.1.5...schema-registry-v0.1.6) (2026-03-13)


### Features

* shared platform library (tdp-fastapi-core) with Copier template integration ([#28](https://github.com/chiply/the-data-platform/issues/28)) ([aa9d5a8](https://github.com/chiply/the-data-platform/commit/aa9d5a81a1d4904ffc0891cc18b4742f8e31e48f))

## [0.1.5](https://github.com/chiply/the-data-platform/compare/schema-registry-v0.1.4...schema-registry-v0.1.5) (2026-03-12)


### Bug Fixes

* resolve Tiltfile helm dependency loop and add API endpoint docs ([#19](https://github.com/chiply/the-data-platform/issues/19)) ([07e14de](https://github.com/chiply/the-data-platform/commit/07e14de056965a02aa5f2e43943cf4d2bb02a7ca))

## [0.1.4](https://github.com/chiply/the-data-platform/compare/schema-registry-v0.1.3...schema-registry-v0.1.4) (2026-03-12)


### Bug Fixes

* Tiltfile Starlark string concatenation ([#17](https://github.com/chiply/the-data-platform/issues/17)) ([5919e5d](https://github.com/chiply/the-data-platform/commit/5919e5dc309bacb53bd1e8cd6aa8409e34a918b0))

## [0.1.3](https://github.com/chiply/the-data-platform/compare/schema-registry-v0.1.2...schema-registry-v0.1.3) (2026-03-11)


### Features

* add /version endpoint and fix Tilt ArgoCD mode ([#15](https://github.com/chiply/the-data-platform/issues/15)) ([25b2882](https://github.com/chiply/the-data-platform/commit/25b2882093212d708651acde0889538c6f79777b))

## [0.1.2](https://github.com/chiply/the-data-platform/compare/schema-registry-v0.1.1...schema-registry-v0.1.2) (2026-03-11)


### Bug Fixes

* Tilt live_update permissions and macOS bash compat ([#13](https://github.com/chiply/the-data-platform/issues/13)) ([b6b38c7](https://github.com/chiply/the-data-platform/commit/b6b38c7ac8fd34531e760e31e09599b5595b7ed5))

## [0.1.1](https://github.com/chiply/the-data-platform/compare/schema-registry-v0.1.0...schema-registry-v0.1.1) (2026-03-11)


### Features

* **deploy:** ArgoCD GitOps deployment & local dev workflow ([575c097](https://github.com/chiply/the-data-platform/commit/575c097fae29f8c54da558972865c95d7dc9c2df))
* US-002 - Create dummy schema-registry FastAPI service ([6b27a20](https://github.com/chiply/the-data-platform/commit/6b27a20911fd24701677d428b13523b64ff9c8d0))
