# Changelog

All notable changes to Realm are tracked through conventional commits and
Release Please.

## [0.2.0](https://github.com/nicepkg/realm/compare/v0.1.0...v0.2.0) (2026-05-31)


### Features

* **assistant:** natural-language intent routing to world/role/state/God actions ([9b90fe6](https://github.com/nicepkg/realm/commit/9b90fe6cf2b9f2c0d2297deb6e91cee87b117a12))
* **docs:** rebuild hero, mobile nav, monogram avatars, and user-facing value props ([df67979](https://github.com/nicepkg/realm/commit/df6797966d179880d4c9348ecc3946670102978c))
* **docs:** reframe the docs site around the natural-language-first product ([e4f16d8](https://github.com/nicepkg/realm/commit/e4f16d84dfc009137c8cb5adf6b02364d67bd2fc))
* **examples/docs:** add boardroom-saga world, docs flow-showcase, humanized inspect ([054a832](https://github.com/nicepkg/realm/commit/054a8329479a07a037bedc2e03cf305d32e9f35b))
* finish realm messenger rebuild gates ([7830c3c](https://github.com/nicepkg/realm/commit/7830c3cac4423a31b2fee527d210a4633721b362))
* make web settings functional ([91c5bbe](https://github.com/nicepkg/realm/commit/91c5bbe4e309b387b390362c147a1c247955b49f))
* **nl:** promote model-backed intent router to the primary live path ([204b5c9](https://github.com/nicepkg/realm/commit/204b5c93f511692db981e1e5f7c1379291740f4d))
* rebuild realm command center ([73741fd](https://github.com/nicepkg/realm/commit/73741fd9132a3021f782b8215043a1b1525a43c5))
* refine realm messenger and tui flows ([1d435ec](https://github.com/nicepkg/realm/commit/1d435ec3e9eb5d91e35b9b1f7971744397cebc60))
* **release:** add npm publish gate and docs polish ([7b847ce](https://github.com/nicepkg/realm/commit/7b847ce0ce3eed5654cc63865c78301ee22ece78))
* **server:** add project trust endpoint, policy gate, audit projection, and high-risk confirm ([e4243ad](https://github.com/nicepkg/realm/commit/e4243ad0d1283da7775ad80c89787f071deb4eb6))
* **server:** wire natural-language actions to real persistence ([3ff0472](https://github.com/nicepkg/realm/commit/3ff0472089eb283a3578b85535cfdbf341796c23))
* support configured role avatars ([d3a7acb](https://github.com/nicepkg/realm/commit/d3a7acb09478d44891167710ba64c01b6e13ca75))
* surface denied access recovery in inspector ([1cde283](https://github.com/nicepkg/realm/commit/1cde283cba8f0a56b80dc65ac27deeda01abeb0f))
* **tui:** add locale detection and switch, world/role/simulation commands, scrollback, and key fixes ([214a10c](https://github.com/nicepkg/realm/commit/214a10c72e6af6507b1e0bbd7f51aa85a8769b42))
* **tui:** conversational natural-language commander ([1b5a065](https://github.com/nicepkg/realm/commit/1b5a0654b537ad1cdd72f3488cd63d1097761b3b))
* **tui:** implement localization for project templates and add rollback functionality ([28ffa10](https://github.com/nicepkg/realm/commit/28ffa10e4acf6550879ab6486a5eff5367477938))
* **web:** rebuild around a natural-language-first chat command center ([b8cc666](https://github.com/nicepkg/realm/commit/b8cc666ded8755bcc299a6761a8333a420a91f7b))
* **web:** rebuild messenger identity/avatars, world manager, i18n switcher, and send recovery ([17e7c0a](https://github.com/nicepkg/realm/commit/17e7c0ac3a04c165881ed3b5790bd99da0930097))


### Bug Fixes

* **app-service:** answer role turns in fake runtime and emit turn.failed instead of swallowing rejections ([abe6fe0](https://github.com/nicepkg/realm/commit/abe6fe0f92e20d6b523bacaaf98b7c082653d76d))
* **app-service:** widen turn idempotency scan to avoid duplicate turn.failed events ([cbbe755](https://github.com/nicepkg/realm/commit/cbbe755982e9b39d5c582525c73b467debf8d45a))
* compose group avatars from real members ([b9b1c22](https://github.com/nicepkg/realm/commit/b9b1c2241148461277996f89d6f2fe18d795fe62))
* decouple tui smoke from web build ([0327ff2](https://github.com/nicepkg/realm/commit/0327ff2fb8ef359f0b64507a29caf7d091bff39b))
* **docs:** replace dead ellipsis button with a real top-bar action menu in the product preview ([17d7cd1](https://github.com/nicepkg/realm/commit/17d7cd1c35d9e349d5d822f978c077ca609051ef))
* make world manager search functional ([481052f](https://github.com/nicepkg/realm/commit/481052f03330968a059a68ec001277ba146804fe))
* **nl:** recover real-model set-rule misclassification + humanize boardroom inspect tree ([eb07774](https://github.com/nicepkg/realm/commit/eb0777484df9b3d9e3cbf908fb181d2f00d232a4))
* **nl:** split role name from profession in add-role and humanize boardroom top-level roles container ([3d712d8](https://github.com/nicepkg/realm/commit/3d712d8ba86669c5eddc4f6ef9a832e0eef2cb58))
* **scripts:** assert capture-plan dirs with path.resolve so Windows CI passes ([478a6b7](https://github.com/nicepkg/realm/commit/478a6b7a79c101d58d624fef0693fa74f770e6f8))
* **scripts:** raise package smoke entry ceiling for the code-split web bundle ([bf30b53](https://github.com/nicepkg/realm/commit/bf30b5362773d3d75c3cf7eff3306533869d6864))
* seedAndHealFoldGates now seeds both the id and content-fingerprint gates from the destination scope's persisted transcript read straight from storage (loadTranscript), unioned with the in-render turns, so the destination's bound ids + fingerprints are in the gates synchronously before any fold can fire -- fully decoupled from React commit timing. Adds a localStorage-stubbed regression covering the exact reload window. Live-verified: create NL world + add role + run turn, reload x4, bubble count stays at exactly 1. ([077685e](https://github.com/nicepkg/realm/commit/077685e4c994165a4759842e3b9448fa5366b680))
* **server:** keep SSE stream alive with heartbeat and disable idle timeout ([88b050b](https://github.com/nicepkg/realm/commit/88b050b5c848bc22f755baac4f5a0c7844e16e74))
* sharpen wechat messenger avatars ([07d65fe](https://github.com/nicepkg/realm/commit/07d65fecd2315e469169f8d29c1587f64bac9d0b))
* stabilize ci smoke gates ([3e3f021](https://github.com/nicepkg/realm/commit/3e3f021e3e23655d8fd01d20fb6d289b790f49aa))
* stabilize tui run-role confirmation test ([aa9c4f3](https://github.com/nicepkg/realm/commit/aa9c4f3b4ed142cb3ff77f265fd9066f2d515d84))
* surface stale config patch conflicts ([489dd2d](https://github.com/nicepkg/realm/commit/489dd2d3db7357a4c62df1472722bf6add7034c9))
* tighten wechat composer chrome ([eecdebc](https://github.com/nicepkg/realm/commit/eecdebc8838db1b00870d41b67dabe6903398433))
* **tui:** localize all confirmation dialogs across en and zh-CN ([57762c0](https://github.com/nicepkg/realm/commit/57762c00e82cadf4b0dc22335db4355c78c9e8c9))
* **tui:** localize the Ctrl+C exit hint across en and zh-CN ([2b0f61a](https://github.com/nicepkg/realm/commit/2b0f61acbf45f9a07254a137ae7d8fb519e64046))
* **tui:** make draft test path portable ([aa7528e](https://github.com/nicepkg/realm/commit/aa7528e4129a23c35420119dd1eac74b9f67670c))
* **tui:** parse draft smoke payload ([2b7d7ff](https://github.com/nicepkg/realm/commit/2b7d7ff85438ab39adfa338417927640abb874eb))
* **web/god-chat:** seed reload fold gate from persisted transcript to stop role-bubble accumulation ([077685e](https://github.com/nicepkg/realm/commit/077685e4c994165a4759842e3b9448fa5366b680))
* **web/nl:** reuse state-humanize labels in context rail + grammar-based role-name split ([31b8cc3](https://github.com/nicepkg/realm/commit/31b8cc362cfe8a2fd9ab0523a238d7079e87ec80))
* **web:** add mobile conversation rail sheet, gate God adjudication entry, and recover dropped event streams ([4c1f711](https://github.com/nicepkg/realm/commit/4c1f7117d7b7bd4a0ed258d574bcd472e9adad4e))
* **web:** canonicalize web import specifiers so SSR tests are deterministic cross-platform ([74a6565](https://github.com/nicepkg/realm/commit/74a6565e5e02e803597eb1db67004f3c33ccf46d))
* **web:** complete the use-stick-to-bottom test mock so it cannot break sibling suites ([01ffefc](https://github.com/nicepkg/realm/commit/01ffefc191d0ad6de9d5ad441ca3c841f73a58e6))
* **web:** expose message visibility metadata ([9b59f9d](https://github.com/nicepkg/realm/commit/9b59f9dd0c8e38ea95fd1526229f1b32d9c8ce8b))
* **web:** surface model-provider failures as provider errors, not re-login ([4da484e](https://github.com/nicepkg/realm/commit/4da484e455953c12d0652884cdb4693931da4ca6))

## 0.1.0

- Initial local-first Realm CLI runtime with Web, TUI, config, role, world,
  event, simulation, and Pi package integration foundations.
