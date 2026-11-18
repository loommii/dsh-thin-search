# Commit Style (dsh-thin-search)

This document defines the commit-message convention for the **dsh-thin-search**
repository only. It replaces the previous commit-style document, which described
an unrelated project. Keep changes to this file aligned with the conventions
actually used by this repository.

## Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

- `scope` is optional but recommended for changes confined to one module.
- Keep the subject imperative and at most 72 characters.
- Do not end the subject with a period.
- Do not use emoji in commit messages, code, documentation or UI copy.
- English or Chinese subjects are both acceptable; keep one language per commit.

## Types

| Type | Use for |
|---|---|
| `feat` | User-visible capability. |
| `fix` | Defect repair. |
| `refactor` | Internal restructuring with no behavior change. |
| `perf` | Measured performance improvement. |
| `test` | Tests or fixtures only. |
| `docs` | Documentation only. |
| `build` | Build system, tsdown or packaging changes. |
| `ci` | GitHub Actions or release automation. |
| `chore` | Maintenance that fits nowhere else. |
| `release` | Version bump, changelog and tag preparation. |

Do not use vague types such as `update`, `misc` or `wip`.

## Scopes

| Scope | Area |
|---|---|
| `host` | `src/index.ts`, `src/config.ts`, plugin registration. |
| `search` | `src/search/**`: engines, HTTP client, cache, pipeline, time ranges. |
| `enhance` | `src/enhance/**`: optional model enhancement and prompt file. |
| `platforms` | `src/platforms/**`: the eight platform adapters. |
| `tools` | `src/tools/**`: the three Agent tools. |
| `client` | `src/client/**`: page, command, locales, styles. |
| `tests` | `test/**`. |
| `deps` | `package.json`, `package-lock.json`, peer versions. |
| `docs` | `README.md`, `CHANGELOG.md`, `docs/**`. |
| `release` | Version bump, changelog and tag preparation. |

Use lowercase, single-word scopes. Omit the scope for a change that spans several
modules.

## Body

Write a body when the change is not self-evident:

- explain the root cause and how to reproduce a defect;
- record a tradeoff or a compatibility decision;
- list a multi-step migration when the subject cannot carry it.

Do not narrate the diff. Reference the verification command or the failing test
instead of pasting large logs.

## Breaking changes

Mark a breaking change with `!` and explain it in the body:

```
feat(host)!: require DSH 0.2.2-rc.3

BREAKING CHANGE: DSH 0.1.x and 0.2.0-0.2.1 are no longer supported.
```

## Releases

- Bump `package.json` and add a `CHANGELOG.md` entry in the same change.
- Use `release: v1.0.0` for the release commit after the version and
  changelog are final.
- Tag the reviewed commit as `v1.0.0`; do not tag a working branch.

## Examples

```
feat(search): add SearXNG instance fallback
fix(client): keep the engine select disabled while a save is in flight
test(integration): cover tool cancellation through a stubbed fetch
docs: document the v1.0.0 migration fields
build: run the client bundle smoke after the client build
ci: verify Node 24.9 with npm ci, check and pack
release: v1.0.0
```

## Enforcement

There is no commit-msg hook in this repository. Reviewers check the subject and
the presence of a changelog entry for user-visible changes. Automation runs
through GitHub Actions (Node 24.9, `npm ci`, `npm run check` and
`npm pack --dry-run`).
