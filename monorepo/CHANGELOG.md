# Changelog

## [0.1.13](https://github.com/chiply/the-data-platform/compare/platform-v0.1.12...platform-v0.1.13) (2026-03-13)


### Bug Fixes

* build-image.sh uses monorepo context and builds base image ([#30](https://github.com/chiply/the-data-platform/issues/30)) ([2f8473f](https://github.com/chiply/the-data-platform/commit/2f8473fab5b942e43a45ca4f683b30d631bd2f38))

## [0.1.12](https://github.com/chiply/the-data-platform/compare/platform-v0.1.11...platform-v0.1.12) (2026-03-13)


### Features

* shared platform library (tdp-fastapi-core) with Copier template integration ([#28](https://github.com/chiply/the-data-platform/issues/28)) ([aa9d5a8](https://github.com/chiply/the-data-platform/commit/aa9d5a81a1d4904ffc0891cc18b4742f8e31e48f))

## [0.1.11](https://github.com/chiply/the-data-platform/compare/platform-v0.1.10...platform-v0.1.11) (2026-03-12)


### Features

* bootstrap ArgoCD applications in dev and production scripts ([#24](https://github.com/chiply/the-data-platform/issues/24)) ([5a72c5e](https://github.com/chiply/the-data-platform/commit/5a72c5e18c5d426d0822c56431f6774439a2d7d9))


### Bug Fixes

* correct ArgoCD application name in production-up.sh wait command ([#26](https://github.com/chiply/the-data-platform/issues/26)) ([7456419](https://github.com/chiply/the-data-platform/commit/74564197ed7363ca0a7f0c6676a8cb7673b79eff))

## [0.1.10](https://github.com/chiply/the-data-platform/compare/platform-v0.1.9...platform-v0.1.10) (2026-03-12)


### Bug Fixes

* ignore unfixed vulnerabilities in Trivy scan ([#22](https://github.com/chiply/the-data-platform/issues/22)) ([716a366](https://github.com/chiply/the-data-platform/commit/716a366b891d952e27d5d0338717118ae9118724))

## [0.1.9](https://github.com/chiply/the-data-platform/compare/platform-v0.1.8...platform-v0.1.9) (2026-03-12)


### Bug Fixes

* resolve Tiltfile helm dependency loop and add API endpoint docs ([#19](https://github.com/chiply/the-data-platform/issues/19)) ([07e14de](https://github.com/chiply/the-data-platform/commit/07e14de056965a02aa5f2e43943cf4d2bb02a7ca))

## [0.1.8](https://github.com/chiply/the-data-platform/compare/platform-v0.1.7...platform-v0.1.8) (2026-03-12)


### Bug Fixes

* Tiltfile Starlark string concatenation ([#17](https://github.com/chiply/the-data-platform/issues/17)) ([5919e5d](https://github.com/chiply/the-data-platform/commit/5919e5dc309bacb53bd1e8cd6aa8409e34a918b0))

## [0.1.7](https://github.com/chiply/the-data-platform/compare/platform-v0.1.6...platform-v0.1.7) (2026-03-11)


### Features

* add /version endpoint and fix Tilt ArgoCD mode ([#15](https://github.com/chiply/the-data-platform/issues/15)) ([25b2882](https://github.com/chiply/the-data-platform/commit/25b2882093212d708651acde0889538c6f79777b))

## [0.1.6](https://github.com/chiply/the-data-platform/compare/platform-v0.1.5...platform-v0.1.6) (2026-03-11)


### Bug Fixes

* Tilt live_update permissions and macOS bash compat ([#13](https://github.com/chiply/the-data-platform/issues/13)) ([b6b38c7](https://github.com/chiply/the-data-platform/commit/b6b38c7ac8fd34531e760e31e09599b5595b7ed5))

## [0.1.5](https://github.com/chiply/the-data-platform/compare/platform-v0.1.4...platform-v0.1.5) (2026-03-11)


### Features

* add local ArgoCD Application manifest for k3d testing ([3893aa4](https://github.com/chiply/the-data-platform/commit/3893aa4b017ade0cc366d4149f049a305f2cae01))
* **deploy:** ArgoCD GitOps deployment & local dev workflow ([575c097](https://github.com/chiply/the-data-platform/commit/575c097fae29f8c54da558972865c95d7dc9c2df))
* **infra:** add ui-access.sh helper for ArgoCD and Grafana UI access ([a132893](https://github.com/chiply/the-data-platform/commit/a1328937393fd0bd7dd9fb0409eea6c34b20c70c))
* US-001 - Install ArgoCD as Layer 2 platform service ([3a30fb8](https://github.com/chiply/the-data-platform/commit/3a30fb8954a34ac3af32bb79157c3c116083e175))
* US-003 - Create shared Helm library chart ([0fbacdc](https://github.com/chiply/the-data-platform/commit/0fbacdcd8ac5d7dd30c2ee942560a52ca767d59d))
* US-004 - Application secrets management strategy ([a60e9d2](https://github.com/chiply/the-data-platform/commit/a60e9d2a7742b8c276773e63e14a32b25e516748))
* US-005 - Create Helm chart for schema-registry stub ([e1b8cff](https://github.com/chiply/the-data-platform/commit/e1b8cffe1ca863f422229bc095859b9d29a8ea20))
* US-006 - Create ArgoCD Application manifests ([673b355](https://github.com/chiply/the-data-platform/commit/673b355b0b4e77ad06a86311e6efce8113c95fbb))
* US-007 - Set up Tiltfile for local development ([b4ead61](https://github.com/chiply/the-data-platform/commit/b4ead6155105387a89816bfae8b470e3d05f1d26))
* US-008 - CI pipeline for image builds ([8254a07](https://github.com/chiply/the-data-platform/commit/8254a07f592e4892424049fadd40d5b0e080fff8))
* US-009 - Add ArgoCD bootstrapping to Tiltfile ([e2b7e4a](https://github.com/chiply/the-data-platform/commit/e2b7e4a8394ce00cb83731abf87903a3657a266e))
* US-009 - Add ArgoCD bootstrapping to Tiltfile ([2613f8e](https://github.com/chiply/the-data-platform/commit/2613f8ee64e75c70a01985d42e34d58ca38a8da4))
* US-010 - Helm chart linting and testing in CI ([91d1309](https://github.com/chiply/the-data-platform/commit/91d13098b0ebd0a257099afcc383810d40e5060e))
* US-011 - Image scanning and CycloneDX SBOM generation ([fb6cc8b](https://github.com/chiply/the-data-platform/commit/fb6cc8bca2b027c63e12f81f15ef2ed344636478))
* US-011 - Image scanning and CycloneDX SBOM generation ([e15a36c](https://github.com/chiply/the-data-platform/commit/e15a36c7ff6c778b51693b3033b8a34eadf3b3b8))
* US-012 - ArgoCD RBAC and AppProject hardening ([48c37a4](https://github.com/chiply/the-data-platform/commit/48c37a46326b24fb8f2e84c81168d4c4e632a297))
* US-013 - Environment promotion workflow documentation ([0105e3e](https://github.com/chiply/the-data-platform/commit/0105e3ec0a08becaaf90cbf402b806665f2b7ce1))


### Bug Fixes

* address coderabbit feedback ([e21d99c](https://github.com/chiply/the-data-platform/commit/e21d99c30df4b1aefacac9ca04b11f8dbd855f2f))
* address coderabbit feedback (round 2) ([67273b9](https://github.com/chiply/the-data-platform/commit/67273b9346f118f0d95e6a116d2abf344e9ceea2))
* address copilot review feedback ([1ba8cb9](https://github.com/chiply/the-data-platform/commit/1ba8cb912890085b865db413c3e937f5591bd92d))
* address critical, high, and medium findings from review ([cc6cbc8](https://github.com/chiply/the-data-platform/commit/cc6cbc8199fb1002da1351464400d9d02a73ee62))
* address review findings before PR ([8f599fc](https://github.com/chiply/the-data-platform/commit/8f599fc6ec3c4804c7dff99cea127fe1bb922c4a))
* **argocd:** use configs.params for insecure mode instead of extraArgs ([f90a01f](https://github.com/chiply/the-data-platform/commit/f90a01faa29616213c1f05dc8c14fc07d2abbe61))
* correct GitHub repo URL in ArgoCD manifests (chiply, not charlieholland) ([699cc16](https://github.com/chiply/the-data-platform/commit/699cc16969a166f9722153e5df741b2b858dbd48))
* **helm:** add runAsUser/runAsGroup to podSecurityContext ([11dfd8d](https://github.com/chiply/the-data-platform/commit/11dfd8d9b1a791f4fede4256b346bfe94b1d7c51))
* US-007 - fix venv pip path and add restart_container for live_update ([a93980d](https://github.com/chiply/the-data-platform/commit/a93980def45fd76e2448286ca2730ab256934393))

## [0.1.4](https://github.com/chiply/the-data-platform/compare/platform-v0.1.3...platform-v0.1.4) (2026-03-10)


### Features

* **infra:** migrate secrets to Pulumi ESC environments ([ba99cf1](https://github.com/chiply/the-data-platform/commit/ba99cf181e331a0e64d17f27e63e743a8db8387a))

## [0.1.3](https://github.com/chiply/the-data-platform/compare/platform-v0.1.2...platform-v0.1.3) (2026-03-10)


### Features

* **infra:** Add dev environment on Linode with multi-env config ([#8](https://github.com/chiply/the-data-platform/issues/8)) ([bfdd7e9](https://github.com/chiply/the-data-platform/commit/bfdd7e9ab39d6b0794756870aeca728bba3a448c))

## [0.1.2](https://github.com/chiply/the-data-platform/compare/platform-v0.1.1...platform-v0.1.2) (2026-03-10)


### Features

* **infra:** Kubernetes local development infrastructure ([#6](https://github.com/chiply/the-data-platform/issues/6)) ([f3d5f42](https://github.com/chiply/the-data-platform/commit/f3d5f42cfea7558e3ab9b0b49f54c5f0d48f4a63))

## [0.1.1](https://github.com/chiply/the-data-platform/compare/platform-v0.1.0...platform-v0.1.1) (2026-03-09)


### Features

* Bootstrap Bazel monorepo with D2 architecture diagrams ([7ddd707](https://github.com/chiply/the-data-platform/commit/7ddd7073d94619a19e812b6a6c1c3670a0d510ee))
* US-001 - Initialize MODULE.bazel and Bazel configuration ([ff190a0](https://github.com/chiply/the-data-platform/commit/ff190a04de53b16958ad152812ea4a322ac38bf5))
* US-002 - Scaffold monorepo directory structure ([da6f9e1](https://github.com/chiply/the-data-platform/commit/da6f9e1ac1a3b7c282c1dbfb65c830cdd6c0a42e))
* US-003 - Set up architecture-diagram tool with Mermaid CLI ([4989270](https://github.com/chiply/the-data-platform/commit/4989270e1c3427f47aeb426309d9b7b3a0296c11))
* US-004 - Create CI wrapper scripts ([f3bd4d9](https://github.com/chiply/the-data-platform/commit/f3bd4d95a937acf4bd3404b48350c858ef7bc6a1))
* US-005 - Implement affected-targets detection script ([3bc3490](https://github.com/chiply/the-data-platform/commit/3bc34904d598cdc521affba16fb4ba627e422d70))
* US-006 - Create initial C4 Context diagram ([54d904a](https://github.com/chiply/the-data-platform/commit/54d904acb831bea9d8fea0248550b6434dfbbd4a))
* US-007 - Create initial C4 Container diagram ([d185b33](https://github.com/chiply/the-data-platform/commit/d185b33347f6fbceb25f3befaa589b5071eff0b1))
* US-009 - Migrate diagram tool from Mermaid to D2 ([dabd065](https://github.com/chiply/the-data-platform/commit/dabd06560989274629b4ad091b7a2732e746c1c0))


### Bug Fixes

* add .claude/worktrees/ to .gitignore ([3f9a742](https://github.com/chiply/the-data-platform/commit/3f9a7424060e99c433040acb64c5a9ecd2f5236e))
* address coderabbit feedback ([8a65458](https://github.com/chiply/the-data-platform/commit/8a65458d6d9df8a515dd6707e070f3717e9926f3))
* address Copilot review feedback ([396f486](https://github.com/chiply/the-data-platform/commit/396f486b94b0c9d0ccfa7ec3c3a3fcc1023bf4f8))
