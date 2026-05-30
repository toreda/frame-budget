# CLAUDE.md

Guidance for Claude when working in this repository.

## What this is

`frame-budget` is an NPM package that helps game engines schedule synchronous
work across **multiple frames** instead of cramming it into one frame (which
overruns the per-frame time budget `1000 / FPS` ms and causes lag/freezing).

## Start here: specs

**Read [_specs/main.md](_specs/main.md) first.** It is the spec entry point — a
high-level project summary plus an index of every system and feature spec, so
you can quickly identify which files to ingest for a task.

| Path | Purpose |
| --- | --- |
| [_specs/main.md](_specs/main.md) | Entry point: project summary + index of all specs. |
| [_specs/systems/](_specs/systems/) | One spec per major system (broker, registry, scheduler, executor). |
| [_specs/features/](_specs/features/) | Feature specs (cross-system requirements + plans). |
| [_specs/decisions.md](_specs/decisions.md) | Project-level design decision log (cross-cutting architectural choices). |

Specs are ahead of the code: they capture intended design and open questions.
Keep `_specs/main.md`'s index in sync when adding/renaming specs or source.

## Source layout

One export per file; each file's path is derived from its export name (see the
**File layout** convention below). The table groups files by the system they
belong to.

| Path | Purpose |
| --- | --- |
| [src/](src/) | TypeScript source. |
| [src/index.ts](src/index.ts) | Public API barrel (re-exports every public type/class). |
| [src/defaults.ts](src/defaults.ts) | `Defaults` — package-wide default **values** (grouped `static readonly`). |
| [src/unsubscribe.ts](src/unsubscribe.ts) | `Unsubscribe` — handle returned by `registerWorker`. |
| [src/frame/broker.ts](src/frame/broker.ts) | `FrameBroker` — orchestrator / parent container; **sole public entry point**. `registerWorker(s)`→`Unsubscribe`, `unregisterWorker(s)`, `addPhase`, `start`; `registrySnapshot`/`scheduleSnapshot` (heavy debug copies, not per-frame). |
| [src/frame/broker/init.ts](src/frame/broker/init.ts) | `FrameBrokerInit` — broker constructor argument. |
| [src/frame/registry.ts](src/frame/registry.ts) | `FrameRegistry` — **internal** store of the shared work tree (broker-owned); `register`/`unregister`/`unregisterAll` with ensure-path; `snapshot` (deep plain-data debug copy). |
| [src/frame/scheduler.ts](src/frame/scheduler.ts) | `FrameScheduler` — per-frame planning engine (stub); `snapshot` (state-only debug copy until the plan shape lands). |
| [src/frame/executor.ts](src/frame/executor.ts) | `FrameExecutor` — stateless per-frame execution (scaffold). |
| [src/frame/context.ts](src/frame/context.ts) | `FrameContext` — per-frame execution state (interface). |
| [src/default/phase.ts](src/default/phase.ts) | `DefaultPhase` — default phase union (`'setup' \| 'main' \| 'cleanup'`). |
| [src/registry/node.ts](src/registry/node.ts) | `RegistryNode` — one node in the arbitrary-depth work tree (priority + workers + children). |
| [src/registry/snapshot.ts](src/registry/snapshot.ts) | `RegistrySnapshot` — plain-data debug copy of the whole tree (root node copy or `undefined`). |
| [src/registry/node/snapshot.ts](src/registry/node/snapshot.ts) | `RegistryNodeSnapshot` — plain-data copy of one node (workers/children as arrays). |
| [src/worker.ts](src/worker.ts) | `Worker` — a **stored** worker (name, phase, fn, resolved priority, `alive` tombstone). |
| [src/worker/fn.ts](src/worker/fn.ts) | `WorkerFn` — a worker's frame-budgeted function (`() => boolean`). |
| [src/worker/init.ts](src/worker/init.ts) | `WorkerInit` — register **input** descriptor (`{name, fn, phase, config?}`). |
| [src/worker/ref.ts](src/worker/ref.ts) | `WorkerRef` — unregister **input** address (`{path, name, phase}`). |
| [src/worker/snapshot.ts](src/worker/snapshot.ts) | `WorkerSnapshot` — plain-data copy of a worker (`fn` reduced to a `hasFn` bool). |
| [src/worker/usage.ts](src/worker/usage.ts) | `WorkerUsage` — per-worker measured consumption (leaf of the rollup). |
| [src/node/config.ts](src/node/config.ts) | `NodeConfig` — scheduling config carried by every node/worker (priority). |
| [src/node/config/init.ts](src/node/config/init.ts) | `NodeConfigInit` — partial `NodeConfig` a caller may supply at registration. |
| [src/node/usage.ts](src/node/usage.ts) | `NodeUsage` — base measured consumption (`calls` + `consumedMs`). |
| [src/system/usage.ts](src/system/usage.ts) | `SystemUsage` — one system's totals + per-worker breakdown. |
| [src/category/usage.ts](src/category/usage.ts) | `CategoryUsage` — one category's totals + per-system breakdown. |
| [src/phase/usage.ts](src/phase/usage.ts) | `PhaseUsage` — one phase's totals + per-category breakdown (executor→scheduler rollup). |
| [src/schedule/snapshot.ts](src/schedule/snapshot.ts) | `ScheduleSnapshot` — plain-data debug copy of scheduler state (`built`/`dirty`; reserved `plan` stub). |
| `tests/` | Tests mirror `src/` paths, named `*.spec.ts` (e.g. `src/frame/broker.ts` → `tests/frame/broker.spec.ts`). Tests are **exempt** from the one-export-per-file layout rule. |

## Conventions

- **Formatting:** Prettier is the **source of truth** for code style, using
  [`@toreda/prettier-config`](https://www.npmjs.com/package/@toreda/prettier-config)
  (referenced via the `"prettier"` field in [package.json](package.json)). Its
  rules: **tabs** (width 4), **single quotes**, **no trailing commas**, no
  bracket spacing, semicolons, `printWidth` 110, LF line endings. Run
  `pnpm exec prettier --check src` / `--write` to verify or fix. Do **not**
  trust an IDE's built-in formatter if it disagrees (it may default to
  2-space/double-quote) — `prettier` with the project config wins; point the
  editor at it to avoid spurious diagnostics.
- **Defaults:** default **values** live in [src/defaults.ts](src/defaults.ts) as
  the `Defaults` class — grouped by system into `static readonly` properties
  (e.g. `Defaults.Broker`), members in `UpperCamelCase`, group declared
  `as const`. `Defaults` is for values only — **never types or type unions**
  (those stay with their owning module; derive a type from a default value with
  `typeof` if needed).
- **File layout — one export per file, path derived from the export name:**
  Applies to **every file under [src/](src/)** (the whole source tree complies).
  It does **not** apply to the repo root, other top-level folders, or `tests/`.
  - **One export per file.** Each file under `src/` has a **single** export. The
    one exception: a helper **value** (e.g. a function) may share a file with a
    **type** of the same name differing only in case — e.g. `myThing` (value)
    alongside `MyThing` (type). That is the only case two exports may co-locate.
    ([src/index.ts](src/index.ts) is the public barrel — a pure re-export file,
    not a definition — and is exempt.)
  - **Path = export name split at each case change**, lowercased: the **last**
    word is the **filename**, every earlier word is a **folder**, all under
    `src/`. So an N-word name yields N−1 nested folders plus the file. The split
    is **purely the name** — no system-folder prefix is added (e.g. `Worker`
    lives at `src/worker.ts`, not `src/registry/worker.ts`); a leading word only
    becomes a folder because it is part of the name (`FrameScheduler` → `frame/`).
    - `NodeConfig` → [src/node/config.ts](src/node/config.ts)
    - `WorkerFn` → [src/worker/fn.ts](src/worker/fn.ts)
    - `NodeConfigInit` → [src/node/config/init.ts](src/node/config/init.ts)
    - `FrameScheduler` → [src/frame/scheduler.ts](src/frame/scheduler.ts)
  - Tests mirror the source path under `tests/` with a `.spec.ts` suffix (see the
    source-layout table); `tests/` itself is exempt from this rule.
- **Imports:** `tsconfig` uses `module`/`moduleResolution` `node16`, so relative
  imports **must include the `.js` extension** even from `.ts` sources
  (e.g. `import {x} from './broker/init.js'`).
- **Phase generic:** `FrameBroker<PhaseT>` takes its phase union as an
  **explicit** generic at construction (not inferred) so the compiler validates
  `init.phases` at the call site. Defaults to `DefaultPhase`
  (`'setup' | 'main' | 'cleanup'`) when omitted.

## Tooling

- Package manager: **pnpm** (`pnpm install`). Approved build scripts live in
  [pnpm-workspace.yaml](pnpm-workspace.yaml) (`onlyBuiltDependencies`).
- Type-check: `pnpm exec tsc --noEmit` (tsconfig is scoped to `src` via
  `include`).
- Tests: jest via `@swc/jest` (config in [jest.config.ts](jest.config.ts)).
- Lint: eslint (config in [eslint.config.js](eslint.config.js)).
</content>
