# Changelog

## [1.10.1](https://github.com/feasibleone/blong/compare/blong-gogo-v1.10.0...blong-gogo-v1.10.1) (2026-03-14)


### Bug Fixes

* enable link creation in deploy configuration and update Dockerfile for link creation ([2f1ce92](https://github.com/feasibleone/blong/commit/2f1ce9266b8069676ba3d467fe3d9b0a82446fb6))

## [1.10.0](https://github.com/feasibleone/blong/compare/blong-gogo-v1.9.4...blong-gogo-v1.10.0) (2026-03-14)


### Features

* add Dockerfile for blong-gogo and update deployment configuration ([56be8f4](https://github.com/feasibleone/blong/commit/56be8f4b15ebb32ca4912aec19366fd94f2c7702))
* add GitHub adapter with release management capabilities and update CI publish scripts ([bf01aef](https://github.com/feasibleone/blong/commit/bf01aef3d7028edaf6770321a5542bc2651665e0))
* add support for custom resources in Kubernetes API adapter ([e32e0c9](https://github.com/feasibleone/blong/commit/e32e0c95c544ed72c6e075ed7e2924c10212fe4f))
* allow config override during start, improve types ([58c3840](https://github.com/feasibleone/blong/commit/58c3840b1543ce2d963c0bbdcb1a0712feface7c))
* enhance adapter type definitions to support additional context ([326ad32](https://github.com/feasibleone/blong/commit/326ad32c0a8d012c7cabead3b2f33e7793c9f7ab))
* enhance error handling in Keycloak adapter and add MySQL configuration to Knex adapter ([2124a53](https://github.com/feasibleone/blong/commit/2124a531496291f62c337232be5488a79461db51))
* enhance Keycloak adapter with token handling and authentication improvements ([4cbcb51](https://github.com/feasibleone/blong/commit/4cbcb51590c761a46eca9ebd61322a6fccc74d1a))
* enhance logging details and improve MongoDB adapter operations ([11eb992](https://github.com/feasibleone/blong/commit/11eb992ec31799b84c50344f98e1c6900cfef671))
* implement blong-chain parallel testing framework ([589bd58](https://github.com/feasibleone/blong/commit/589bd587be36d9afea3e7eea35dea63c30255ee6))
* implement Proxy-based error system with simplified syntax and comprehensive tests ([3ac942a](https://github.com/feasibleone/blong/commit/3ac942a2782c94bd2c338fa185e07858a4c52669))
* implement rest-fs extension ([29589ff](https://github.com/feasibleone/blong/commit/29589ff7d57cb078b36c9df36ce27f513b9a8b3a))
* nested test context integration and error reporting capabilities ([9470aa5](https://github.com/feasibleone/blong/commit/9470aa53c9d1d676cd50ff004b3bb0eea491d782))
* run as TypeScript ([fd7c6b7](https://github.com/feasibleone/blong/commit/fd7c6b7af21a76e88c35fddd9a4158852ac71ff6))
* self-contained layers ([9b80e3a](https://github.com/feasibleone/blong/commit/9b80e3a1bfd1b6843ece5dba80b619444ec93c84))
* support activation-based config in handler folder config.ts ([#64](https://github.com/feasibleone/blong/issues/64)) ([78e13ba](https://github.com/feasibleone/blong/commit/78e13baa0c85b05c8f31c8efa374f035e0009704))
* update @rushstack/heft and related plugins to latest versions ([f6a6f26](https://github.com/feasibleone/blong/commit/f6a6f26bdfd9cc95cb1322461aa494f5345bd821))
* update dependencies across multiple packages ([03269a5](https://github.com/feasibleone/blong/commit/03269a57405c53a3d6f16f7531f82cde2a31c5cc))
* update dependencies and enhance type definitions ([d969546](https://github.com/feasibleone/blong/commit/d96954690b8f7393d1b43866ce8b18afe951129a))
* update handler to include remote parameter for improved functionality ([dedcb53](https://github.com/feasibleone/blong/commit/dedcb53f7993db7d6d5c0a7db516f290352d53cc))
* update package.json for blong-gogo and blong ([0bf8331](https://github.com/feasibleone/blong/commit/0bf83314fd91cb9c96062286d1957e9c960ae374))
* upgrade typebox ([6631428](https://github.com/feasibleone/blong/commit/6631428be08fda73571c3e4c623893fad668c25d))


### Bug Fixes

* add ESLint configuration files and update Watch class to use FSWatcher type ([3f358aa](https://github.com/feasibleone/blong/commit/3f358aae8c00cd223a612225f4663a054678d198))
* bin script ([e26c9ee](https://github.com/feasibleone/blong/commit/e26c9eef1785b594c3afddddb7d4b8d57be93ae2))
* build ([9db5396](https://github.com/feasibleone/blong/commit/9db5396dfcb3a4a334f4d607a821c5090a22e7dd))
* build errors ([9da9b4a](https://github.com/feasibleone/blong/commit/9da9b4a06f1d6cb6d1526dbe0b9c8d9dcd48e951))
* correct package name in Dockerfile deployment command ([7024e03](https://github.com/feasibleone/blong/commit/7024e032d09d7ea48bec0c1aa07e342cde1b935f))
* deps ([b6c52e5](https://github.com/feasibleone/blong/commit/b6c52e56dc8943801908fd2fc5209361e7da3d6c))
* deps ([9644d8d](https://github.com/feasibleone/blong/commit/9644d8d07dce1dab2e64f4714fef1c5602e6ac5a))
* enhance type definitions ([2e683f0](https://github.com/feasibleone/blong/commit/2e683f0371950dff9fb6b62d9a202fed54ead434))
* enhance URL handling and response type management in HTTP adapter ([7e29eff](https://github.com/feasibleone/blong/commit/7e29effdb8241652fc6bd373fd70d1713fdfd5ff))
* ensure handler names match filenames and report mismatches ([#23](https://github.com/feasibleone/blong/issues/23)) ([62f409f](https://github.com/feasibleone/blong/commit/62f409f36b9763e19830b54b7886d14befef9e14))
* filter out falsy values in loaded modules and update tsconfig includes ([cb00bb4](https://github.com/feasibleone/blong/commit/cb00bb4afce43ad58281bc290d8f94e1cd8f887e))
* include additional package.json files in Dockerfile for build process ([40ea66e](https://github.com/feasibleone/blong/commit/40ea66e3a6780a90b8909fa4598e1a278cd69a96))
* prepare for publishing ([6c4e8b1](https://github.com/feasibleone/blong/commit/6c4e8b1da59f5c79ddda19708276d746af6a64ca))
* publish ([2fd8373](https://github.com/feasibleone/blong/commit/2fd8373198b2c9390411ce50260b65b0df7a9e20))
* publish ([1a336cc](https://github.com/feasibleone/blong/commit/1a336cc6b461090a811767922bfe7954917e187b))
* refactor event emitter usage in Watch class ([fa82762](https://github.com/feasibleone/blong/commit/fa82762fe36adc7f9b4d57c03e78b9fd0d281dfc))
* schema generation and bin script ([df2ffa9](https://github.com/feasibleone/blong/commit/df2ffa9e1128d248f2a9c749b0559ea9fad09a26))
* simplify Dockerfile build process by removing redundant rebuild step ([d4b087e](https://github.com/feasibleone/blong/commit/d4b087eb434ab06680fd3c3351b24098a5a55901))
* typings ([57141bd](https://github.com/feasibleone/blong/commit/57141bd41c21e37fc672321f039d9c33176aba2e))
* update dependencies ([3330815](https://github.com/feasibleone/blong/commit/3330815d11e64c79c6c14af05a75a903e0cbfac7))
* update dependencies and add .npmignore for blong-kopi ([c6f578d](https://github.com/feasibleone/blong/commit/c6f578de9f5989b2b8b0f062d3430a3208b37d98))
* update fastify version to 5.8.1 and adjust exports path in package.json ([b2a7078](https://github.com/feasibleone/blong/commit/b2a7078db1d5eafd36f8a64ce98a30210e0a80be))
* update fastify version to 5.8.2 in package.json and pnpm-lock.yaml ([95662c8](https://github.com/feasibleone/blong/commit/95662c8cebb05b1ede63b41a037b3b609a4378ff))
* update glob to version 13.0.3 and change log level to info ([b2f8197](https://github.com/feasibleone/blong/commit/b2f8197d8557f14eee7826a2b62045d65bbfd94f))
* update pino to version 10.3.1 and refactor logging configuration ([c2cd894](https://github.com/feasibleone/blong/commit/c2cd894b03737df1f6d341f3d1d8f85176236ddc))
* update rushstack dependencies across multiple packages to latest versions ([1d9f043](https://github.com/feasibleone/blong/commit/1d9f043899593b55cafc99bef319791ba7b55ace))
* update shebang in blong.ts to include --inspect flag ([c0637a8](https://github.com/feasibleone/blong/commit/c0637a853a473f4a3ef4378a641331b45157c44b))
* update shebang in blong.ts to remove watch and inspect flags ([6ceb175](https://github.com/feasibleone/blong/commit/6ceb1759058e9aced0a7ea9e080fe9d1912bed70))
* update type definitions ([c59d627](https://github.com/feasibleone/blong/commit/c59d6275e7f3b0fb3790a7fc52e7619ef0a825ff))
* watch and types ([19f82db](https://github.com/feasibleone/blong/commit/19f82db37f38d6f769551b24c6b205b978753ece))

## [1.9.4](https://github.com/feasibleone/blong/compare/blong-gogo-v1.9.3...blong-gogo-v1.9.4) (2026-03-14)


### Bug Fixes

* build ([9db5396](https://github.com/feasibleone/blong/commit/9db5396dfcb3a4a334f4d607a821c5090a22e7dd))

## [1.9.3](https://github.com/feasibleone/blong/compare/blong-gogo-v1.9.2...blong-gogo-v1.9.3) (2026-03-13)


### Bug Fixes

* correct package name in Dockerfile deployment command ([7024e03](https://github.com/feasibleone/blong/commit/7024e032d09d7ea48bec0c1aa07e342cde1b935f))

## [1.9.2](https://github.com/feasibleone/blong/compare/blong-gogo-v1.9.1...blong-gogo-v1.9.2) (2026-03-13)


### Bug Fixes

* simplify Dockerfile build process by removing redundant rebuild step ([d4b087e](https://github.com/feasibleone/blong/commit/d4b087eb434ab06680fd3c3351b24098a5a55901))

## [1.9.1](https://github.com/feasibleone/blong/compare/blong-gogo-v1.9.0...blong-gogo-v1.9.1) (2026-03-13)


### Bug Fixes

* include additional package.json files in Dockerfile for build process ([40ea66e](https://github.com/feasibleone/blong/commit/40ea66e3a6780a90b8909fa4598e1a278cd69a96))

## [1.9.0](https://github.com/feasibleone/blong/compare/blong-gogo-v1.8.1...blong-gogo-v1.9.0) (2026-03-13)


### Features

* add Dockerfile for blong-gogo and update deployment configuration ([56be8f4](https://github.com/feasibleone/blong/commit/56be8f4b15ebb32ca4912aec19366fd94f2c7702))

## [1.8.1](https://github.com/feasibleone/blong/compare/blong-gogo-v1.8.0...blong-gogo-v1.8.1) (2026-03-11)


### Bug Fixes

* schema generation and bin script ([df2ffa9](https://github.com/feasibleone/blong/commit/df2ffa9e1128d248f2a9c749b0559ea9fad09a26))

## [1.8.0](https://github.com/feasibleone/blong/compare/blong-gogo-v1.7.3...blong-gogo-v1.8.0) (2026-03-10)


### Features

* allow config override during start, improve types ([58c3840](https://github.com/feasibleone/blong/commit/58c3840b1543ce2d963c0bbdcb1a0712feface7c))
* support activation-based config in handler folder config.ts ([#64](https://github.com/feasibleone/blong/issues/64)) ([78e13ba](https://github.com/feasibleone/blong/commit/78e13baa0c85b05c8f31c8efa374f035e0009704))

## [1.7.3](https://github.com/feasibleone/blong/compare/blong-gogo-v1.7.2...blong-gogo-v1.7.3) (2026-03-07)


### Bug Fixes

* bin script ([e26c9ee](https://github.com/feasibleone/blong/commit/e26c9eef1785b594c3afddddb7d4b8d57be93ae2))

## [1.7.2](https://github.com/feasibleone/blong/compare/blong-gogo-v1.7.1...blong-gogo-v1.7.2) (2026-03-07)


### Bug Fixes

* update fastify version to 5.8.2 in package.json and pnpm-lock.yaml ([95662c8](https://github.com/feasibleone/blong/commit/95662c8cebb05b1ede63b41a037b3b609a4378ff))

## [1.7.1](https://github.com/feasibleone/blong/compare/blong-gogo-v1.7.0...blong-gogo-v1.7.1) (2026-03-06)


### Bug Fixes

* update fastify version to 5.8.1 and adjust exports path in package.json ([b2a7078](https://github.com/feasibleone/blong/commit/b2a7078db1d5eafd36f8a64ce98a30210e0a80be))

## [1.7.0](https://github.com/feasibleone/blong/compare/blong-gogo-v1.6.7...blong-gogo-v1.7.0) (2026-03-06)


### Features

* update package.json for blong-gogo and blong ([0bf8331](https://github.com/feasibleone/blong/commit/0bf83314fd91cb9c96062286d1957e9c960ae374))

## [1.6.7](https://github.com/feasibleone/blong/compare/blong-gogo-v1.6.6...blong-gogo-v1.6.7) (2026-03-06)


### Bug Fixes

* update dependencies and add .npmignore for blong-kopi ([c6f578d](https://github.com/feasibleone/blong/commit/c6f578de9f5989b2b8b0f062d3430a3208b37d98))

## [1.6.6](https://github.com/feasibleone/blong/compare/blong-gogo-v1.6.5...blong-gogo-v1.6.6) (2026-03-04)


### Bug Fixes

* refactor event emitter usage in Watch class ([fa82762](https://github.com/feasibleone/blong/commit/fa82762fe36adc7f9b4d57c03e78b9fd0d281dfc))

## [1.6.5](https://github.com/feasibleone/blong/compare/blong-gogo-v1.6.4...blong-gogo-v1.6.5) (2026-03-04)


### Bug Fixes

* publish ([2fd8373](https://github.com/feasibleone/blong/commit/2fd8373198b2c9390411ce50260b65b0df7a9e20))

## [1.6.4](https://github.com/feasibleone/blong/compare/blong-gogo-v1.6.3...blong-gogo-v1.6.4) (2026-03-04)


### Bug Fixes

* publish ([1a336cc](https://github.com/feasibleone/blong/commit/1a336cc6b461090a811767922bfe7954917e187b))

## [1.6.3](https://github.com/feasibleone/blong/compare/blong-gogo-v1.6.2...blong-gogo-v1.6.3) (2026-03-03)


### Bug Fixes

* deps ([b6c52e5](https://github.com/feasibleone/blong/commit/b6c52e56dc8943801908fd2fc5209361e7da3d6c))

## [1.6.2](https://github.com/feasibleone/blong/compare/blong-gogo-v1.6.1...blong-gogo-v1.6.2) (2026-03-03)


### Bug Fixes

* deps ([9644d8d](https://github.com/feasibleone/blong/commit/9644d8d07dce1dab2e64f4714fef1c5602e6ac5a))

## [1.6.1](https://github.com/feasibleone/blong/compare/blong-gogo-v1.6.0...blong-gogo-v1.6.1) (2026-03-02)


### Bug Fixes

* update rushstack dependencies across multiple packages to latest versions ([1d9f043](https://github.com/feasibleone/blong/commit/1d9f043899593b55cafc99bef319791ba7b55ace))

## [1.6.0](https://github.com/feasibleone/blong/compare/blong-gogo-v1.5.0...blong-gogo-v1.6.0) (2026-03-01)


### Features

* upgrade typebox ([6631428](https://github.com/feasibleone/blong/commit/6631428be08fda73571c3e4c623893fad668c25d))

## [1.5.0](https://github.com/feasibleone/blong/compare/blong-gogo-v1.4.0...blong-gogo-v1.5.0) (2026-02-28)


### Features

* self-contained layers ([9b80e3a](https://github.com/feasibleone/blong/commit/9b80e3a1bfd1b6843ece5dba80b619444ec93c84))

## [1.4.0](https://github.com/feasibleone/blong/compare/blong-gogo-v1.3.5...blong-gogo-v1.4.0) (2026-02-21)


### Features

* add support for custom resources in Kubernetes API adapter ([e32e0c9](https://github.com/feasibleone/blong/commit/e32e0c95c544ed72c6e075ed7e2924c10212fe4f))
* enhance Keycloak adapter with token handling and authentication improvements ([4cbcb51](https://github.com/feasibleone/blong/commit/4cbcb51590c761a46eca9ebd61322a6fccc74d1a))
* update handler to include remote parameter for improved functionality ([dedcb53](https://github.com/feasibleone/blong/commit/dedcb53f7993db7d6d5c0a7db516f290352d53cc))

## [1.3.5](https://github.com/feasibleone/blong/compare/blong-gogo-v1.3.4...blong-gogo-v1.3.5) (2026-02-17)


### Bug Fixes

* enhance type definitions ([2e683f0](https://github.com/feasibleone/blong/commit/2e683f0371950dff9fb6b62d9a202fed54ead434))

## [1.3.4](https://github.com/feasibleone/blong/compare/blong-gogo-v1.3.3...blong-gogo-v1.3.4) (2026-02-16)


### Bug Fixes

* enhance URL handling and response type management in HTTP adapter ([7e29eff](https://github.com/feasibleone/blong/commit/7e29effdb8241652fc6bd373fd70d1713fdfd5ff))

## [1.3.3](https://github.com/feasibleone/blong/compare/blong-gogo-v1.3.2...blong-gogo-v1.3.3) (2026-02-15)


### Bug Fixes

* update glob to version 13.0.3 and change log level to info ([b2f8197](https://github.com/feasibleone/blong/commit/b2f8197d8557f14eee7826a2b62045d65bbfd94f))

## [1.3.2](https://github.com/feasibleone/blong/compare/blong-gogo-v1.3.1...blong-gogo-v1.3.2) (2026-02-15)


### Bug Fixes

* update pino to version 10.3.1 and refactor logging configuration ([c2cd894](https://github.com/feasibleone/blong/commit/c2cd894b03737df1f6d341f3d1d8f85176236ddc))

## [1.3.1](https://github.com/feasibleone/blong/compare/blong-gogo-v1.3.0...blong-gogo-v1.3.1) (2026-02-15)


### Bug Fixes

* watch and types ([19f82db](https://github.com/feasibleone/blong/commit/19f82db37f38d6f769551b24c6b205b978753ece))

## [1.3.0](https://github.com/feasibleone/blong/compare/blong-gogo-v1.2.0...blong-gogo-v1.3.0) (2026-02-14)


### Features

* add GitHub adapter with release management capabilities and update CI publish scripts ([bf01aef](https://github.com/feasibleone/blong/commit/bf01aef3d7028edaf6770321a5542bc2651665e0))


### Bug Fixes

* ensure handler names match filenames and report mismatches ([#23](https://github.com/feasibleone/blong/issues/23)) ([62f409f](https://github.com/feasibleone/blong/commit/62f409f36b9763e19830b54b7886d14befef9e14))

## [1.2.0](https://github.com/feasibleone/blong/compare/blong-gogo-v1.1.1...blong-gogo-v1.2.0) (2026-02-08)


### Features

* enhance error handling in Keycloak adapter and add MySQL configuration to Knex adapter ([2124a53](https://github.com/feasibleone/blong/commit/2124a531496291f62c337232be5488a79461db51))
* enhance logging details and improve MongoDB adapter operations ([11eb992](https://github.com/feasibleone/blong/commit/11eb992ec31799b84c50344f98e1c6900cfef671))
* implement Proxy-based error system with simplified syntax and comprehensive tests ([3ac942a](https://github.com/feasibleone/blong/commit/3ac942a2782c94bd2c338fa185e07858a4c52669))


### Bug Fixes

* typings ([57141bd](https://github.com/feasibleone/blong/commit/57141bd41c21e37fc672321f039d9c33176aba2e))

## [1.1.1](https://github.com/feasibleone/blong/compare/blong-gogo-v1.1.0...blong-gogo-v1.1.1) (2026-02-05)


### Bug Fixes

* update dependencies ([3330815](https://github.com/feasibleone/blong/commit/3330815d11e64c79c6c14af05a75a903e0cbfac7))

## [1.1.0](https://github.com/feasibleone/blong/compare/blong-gogo-v1.0.0...blong-gogo-v1.1.0) (2026-02-04)


### Features

* run as TypeScript ([fd7c6b7](https://github.com/feasibleone/blong/commit/fd7c6b7af21a76e88c35fddd9a4158852ac71ff6))

## 1.0.0 (2026-02-03)


### Features

* enhance adapter type definitions to support additional context ([326ad32](https://github.com/feasibleone/blong/commit/326ad32c0a8d012c7cabead3b2f33e7793c9f7ab))
* implement blong-chain parallel testing framework ([589bd58](https://github.com/feasibleone/blong/commit/589bd587be36d9afea3e7eea35dea63c30255ee6))
* implement rest-fs extension ([29589ff](https://github.com/feasibleone/blong/commit/29589ff7d57cb078b36c9df36ce27f513b9a8b3a))
* nested test context integration and error reporting capabilities ([9470aa5](https://github.com/feasibleone/blong/commit/9470aa53c9d1d676cd50ff004b3bb0eea491d782))
* update @rushstack/heft and related plugins to latest versions ([f6a6f26](https://github.com/feasibleone/blong/commit/f6a6f26bdfd9cc95cb1322461aa494f5345bd821))
* update dependencies across multiple packages ([03269a5](https://github.com/feasibleone/blong/commit/03269a57405c53a3d6f16f7531f82cde2a31c5cc))
* update dependencies and enhance type definitions ([d969546](https://github.com/feasibleone/blong/commit/d96954690b8f7393d1b43866ce8b18afe951129a))


### Bug Fixes

* add ESLint configuration files and update Watch class to use FSWatcher type ([3f358aa](https://github.com/feasibleone/blong/commit/3f358aae8c00cd223a612225f4663a054678d198))
* build errors ([9da9b4a](https://github.com/feasibleone/blong/commit/9da9b4a06f1d6cb6d1526dbe0b9c8d9dcd48e951))
* filter out falsy values in loaded modules and update tsconfig includes ([cb00bb4](https://github.com/feasibleone/blong/commit/cb00bb4afce43ad58281bc290d8f94e1cd8f887e))
* prepare for publishing ([6c4e8b1](https://github.com/feasibleone/blong/commit/6c4e8b1da59f5c79ddda19708276d746af6a64ca))
* update shebang in blong.ts to include --inspect flag ([c0637a8](https://github.com/feasibleone/blong/commit/c0637a853a473f4a3ef4378a641331b45157c44b))
* update type definitions ([c59d627](https://github.com/feasibleone/blong/commit/c59d6275e7f3b0fb3790a7fc52e7619ef0a825ff))
