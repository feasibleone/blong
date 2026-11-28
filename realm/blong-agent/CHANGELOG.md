# Changelog

## [0.3.0](https://github.com/feasibleone/blong/compare/blong-agent-v0.2.0...blong-agent-v0.3.0) (2026-11-28)


### Features

* improve deployment handling ([cb3aeac](https://github.com/feasibleone/blong/commit/cb3aeacee38b61db9946675ed1646c9bf185a516))
* Kafka adapter provisioning and feed mode ([b64407e](https://github.com/feasibleone/blong/commit/b64407ebb19197cd05efda71b85d2b438d8e8bc2))


### Bug Fixes

* E2E/timeout failures in CI ([2b447bc](https://github.com/feasibleone/blong/commit/2b447bc7b2b76723e2f0e95cfe2bfaf3ce452236))

## [0.2.0](https://github.com/feasibleone/blong/compare/blong-agent-v0.1.0...blong-agent-v0.2.0) (2026-11-25)


### Features

* agent persona ([492b178](https://github.com/feasibleone/blong/commit/492b1788c1db8b81fcb11757bdae1b35c353eac4))
* agent session UI ([ee74722](https://github.com/feasibleone/blong/commit/ee747220fb431bef36ac091ded8f01d112eb4f34))
* align blong-log with lukaot ([21bba9e](https://github.com/feasibleone/blong/commit/21bba9e8207720a02c934dbd3a8c054de8402dcf))
* blong-agent ([ae5f0fb](https://github.com/feasibleone/blong/commit/ae5f0fb3992e42e74888ca5ac26afe79a9becaf0))
* Copilot agent ([9df1ecc](https://github.com/feasibleone/blong/commit/9df1eccaa7e430d42fcc8cea3d008b1a65393c87))
* deploy blong-agent ([098f08a](https://github.com/feasibleone/blong/commit/098f08ad542badbebb644c191cdc74762f0ddacc))
* improve menu handling ([a12eb93](https://github.com/feasibleone/blong/commit/a12eb93a0c0b3fc2f37167a0c4ceaebb21faa54f))
* improve planning and GitHub sync ([0baa800](https://github.com/feasibleone/blong/commit/0baa8000acdca6f102d88471822e855acf6676fc))
* lukaot ([b845604](https://github.com/feasibleone/blong/commit/b8456044641c38ec9fe070f6be72bcc1a82140e8))
* support Anthropic and gateway providers ([ba418cc](https://github.com/feasibleone/blong/commit/ba418cca748fa10ea15d54c1208896f935cfe6c7))


### Bug Fixes

* CI failure ([7675114](https://github.com/feasibleone/blong/commit/76751145193b20e563fb782ceff7a091bef3d9c9))
* commander screenshots ([e9f9ca3](https://github.com/feasibleone/blong/commit/e9f9ca3fd23462a08dc410b13b61952c88e75f9f))
* session rendering during a real test ([d707c47](https://github.com/feasibleone/blong/commit/d707c47cbfd5a79988422a5ad851d6ff550db682))
* trimmed question in Slack ([537257e](https://github.com/feasibleone/blong/commit/537257e3abd8ff2835b1eac1b3a7e4eb39d058d3))

## 0.1.0 (2026-11-25)

The realm's first deployable release: the agent suite that takes the chat deployment's place — its
two addresses, its Slack and Viber paths, its database and the account rows in it — with the chat
realm carried as a child so `chat.*` keeps answering from the same host.
