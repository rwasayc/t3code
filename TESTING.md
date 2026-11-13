# T3 Android Source testing

Owner: this repository's maintainer and sole serial integrator. This is the local
profile for `engineering/project-testing@1.0.0`, based on the immutable organization
source release manifest SHA256
`8692da6e7cd0f110df8a023dff209074bc68ce4ea8f3b297be65983f4e4e2e46`.
The canonical skill is installed from `https://skills.lab.localhost` at that exact
version, artifact SHA256
`090ea71a804eed82cad2b94f62ed2a3bf70653d29dfb0d976b1cd682f17a5c36`
(40954 bytes). On 2026-11-13, target `project-testing-v1` passed
`local list --verify`, real-entry source inspection and `doctor --offline`;
installation history is committed. All 17 payload files match the release's
mode, size and SHA256. Existing AGENTS and other skills were preserved.

The installed [Skill](.agents/skills/project-testing/SKILL.md),
[policy](.agents/skills/project-testing/references/docs/testing-policy/v1/POLICY.md),
[adoption inventory](.agents/skills/project-testing/references/docs/testing-policy/v1/ADOPTION.md)
and [template](.agents/skills/project-testing/references/docs/testing-policy/v1/PROJECT-TESTING.template.md)
were explicitly read for this profile. Installation validates the skill, not the
new test commands or remote CI: their behavioral validation is still NOT_RUN.
Existing stricter [writing/time/Scope rules](docs/internals/testing.md) and AGENTS
apply.

## Scope, directory and visibility

TypeScript/React/Effect tests normally sit beside source as `foo.test.ts` or
`Foo.test.tsx`; names describe behavior, not one file per function. Test internal
behavior through the smallest real module boundary. Do not export a private
production helper just for tests, clone its implementation, bypass module
visibility, or lock its source text/AST as a behavioral oracle. Shared test helpers
belong near their users; extract a narrow testkit only for actual reuse.

Root `vite.config.ts` routes repository-root selections to server, web, desktop,
mobile and client-runtime configs; other packages borrow the root config from
inside their package. Vitest's default `.test`/`.spec` JS/TS patterns apply unless
a package narrows them. The root excludes `.repos`, node_modules, output/cache
paths and `.github/scripts/**/*.test.cjs` (Node owns those). Desktop additionally
owns `native/kde-snap-shot/src/*.test.ts`. New `.spec` names must match their actual
package include: they are not automatically accepted by all child configs.

- Web: unit `src/**/*.test.{ts,tsx}` excludes `*.browser.test.*`; browser owns
  exactly `src/**/*.browser.test.{ts,tsx}`. Render scenarios `test/*.renders.tsx`
  run only via `vp run report:renders`. Browser component tests are not full e2e.
- Client-runtime: `src/**/*.test.ts` only. A new TSX test requires a discovery
  decision, not an assumed pass.
- Mobile: `**/*.test.{ts,tsx,mjs}` plus the explicit `reactTests` partition in
  `apps/mobile/vite.config.ts`. The `react` suite uses jsdom/RN mocks/Babel;
  `.browser.test.ts` there can be a jsdom case, not a real browser/device test.
  Package `test` also reruns FilePreviewModal for Android. Native Gradle, C++ and
  Swift suites are independent of Vitest and Expo/Metro.
- Python: registered historical `scripts/seed-issue-21397.test.py` and
  `.github/scripts/stage-preview-bundle.test.py` run as files. Neither is found by
  ordinary `unittest discover test*.py`. New pure files should use `test_*.py` in
  an existing scripts test directory and register their layer/command explicitly.
  The seeder test owns synthetic SQLite, a fake HOME and short Python children;
  it is **component**, never migration of a real profile.
- Node tools: all four `.github/scripts/*.test.cjs` run with `node --test`.
  Desktop `.test.mjs` files import Vitest and remain Vitest-owned; the native
  browser-secret suite compiles C/libsecret on Linux and is not a quick unit.
- Rust: the three owned Cargo crates below use module `#[cfg(test)]` and crate
  tests; platform libraries/toolchains are explicit requirements. No owned Go
  module: Go package visibility rules and `go -race` are not applicable here.

Static fixture/golden inputs stay beside tests or existing `fixtures`/`testdata`;
review updates rather than auto-accepting snapshots. Runtime files use owned
Scope/temp directories. Never commit real profiles, tokens, DB copies or captures.
Vendored `.repos`, `infra/task-cache/vendor`, mobile vendor archives/binaries and
generated bindings/route/GraphQL files are not independent owned test suites.
Their adapters and generation consistency still require affected checks.

## Entrypoints (repository root unless noted)

Commands are aliases in `package.json`; `python3 -B scripts/run-testing.py PROFILE
--list` prints exact argv/cwd and validates required file presence **without
loading tests or starting a runner**. `inventory` enumerates tracked plus
nonignored new test paths, including absent sparse paths. Inventory is a source
listing, not Vitest collection or a proof that a test executed. New Python/Node
tool files absent from the explicit manifest make inventory exit nonzero; classify
and register them rather than silently omitting them. Vitest/platform rows use
`registered:null` because only the actual runner can prove collection.

| Logical entry | Command / selection | Dependencies and meaning |
| --- | --- | --- |
| quick unit | `vp run test-unit` / `test:quick` | Four existing files: contracts keybindings + modelSelection, shared String + cliArgs; Node/VP/Effect, one worker, no DB/socket/provider fixture. A bounded baseline, not all unit tests. |
| component | `vp run test-component` | Four Node tools + preview-artifact Python + synthetic-SQLite seeder Python, serial/fail-first. Short owned shell/Python children; no service, browser, Docker or credential API. |
| script subsets | `vp run test:node-tools`, `vp run test:python` | Same registered component groups; not `vitest` or implicit Python discover. |
| affected unit/component | `vp test run path/to/file.test.ts -t "behavior"` | Actual package config; real codec/SQLite/HTTP/short child decides layer. Server tests can use SQLite, Git, native addons and owned children: do not call the entire server suite unit. |
| browser component | `vp run test:browser` | Web `browser` project, existing installed Playwright Chromium, one worker; no implicit browser download. |
| mobile JS component | cwd `apps/mobile`: `vp test run --project react path/to/test.tsx` | jsdom/RN mocks; use `T3_MOBILE_TEST_PLATFORM=android` only for applicable Android branch. Package `test` retains unit+react+the Android file. |
| real integration | `vp run test-integration` refuses without a project-specific selection | No universal unattended external-service suite. Choose the existing protocol/provider fixture and document owned endpoint, auth, configuration and cleanup first. No shared staging/profile fallback. |
| e2e | `vp run test-e2e` refuses implicit launch | Existing `test-t3-app` / `test-t3-mobile` workflows, `vp run mobile:e2e` or `release:smoke` require separately reviewed products/environment/options. No automatic install, real provider/model or default profile use. |
| Rust/native | `vp run test:native-rust` | Three Cargo crates: resource-monitor, kde-snap-shot, hyprland-snap-shot, `--offline --locked`; Rust satisfying lock/MSRV, KDE/Wayland libs by platform. Missing inputs fail before execution, no auto-fetch. |
| native mobile | `apps/mobile/modules/t3-review-diff/tests/run-android.sh`, `tests/run-ios.sh` in same module; `apps/mobile/modules/t3-highlights/tests/run.sh` | Separate JVM/Robolectric (JDK17+/Gradle, Maven cached or explicitly permitted), macOS Swift SDK, C++20. Android module `android/src/test` needs its owning Gradle build/SDK. No emulator/device claim from these. |
| race | `vp run test-race` reports not applicable and exits nonzero | No Go detector. Focus `vp test run packages/shared/src/KeyedLock.test.ts packages/shared/src/DrainableWorker.test.ts apps/server/src/orchestration-v2/EffectWorker.test.ts` for actual interleavings; no implied scheduling from filenames. |
| fuzz | `vp run test-fuzz` reports no registered active target and exits nonzero | Existing deterministic/property cases remain in their package suites. Do not introduce broad fuzz/benchmark costs without a concrete risk and bounded target. |
| fast check | `vp run check` | `git diff --check` + four-file unit profile. Does **not** include full lint/type/knip/browser or clean-tree assurance. |
| affected quality/type | `vp run check:changed`; owning package `effect-tsgo tsrs --noEmit` | Legacy affected format/lint/knip/type/test selector; compiler native0 is separate from suite PASS. Root `typecheck`/`tc` remain recursive cached commands, not automatically run locally. |
| generation | `vp run generate-check` | Existing `icons:check` readonly comparison. GraphQL: `vp run --filter @t3tools/source-control-github generate --check` and `vp run --filter t3 generate --check`; explicit tool/schema scope. No auto-update of generated files. |
| perf | `vp run test:perf:v2-wire`, `vp run report:renders` | Explicit wire-size/React-commit suites; not a default quick run or hardware throughput claim. |

`test` remains the recursive package test command; `test:cached` remains its
file/shard cache selector. Both are broad, mixed-layer operations requiring
coordination. The cached selector excludes Node `.cjs` tools; the component entry
owns them. These old public command names have not been removed or narrowed.
No automatic installation is part of the new runner. Missing executable/dependency
or a required empty selection fails. `--list` alone is never a test result.

The four-file baseline cannot replace changed-module coverage. Start with the
lowest layer exposing the actual defect, extend an existing case/table, and add a
higher layer only for a different failure mode (real codec/DI/SQL/UI). Contracts,
shared source and provider changes need affected client/server/adapter consumers;
existing `scripts/check-changed.ts` and `.github/scripts/ci-changes.cjs` compute
workspace dependents and extra file reads. Unknown changes conservatively select
broader jobs. Do not add per-function, getter/type/label/mock-call mirrors or tests
only to meet a coverage percentage; do not bulk-remove historical tests either.

## Workspace ownership

Root workspace patterns are `apps/*`, `evals`, `infra/*`, `oxlint-plugin-t3code`,
`packages/*`, `scripts`. The package manifest is authoritative; scripts intentionally
absent from a package are not synthesized as success. The following table includes
sparse paths so a partial checkout cannot masquerade as the whole repository.

| Path | Package | Legacy selection |
| --- | --- | --- |
| `apps/desktop` | `@t3tools/desktop` | package `test` |
| `apps/marketing` | sparse checkout: absent | restore explicitly before selecting |
| `apps/mobile` | `@t3tools/mobile` | package `test` |
| `apps/server` | `t3` | package `test` |
| `apps/web` | `@t3tools/web` | package `test` |
| `evals` | `@t3tools/evals` | package `test` |
| `infra/relay` | sparse checkout: absent | restore explicitly before selecting |
| `infra/task-cache` | `@t3tools/task-cache` | package `test` |
| `oxlint-plugin-t3code` | `@t3tools/oxlint-plugin-t3code` | package `test` |
| `packages/client-runtime` | `@t3tools/client-runtime` | package `test` |
| `packages/contracts` | `@t3tools/contracts` | package `test` |
| `packages/effect-acp` | `effect-acp` | package `test` |
| `packages/effect-codex-app-server` | `effect-codex-app-server` | package `test` |
| `packages/provider-acp-registry` | `@t3tools/provider-acp-registry` | package `test` |
| `packages/provider-acp` | `@t3tools/provider-acp` | package `test` |
| `packages/provider-core` | `@t3tools/provider-core` | package `test` |
| `packages/provider-cursor` | `@t3tools/provider-cursor` | package `test` |
| `packages/provider-fx` | `@t3tools/provider-fx` | package `test` |
| `packages/provider-grok` | `@t3tools/provider-grok` | package `test` |
| `packages/provider-kiro` | `@t3tools/provider-kiro` | package `test` |
| `packages/provider-muse` | `@t3tools/provider-muse` | package `test` |
| `packages/provider-opencode` | `@t3tools/provider-opencode` | package `test` |
| `packages/provider-pi` | `@t3tools/provider-pi` | package `test` |
| `packages/provider-testing` | `@t3tools/provider-testing` | no package test; no empty PASS |
| `packages/secret-provider-core` | `@t3tools/secret-provider-core` | package `test` |
| `packages/secret-provider-definitions` | `@t3tools/secret-provider-definitions` | no package test; no empty PASS |
| `packages/secret-provider-onepassword` | `@t3tools/secret-provider-onepassword` | package `test` |
| `packages/shared` | `@t3tools/shared` | package `test` |
| `packages/source-control-azure-devops` | `@t3tools/source-control-azure-devops` | package `test` |
| `packages/source-control-bitbucket` | `@t3tools/source-control-bitbucket` | package `test` |
| `packages/source-control-core` | `@t3tools/source-control-core` | package `test` |
| `packages/source-control-definitions` | `@t3tools/source-control-definitions` | no package test; no empty PASS |
| `packages/source-control-forgejo` | `@t3tools/source-control-forgejo` | package `test` |
| `packages/source-control-gitcafe` | `@t3tools/source-control-gitcafe` | package `test` |
| `packages/source-control-github` | `@t3tools/source-control-github` | package `test` |
| `packages/source-control-gitlab` | `@t3tools/source-control-gitlab` | package `test` |
| `packages/source-control-testing` | `@t3tools/source-control-testing` | no package test; no empty PASS |
| `packages/ssh` | `@t3tools/ssh` | package `test` |
| `packages/tailscale` | `@t3tools/tailscale` | package `test` |
| `scripts` | `@t3tools/scripts` | package `test` |

## CI mapping

`.github/workflows/testing.yml` runs on this repository's default branch and
current delivery branch pushes, PRs targeting the default branch, and manual
dispatch. `script-components` checks whitespace/Python AST/profile JSON, inventories
owned sources and runs the same six registered script components without a package
install. Whitespace checks exclude vendored references, literal dependency patches
and generated highlights bindings; their bytes follow upstream/generator contracts.
Checkout fetches bounded-size blobs before discarding credentials so deleted/renamed
PR-base source can be compared without authenticated lazy fetching. `core-type-and-unit` uses standard hosted Ubuntu, the existing pinned
Vite+ setup, frozen lockfile and an install limited to root/contracts/shared
with lifecycle scripts disabled. Registry/security policy remains enabled.
It runs the existing contracts/shared typecheck commands serially with their
original Effect diagnostics, then the same four unit files from their owning
package directories. Package cwd avoids loading unrelated application test configs.

GITHUB_TOKEN is contents-read only; checkout credentials are not persisted. No
private task-cache token, product launch, fixed Mac fixture, provider/model, OAuth,
browser/device or release action is part of these jobs. These are a bounded core
baseline, not whole-server/web/mobile type or behavior verification. Existing
broader workflows and assertions are retained; their runner/service requirements
remain independent. Actual run results are recorded per remote SHA, not inferred
from workflow presence or empty checks.

## Time, fixtures and result gates

Use `it.effect` for in-process logic with TestClock; advance test time explicitly
when required. `it.live` is for actual subprocess/network fixtures. Never switch to
live time to hide an unexplained worker failure. Drain the outbox/worker or await
Queue/Deferred/persisted facts; no sleeps, yield polling, timeout increases or retries.
Keep one physical Vitest singleton: patched `@effect/vitest` uses `vite-plus/test`.
Do not alias nested imports to a second physical Vitest while the runner uses the
sealed one. A compiler exit2 with zero printed errors is still not native0.

Own temporary paths, DB/SqlClient and Layer/Context state per test. Fresh negative
admission cases must not inherit a positive receipt/registry/MemoMap accidentally.
Real schema DateTime values and omitted/nullable wire fields must pass the actual
codec, rather than cast brands or hand-shaped happy objects. Effect Scope owns
streams, children and DB; wait positive child handles and close captures. EOF,
kill-return, main0 or a free port does not prove all descendants exited. Real Git,
search/native helpers, network, browsers and models need explicit component/e2e
scope. Never touch the live T3 install, auth, Keychain, shared HOME or old sessions.

PASS requires selected nonzero required tests, expected behavioral assertions,
raw native exit and cleanup evidence at the claimed layer. Skip/expected-platform
absence, registration failure, compile failure, parent0 and report-budget overrun
are distinct. Preserve the first failure and bind later results to new inputs.
Warm/cold timing and coverage baseline for these new profiles: **UNKNOWN** until
actually measured on a named runner. No coverage threshold is introduced.

## Exceptions and rollback

| Exception | Scope / reason | Owner / review by | Alternative |
| --- | --- | --- | --- |
| Historical colocated Python `*.test.py` | Two explicit files; no bulk rename | Repository maintainer / 2026-12-12 | Registered component argv, not default discover |
| `check:changed` retains `--passWithNoTests` | Legacy changed-path/config filtering; not a required-suite exemption | Repository maintainer / 2026-12-12 | Explicit focused collection and nonzero selected count before claiming PASS |
| `test:cached --shard` can return0 for an empty shard | Existing partition behavior; non-sharded no-match fails | Repository maintainer / 2026-12-12 | Report shard selection, never infer complete suite from an empty shard |
| Linux browser-secret `skipIf` on other OS | Native C/libsecret platform boundary | Desktop maintainer / 2026-12-12 | Explicit Linux native job; no cross-platform PASS |
| Separate external integration/e2e/race/fuzz selection | No safe universal service or Go/active-fuzz target | Repository maintainer / 2026-12-12 | Fail-closed profile + explicit reviewed target; not an empty successful alias |

No external tracking issue is invented for these migration items; this table owns
the review until an issue is assigned. Web/Desktop legacy `test` no longer use
`--passWithNoTests`: actual existing test sources make zero selection a failure.
The inheritance exceptions above do not waive strict consumer/schema-safe-row,
credential-isolation, resource allocation, canonical install or release gates.

Rollback only this testing-governance commit after reviewing its diff; do not reset
unrelated changes, managed AGENTS/skill markers, application stages or other tasks.
Entry/config changes must update this document and preserve old public commands.
No remote CI, product/provider/model, mobile installation, session migration or
release result is claimed by this documentation or static inventory.
