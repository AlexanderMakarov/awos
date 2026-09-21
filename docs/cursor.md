# AWOS on Cursor

AWOS prompts are authored for Claude Code. The installer also generates **Cursor** surfaces so the same project works in Cursor Agent without rewriting prompt bodies.

## Install (both hosts)

```sh
mkdir my-project && cd my-project
bunx github:AlexanderMakarov/awos
# or from a local clone:
bun /path/to/awos/index.js
```

Prefer `bunx`. Node `npx github:AlexanderMakarov/awos` also works.

This is **not** `npx @provectusinc/awos` (upstream Provectus).

After install you get:

| Host         | How to invoke                                                        |
| ------------ | -------------------------------------------------------------------- |
| Claude Code  | `/awos:product`, `/awos:hire`, … (nested `.claude/commands/awos/`)   |
| Cursor Agent | `/awos-product`, `/awos-hire`, … (flat `.cursor/commands/awos-*.md`) |

Recruitment MCP is written to both `.mcp.json` and `.cursor/mcp.json` (official `@provectusinc/awos-recruitment`).

## What the installer syncs

1. **Runtime rule** — `.cursor/rules/awos-cursor-runtime.mdc` maps Claude tool names to Cursor (`AskUserQuestion` → native `AskQuestion`, `Agent` → `Task`, …).
2. **Core commands (Layer A)** — one flat wrapper per `.awos/commands/*.md`.
3. **Plugin (Layer C)** — `bunx @disdjj/acplugin` converts `plugins/awos` into prefixed `.cursor/{commands,skills,agents}/` (e.g. `/awos-flow`). Skipped with a warning if neither `bunx` nor `npx` is available, or if acplugin fails; Claude surfaces still install. Force-skip with `AWOS_SKIP_CURSOR_PLUGIN=1`. Re-run with a fixture via `AWOS_PLUGIN_STAGING=/path`.

Manual re-sync (usually unnecessary — re-run the installer):

```sh
node .awos/scripts/sync-awos-cursor-commands.cjs
node .awos/scripts/sync-awos-plugin-cursor.cjs --package-root /path/to/awos
```

## Discovery model (why flat wrappers)

| Path                                  | Claude Code         | Cursor Agent      |
| ------------------------------------- | ------------------- | ----------------- |
| `.claude/commands/*.md` (top level)   | loads               | loads             |
| `.claude/commands/<ns>/*.md` (nested) | loads as `/ns:name` | **does not load** |
| `.cursor/commands/*.md` (top level)   | ignores             | loads             |
| `.claude/skills/`, `.claude/agents/`  | loads               | loads             |

So AWOS’s nested `.claude/commands/awos/` needs flat `.cursor/commands/awos-*.md` for Cursor. Do **not** duplicate top-level `.claude/commands/*.md` into `.cursor/`.

## AskQuestion (strict)

When an AWOS prompt says `AskUserQuestion`:

1. Call native **`AskQuestion`** if it is a first-class tool this turn.
2. Never `CallDynamicTool` with `namespace: cursor` / `AskQuestion` (that namespace is only CreateGoal / GenerateImage / UpdateGoal).
3. Prose numbered list only if native `AskQuestion` is absent.
4. Never call a tool named `AskUserQuestion`.

## Slash rename

| Claude Code           | Cursor                       |
| --------------------- | ---------------------------- |
| `/awos:product`       | `/awos-product`              |
| `/awos:hire`          | `/awos-hire`                 |
| `/awos:flow` (plugin) | `/awos-flow` (after Layer C) |

Reload the Cursor window if the `/` menu looks stale.
