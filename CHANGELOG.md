# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-18

Complete rewrite for DeepSeekRuntime 0.2.2-rc.3. v1.0.0 is a new baseline: it
does not carry compatibility branches for DSH 0.1.x, 0.2.0 or 0.2.1.

### Added

- Native `WebSearchProvider` with id `thin-search`, localized en/zh description and
  `available() => true`; no `ready()` hook is implemented.
- Five free engines with automatic fallback: Bing (default), AnySearch, SearXNG,
  DuckDuckGo HTML and DuckDuckGo Lite. Per-engine timeout plus a 35-second total
  budget; network errors, request timeouts and 5xx responses retry once.
- Time ranges: fixed tiers `day`, `week`, `month`, `year`; relative values
  such as `12h`, `3d`, `2mo`, `1y`; and absolute dates such as
  `2026-07-01`. DDG and SearXNG convert absolute dates to the nearest tier.
- LRU result cache (50 entries) with a minutes-based TTL. The cache is consulted
  before enhancement, so a hit never spends model tokens.
- Optional search enhancement through the current Agent model, with an exclusive
  `provider:model` override and a prompt file at `enhanceSystemPromptPath`.
- Eight platform adapters: GitHub, V2EX, Bilibili, Reddit, Hacker News,
  Stack Overflow, Wikipedia and npm.
- Three Agent tools: `free_search_test`, `platform_search` and `advanced_search`.
  Each forwards `exec.signal`, declares `timeoutMs` and renders `ContentBlock[]`.
- Dynamic system-prompt section that names the selected provider and the enabled
  platform limits.
- A native `plugins.bundle.config` settings card on the installed bundle page
  (Plugins → Installed → dsh-thin-search → Configuration) and the
  `/thin-search-engine` command. The card is not a Plugins row configuration and
  has no global Settings item. Both surfaces write through ConfigForms; the
  global provider switch writes `web.searchProvider` immediately, with no
  restart and no profile patch write.
- Integration suite under `test/integration/` covering provider registration,
  config schema, cache/time-range, tool cancellation, URL validation, the built
  client form mapping and release packaging.
- Prompt-file reads are abortable with the search, capped at 64 KiB, and accept
  only `~/...` or absolute paths; a relative path falls back to the built-in prompt.
- HTTP responses are classified before their bodies are read; bodies stream under
  the `maxBodyBytes` cap and the reader is cancelled as soon as the cap is crossed.
- Tool render text escapes untrusted Markdown label and URL characters.
- GitHub Actions CI on Node 24.9: `npm ci`, a source build before tests,
  `npm run check`, a committed-`lib` drift check and `npm pack --dry-run`.
- `LICENSE` (MIT) and this changelog.

### Changed

- Configuration is exactly nine volatile fields: `provider`, `platforms`,
  `cacheTtl`, `searchEnhance`, `enhanceModel`, `enhanceSystemPromptPath`,
  `bingMarket`, `region` and `searxngInstances`.
- Bing is the default preferred engine (was AnySearch in v0.6.x).
- The bundle patch writes only `web.searchProvider: thin-search` and
  `web.fetchProvider: http`; every later provider switch goes through ConfigForms.
- Search requests now use the global `fetch` implementation and the DSH HTTP
  client; there is no plugin-level proxy, custom bridge or private YAML/JSON store.
- The settings entry is the installed bundle's configuration card:
  `plugins.bundle.config` keyed by `dsh-thin-search` and reached through
  Plugins → Installed → dsh-thin-search → Configuration. It is not a Plugins row
  configuration and there is no global Settings item.
- Every settings control writes its field immediately through `ConfigForm.set`;
  the owner form props and the Save/Discard footer are gone.

### Removed

- Compatibility code for DSH 0.1.x, 0.2.0 and 0.2.1.
- `lib/proxy.js`, `undici`, `@deepseek-ai/dsh-atomic-write`, the
  `/api/dsh-thin-search-settings` bridge, the engine-mode managed block and all
  profile-patch writes.
- The UI test-engine button and the model picker; use the `free_search_test` tool
  and the `provider:model` text field instead.
- Legacy configuration fields `proxy`, `cache` and `enhanceSystemPrompt`.
- The stale v0.6 root tests `test/compatibility.test.js` and
  `test/client-plugin-page.test.js`; their coverage moved to the integration suite.

### Migration

#### From v0.6.x or earlier

1. Upgrade the runtime to DSH 0.2.2-rc.3 and Node 24.9 or newer. v1.0.0 is not
   supported on older DSH releases: compatibility is declared in `engines.dsh` and
   the peer dependencies, but the plugin does not enforce a runtime version gate.
2. Replace the `proxy` field with the DSH global proxy policy: set
   `HTTP_PROXY` / `HTTPS_PROXY` (and, when needed, `NO_PROXY`) before
   starting DSH. Thin Search now uses the shared HTTP client, so there is no
   plugin-scoped proxy setting anymore.
3. Delete the `cache` boolean; `cacheTtl` now also acts as the on/off switch
   (`0` disables) and defaults to `5` minutes.
4. Replace `enhanceSystemPrompt` with `enhanceSystemPromptPath`. The plugin no longer
   stores prompt text in `cordis.patch.yml`; write the prompt to a file such as
   `~/.dsh/thin-search/system-prompt.md` and point the field at it. Empty uses the
   built-in prompt, and an unreadable file falls back to it with a warning.
5. Remove any manually managed `web` engine-mode block from a profile patch. The
   bundle patch now pins the provider once; later switches use
   `configForms.get("web").set("searchProvider", id)` and apply live.
6. Provider id `thin-search` and the three tool names are unchanged, so existing
   Agent instructions keep working. The `thin-search` settings schema keeps the same
   field names for engines, platforms, enhancement and market/region.
7. Delete `tools.mode` and `tools.maxParallelSubCalls` from the `tools` row in the
   profile patch. DSH 0.2.2-rc.3 declares both fields as `z.never()` and rejects
   every value. The composition mounts the executor instead, for example the
   native or PTC tool-executor bundle (`@deepseek-ai/dsh-tool-executor-native` or
   `@deepseek-ai/dsh-tool-executor-ptc`); do not set either field.

#### From v1.0.0 release candidates

No further migration is required. The config schema, provider id, tool names,
locale keys and patch file are frozen for the v1.0.0 release.

### Verification

- `npm run check` runs host/client typechecks, the host, client and
  integration suites, both tsdown builds, and the built-client ModuleLoader smoke.
- `npm pack --dry-run` ships only `lib/index.js`, `lib/client.js`,
  `locale/*.json`, `icon.svg`, `cordis.patch.yml`, `CHANGELOG.md`, `README.md`,
  `LICENSE` and `package.json`.
- Most integration files load the built `lib/index.js` or `lib/client.js`; the
  cache, time-range and config helpers import the source modules directly. The
  suite uses a stubbed network and does not call live search engines.

### Known issues (planned for v1.0.1)

These are client-side polish items recorded by the v1.0.0 cross-review. They do
not affect search, configuration persistence or provider switching.

- F1: a global error slot can be cleared by an unrelated successful write while an
  invalid text draft is reset; the error should stay scoped to its field.
- F2: `PillSelect` `aria-labelledby` names the control but omits the current value;
  screen readers should hear the selected label.
- F3: the pill menu has no flip, max-height or overflow handling, so it can be
  clipped near the viewport edge.
- F5: Windows/UNC prompt paths are rejected by the page validation; the Host
  accepts platform absolute paths (including `C:\\...` on Windows), so the page is
  the blocker. The platform-specific path form will be added in v1.0.1.
- F6: rapid same-field optimistic writes can briefly revert the displayed value
  until the Host snapshot settles.
- Test gaps to close with those fixes: runtime writable/status guard, page
  write-failure note and `PillSelect` keyboard interaction.

Live-GUI verification limitation: v1.0.0 was verified with unit, SSR and
interaction tests, the built-bundle ModuleLoader smoke and the integration
harness; the installed-plugin configuration page was not exercised in a running
DSH GUI in this environment.

## [0.6.0] - 2026-09-26

Previous baseline, preserved for reference only. It supported DSH 0.1.7-0.2.1,
included a plugin-scoped HTTP proxy, an HTTP settings bridge and a UI engine test
button, none of which exist in v1.0.0. See the v1.0.0 Migration section above for
the upgrade path.
