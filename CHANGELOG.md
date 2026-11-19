# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-11-19

Compatibility release for DeepSeekRuntime 0.2.2-rc.5. No host or client behavior
changes: the 1.0.0 sources compile, test and build unchanged against rc.5.

### Changed

- `engines.dsh` and the five DSH peer dependencies now declare
  `0.2.2-rc.3 || 0.2.2-rc.5`. rc.5 rejects a plugin whose own `engines.dsh` does
  not satisfy the running version and skips its whole bundle, so v1.0.0 cannot
  mount on rc.5.
- Dev dependencies build and test against `0.2.2-rc.5`.
- `package.json`, the locale descriptions and the READMEs name both supported
  releases.

### Notes

- rc.5 auto-selects a search provider per model route while none is configured:
  `deepseek-official` on the `deepseek-official` and `deepseek-account` routes,
  `deepseek-search-api` on every other route and outside a model request. The
  bundle patch still pins `web.searchProvider: thin-search`, so Thin Search wins
  whenever it is selected; choosing automatic selection in the built-in web
  search settings hands selection back to DSH.
- rc.4 renamed DeepSeek's streamed content refusal code to `CONTENT_REFUSED`.
  Enhancement failures already surface the provider message, so no code change
  was needed.
- The F2/F3/F6 client polish items formerly planned for v1.0.1 remain open and
  move to a later release.

### Verification

- `npm run check` against DSH 0.2.2-rc.5: host and client typechecks, the host,
  client and integration suites, both tsdown builds and the built-client
  ModuleLoader smoke.
- The rc.5 compatibility gate accepts the new range; the rc.3 runtime still
  satisfies it.

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

### Fixed

- Engine fallback now gives each chain member a fair share of the remaining total
  search budget (`floor(remaining / remaining engines)`, clamped to 6 s through
  `engineTimeoutMs`). A slow SearXNG/DDG prefix can no longer consume the whole
  35-second budget and starve Bing or AnySearch when `timeRange` puts the
  time-capable engines first.
- #1: a time window can no longer degrade silently. When the engine that actually
  answers cannot apply a native filter (Bing or AnySearch), the result note says
  the results are not time-filtered; the existing "preferred engine failed" note
  is unchanged and both notes can appear together.
- #2: SearXNG sub-path deployments work again. Instances are joined as
  `<instance>/search`, so `https://host/searxng` requests `/searxng/search`
  instead of `/search`.
- #4 / N4: absolute dates are read as a local calendar day, and a date after the
  local today is rejected as invalid instead of being clamped to one day, in both
  the string and the `{ after }` forms.
- #7: `advanced_search` rejects an unknown `engine` value with the list of valid
  engines instead of silently ignoring it, and the parameter now documents that
  the hint is a preference: a time window still puts time-capable engines first.
- #10 / N1: DuckDuckGo HTML and DuckDuckGo Lite restore `publishedAt`. A bounded
  timestamp read emits `YYYY-MM-DD` only when the text parses as a real date, and
  DuckDuckGo Lite now parses each result row in document order, so a result without
  a timestamp can no longer inherit the next result's date or snippet.
- #11 / N3: every failure a tool throws is a `WebError`. Adapter failures map to
  `WEB_ABORTED` (cancellation) or `WEB_PROVIDER_ERROR` with the original error as
  `cause`, and argument validation (unknown `engine`, unknown or disabled platform,
  missing `query`, invalid `timeRange`) now raises `WEB_INVALID_REQUEST` instead of
  a bare `Error`. `free_search_test` still reports per-engine failures as data.
- #12: `SearchEngine.supportsTimeRange` is the single source of truth for chain
  ordering and result notes; the duplicate id-based helper is gone. A test with a
  capability-flipped fake engine fails if ordering ever returns to an id check.
- #13: one `raceWithSignal` helper in `src/util/abort.ts` replaces the three
  per-module implementations, with unchanged error messages and codes.
- #14: both tools reuse `clampMaxResults`, so `NaN`, `undefined`, `0` and
  oversized limits normalize to `5`, `5`, `1` and `10` in one place.
- #3 / N2: `web/providers-changed` events are drained. An event that arrives during
  a read or during a follow-up read triggers another read until no request remains,
  and disposal stops the loop immediately; no event is dropped while a chain of
  reads is in flight.
- #5 (F1): validation errors are stored per settings field. A successful write to
  one field no longer clears another field's error or resets its draft.
- #6 (F5): the page accepts Windows drive and UNC absolute prompt paths in
  addition to POSIX and `~/` forms; relative paths stay rejected and the Host
  remains authoritative for its own platform.
- #8: the pill menu closes when focus leaves the control or the trigger becomes
  disabled; Escape, arrow keys and Home/End are unchanged.
- #9: a failed provider refresh no longer disables the selector while the last
  accepted list is still usable; the error note and Retry stay visible.

### Known issues (deferred past v1.0.1)

These are client-side polish items recorded by the v1.0.0 cross-review. They do
not affect search, configuration persistence or provider switching. F1 and F5 are
fixed above and removed from this list; the remaining items are not part of the
v1.0.1 compatibility release.

- F2: `PillSelect` `aria-labelledby` names the control but omits the current value;
  screen readers should hear the selected label.
- F3: the pill menu has no flip, max-height or overflow handling, so it can be
  clipped near the viewport edge.
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
