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

Specs are ahead of the code: they capture intended design and open questions.
Keep `_specs/main.md`'s index in sync when adding/renaming specs or source.

## Source layout

| Path | Purpose |
| --- | --- |
| [src/](src/) | TypeScript source. |
| [src/index.ts](src/index.ts) | Public API barrel (exports). |
| [src/frame/broker.ts](src/frame/broker.ts) | `FrameBroker` — orchestrator / parent container. |
| [src/frame/broker/init.ts](src/frame/broker/init.ts) | `FrameBrokerInit`, `DefaultPhase`, `DEFAULT_PHASES`. |
| [src/frame/registry.ts](src/frame/registry.ts) | `FrameRegistry` — public store of the work taxonomy. |
| [src/frame/scheduler.ts](src/frame/scheduler.ts) | `FrameScheduler` — per-frame planning engine (stub). |
| [src/frame/executor.ts](src/frame/executor.ts) | `FrameExecutor` — stateless per-frame execution (scaffold). |
| [src/frame/context.ts](src/frame/context.ts) | `FrameContext` — per-frame execution state (interface). |
| `tests/` | Tests mirror `src/` paths, named `*.spec.ts` (e.g. `src/frame/broker.ts` → `tests/frame/broker.spec.ts`). |

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
