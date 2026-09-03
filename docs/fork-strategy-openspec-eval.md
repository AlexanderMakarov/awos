# Soft-fork strategy: npm divergence & OpenSpec / Spec Kit for AWOS extras

**Status:** evaluation (not an implementation plan)
**Date:** 2026-09-03
**Fork tip:** `AlexanderMakarov/awos` `main` (independent of `provectus/awos`; tracking mirror on `upstream-main`)
**Companion fork:** `AlexanderMakarov/awos-recruitment` (`main` preserved; upstream tip on `upstream-main`)

This note answers two questions that come with keeping an independent AWOS shape:

1. How to stop depending on (or colliding with) the published `@provectusinc/awos` npm package.
2. Whether OpenSpec or GitHub Spec Kit can replace AWOS’s SDD core **and** still host the two capabilities that matter for this fork: **`/awos:flow`** and **awos-recruitment integration** (via `/awos:hire`).

---

## 1. Context: what this fork actually preserves

Independent `main` currently stacks upstream tip with merged open work (skipping WIP #148):

| PR   | Feature kept on fork `main`                                                              |
| ---- | ---------------------------------------------------------------------------------------- |
| #183 | verify → append fix tasks; tighter verify/tasks contracts                                |
| #187 | small-change path (interview/policy; **template prose dropped** when #193 won conflicts) |
| #188 | daily self-check / version stamper at `/awos:spec` Step 0                                |
| #189 | orchestration-root audit + generic SDD detectors (incl. OpenSpec / Spec Kit recognition) |
| #193 | flow **assembler** (byte-exact template assembly)                                        |

Also archived, not merged: `feat/audit-backlog`, `archive/flow-command-tip` (~25 post-merge flow commits). Preferring the assembler over #187 means Small-change triage must be re-ported into slotted templates later if you still want it live in generated commands.

---

## 2. Disabling / diverging from the npm registry

Published package today: **`@provectusinc/awos@1.4.0`** → `https://github.com/provectus/awos.git`.
Users install with `npx @provectusinc/awos` / `bunx @provectusinc/awos`. The installer copies framework files into the consumer project; it is not a long-running library dependency.

### Options

| Option                                        | What you do                                                                                                                                                        | Pros                                                                   | Cons / risks                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Git installer only**                     | Document `npx github:AlexanderMakarov/awos` / `npx <path>` / clone+run `index.js`. Leave npm alone.                                                                | Zero registry politics; matches how you already test from a repo path. | Users habitually type `@provectusinc/awos` and get upstream. Easy to “update” the wrong tree.                                                                                        |
| **B. Publish under a new scope**              | e.g. `@alexander-makarov/awos` or a personal org name. Point `package.json` `repository` at the fork. Optionally bump `name` in lockstep with a fork version line. | Clear brand split; `npx @you/awos` is discoverable; semver is yours.   | You maintain release CI. Name collision / trademark courtesy with Provectus. Two packages in the wild confuse “which AWOS”.                                                          |
| **C. Same package name, different registry**  | Verdaccio / GitHub Packages / private npm with `@provectusinc:registry=…` in project `.npmrc`.                                                                     | Local teams keep the familiar name.                                    | **Do not** publish `@provectusinc/awos` to the public registry — you do not own the scope. Private mirror of a scoped name is only OK for private consumers who opt in via `.npmrc`. |
| **D. Unpublish / deprecate upstream package** | Ask Provectus maintainers to `npm deprecate` or transfer.                                                                                                          | Clean signal for the ecosystem.                                        | Requires their consent. Unpublish rules are strict for packages with dependents; deprecate is the realistic ask.                                                                     |
| **E. Installer guard in the fork**            | Fork installer refuses to run unless `AWOS_DIST=fork` / `--i-am-on-the-fork`, and prints “upstream npm is not this line”.                                          | Protects accidental `npx` against a mis-published fork build.          | Does nothing if someone still installs upstream.                                                                                                                                     |

### Recommendation

**Short term: A + B.**

- Use the fork via git/`npx` from the GitHub URL while the soft-fork stabilizes.
- When you want a stable UX, publish **a new scope** (B), never try to occupy `@provectusinc`.
- Add a one-line README + installer banner: “This line is not `@provectusinc/awos`.”
- Optionally ask upstream for a **deprecate** notice pointing at the fork only if the relationship and narrative support it (D) — not required to diverge.

You cannot “disable” the upstream package from the outside. You can only **stop recommending it**, **publish a distinct package**, and **make mis-installs obvious**.

### Implementation trade-offs (npm)

1. **Version coupling.** Upstream uses release-drafter for npm; the plugin marketplace uses a separate manual plugin version (`2.5.0` on this fork). A fork package should treat **npm package version ≠ plugin version** the same way upstream does, or you will fight the lint pin in `tests/lint-prompts.test.js`.
2. **Recruitment CLI.** `/awos:hire` shells out to `npx @provectusinc/awos-recruitment …`. Diverging only AWOS leaves hire installs on upstream recruitment unless you also publish / rewrite those commands to your recruitment fork (or a git URL).
3. **Consumer updates.** Soft-fork consumers need an explicit update path (`npx @you/awos` or git pull of the installer). There is no automatic divert of existing `@provectusinc/awos` installs.

---

## 3. Can OpenSpec or Spec Kit replace AWOS’s SDD core?

### What “SDD core” means in AWOS

Load-bearing loop (document-centric, under `context/`):

```text
product → roadmap → architecture → hire
  → spec → tech → tasks → implement → verify
```

Plus: two-folder customization (`.awos/` overwritten, `.claude/commands/awos/` preserved), installer migrations, and the audit plugin’s multi-framework SDD detectors.

### What the alternatives actually cover

| Capability                                           | AWOS                                     | OpenSpec ([Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)) | GitHub Spec Kit ([github/spec-kit](https://github.com/github/spec-kit))     |
| ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Change/spec artifacts before code                    | Yes (`context/spec/NNN-*`)               | Yes (`openspec/changes/*` deltas → `openspec/specs/`)                    | Yes (`specs/*` + plan/tasks)                                                |
| Product / roadmap / architecture as first-class cmds | Yes                                      | Partial (`project.md` / explore; not the same ceremony)                  | Partial (constitution / specify; different model)                           |
| Brownfield delta mindset                             | Medium                                   | **Strong** (ADDED/MODIFIED/REMOVED)                                      | Medium (extensions help)                                                    |
| Multi-agent task assignment (`**[Agent: name]**`)    | Yes (`tasks` → `implement` orchestrator) | Weak / single-agent by default                                           | Via agent + extensions; not AWOS’s hire roster                              |
| Installer + migrations into user repos               | Yes                                      | `openspec init` (lighter)                                                | `specify` init + extensions catalog                                         |
| Extensibility                                        | Commands + Claude plugin                 | Profiles / schemas                                                       | **Extensions** (`extension.yml`, hooks around specify/plan/tasks/implement) |
| Already recognized by AWOS audit                     | Self                                     | Yes (`openspec` in `spec_frameworks.ts`)                                 | Yes (`speckit` markers)                                                     |

**Verdict on SDD replacement:** Yes, **either** OpenSpec or Spec Kit can replace the _spec → plan/tasks → implement_ spine for many projects. Neither is a drop-in for the full AWOS product/roadmap/architecture/hire/verify ceremony. OpenSpec is the better brownfield fit; Spec Kit is the better “extensible harness + multi-agent ecosystem” fit as of 1.0.0 (2026).

---

## 4. The two features that do **not** come for free

### 4.1 `/awos:flow`

**What it is:** a generator (now **assembler**) that interviews delivery dimensions and writes project-owned commands (e.g. `/implement-feature`, `/fix-bug`) from slotted templates under `plugins/awos/templates/`, with resume, gates, CI wait, notifications, context strategy, etc.

**What OpenSpec/Spec Kit give you instead:** commands to produce/apply/archive specs (OpenSpec) or specify/plan/tasks/implement (Spec Kit). They do **not** ship an equivalent of “generate a full ticket→merge delivery OS tailored to this repo.”

**Ways to bring flow-like behavior in**

| Approach                             | Where it lives                                                                       | Effort      | Trade-off                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SK1. Spec Kit extension**          | `extension.yml` + `commands/flow.md` (+ assembler scripts as extension tools)        | Medium–high | Best long-term home if you standardize on Spec Kit; you rewrite paths/assumptions away from `.awos/` and `/awos:*`. Hooks can run after `tasks` / around `implement`. |
| **OS1. OpenSpec companion commands** | Extra slash commands + skills beside OpenSpec’s `opsx:*`                             | Medium      | OpenSpec stays change-centric; flow remains a sibling workflow. Less native lifecycle hooks than Spec Kit extensions.                                                 |
| **HY1. Keep AWOS plugin, swap SDD**  | Retain `plugins/awos` flow + hire; point “spec chain” at OpenSpec/Spec Kit artifacts | Medium      | Fastest path to keep flow working. Dual ceremony risk (two sources of truth) unless you delete AWOS `spec/tech/tasks` or make them thin wrappers.                     |
| **NO1. Don’t port flow**             | Use host CI + manual `/implement`                                                    | Low         | Accept the gap; SDD-only migration.                                                                                                                                   |

**Feasibility:** **Yes.** Flow is “prompt + templates + small Node assembler,” not an npm runtime service. Spec Kit’s extension model is the cleanest formal fit; HY1 is the lowest-risk soft-fork path.

### 4.2 awos-recruitment integration

**What it is:** `/awos:hire` searches the **awos-recruitment MCP**, installs skills/MCPs/agents/hooks via `@provectusinc/awos-recruitment` CLI, writes `.claude/agents/*.md` and `context/product/hired-agents.md`. Flow and implement **consume** that roster; they do not replace it.

**What OpenSpec/Spec Kit give you:** no recruitment registry. Spec Kit has a community extension catalog (different problem: extending Spec Kit itself, not hiring stack specialists into `.claude/`).

**Ways to bring hire/recruitment in**

| Approach                                                                                   | Effort     | Trade-off                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1. Keep recruitment as MCP+CLI; rewrite hire as Spec Kit extension / OpenSpec command** | Medium     | Reuse `AlexanderMakarov/awos-recruitment` (or upstream). Command text must not assume `context/product/architecture.md` unless you keep or map that doc. |
| **R2. Publish hire as a Claude Code plugin skill only**                                    | Low–medium | Works with any SDD core; weakest coupling.                                                                                                               |
| **R3. Replace recruitment with manual skills / Claude marketplace**                        | Low        | Loses semantic search + one-command install UX.                                                                                                          |
| **R4. Teach Spec Kit extension to call recruitment in `after_tasks` / before implement**   | Medium     | Nice orchestration; still depends on recruitment service availability.                                                                                   |

**Feasibility:** **Yes**, and it is **orthogonal** to OpenSpec vs Spec Kit. Recruitment is an MCP+CLI product; the SDD framework only needs a command that knows how to call it and where to write agents.

---

## 5. Combined strategies (recommended shapes)

### Strategy Soft-AWOS (recommended near-term)

Keep the fork’s AWOS installer + flow assembler + hire; diverge npm via **new scope** when ready; do **not** migrate SDD yet.

- **Pros:** Preserves `/awos:flow` and recruitment as they exist on this `main`. Matches the reason you soft-forked.
- **Cons:** You maintain a fork of a moving upstream; philosophy drift continues.
- **npm:** A then B.

### Strategy Spec-Kit shell

Adopt Spec Kit as SDD harness; port flow as a **Spec Kit extension**; keep recruitment via a hire extension/command (R1/R4).

- **Pros:** Upstream SDD innovation is Spec Kit’s problem; extension catalog is a distribution channel; multi-agent friendly.
- **Cons:** Large port (paths, verify loop, self-check, audit plugin). AWOS-specific `context/` layout goes away or becomes dual.
- **npm:** Drop `@provectusinc/awos` for consumers; ship extension + optional thin meta-installer.

### Strategy OpenSpec core + AWOS extras

Use OpenSpec for change deltas; keep flow+hire as sibling Claude commands (OS1 + R2).

- **Pros:** Best brownfield spec discipline; smaller conceptual jump for existing codebases.
- **Cons:** Two mental models (delta specs vs delivery flow); fewer formal extension hooks than Spec Kit.
- **npm:** Same as Soft-AWOS for the extras package, or a new `@you/awos-flow` package that only ships flow+hire.

### Strategy Audit-only / hybrid recognition

Already partially true: fork `main`’s audit (#189) **scores** OpenSpec and Spec Kit as valid SDD. You can run those frameworks in a repo and still use AWOS audit — without replacing flow/hire.

---

## 6. Decision guide

| If you care most about…                                  | Choose                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Keeping today’s flow+hire behavior while upstream drifts | **Soft-AWOS** + npm **B**                                                           |
| Long-term SDD maintained by a large ecosystem            | **Spec-Kit shell** + port flow/hire as extensions                                   |
| Brownfield delta specs with minimal process              | **OpenSpec core + AWOS extras**                                                     |
| Only measuring SDD, not owning it                        | Stay on Soft-AWOS; use OpenSpec/Spec Kit in target repos; rely on audit recognition |

---

## 7. Open questions (resolve before implementation)

1. **Package name:** personal scope vs new product name (affects B).
2. **Recruitment:** stay on `@provectusinc/awos-recruitment` or publish from `AlexanderMakarov/awos-recruitment` and rewrite hire install lines.
3. **Small-change path:** re-port onto assembler templates, or accept loss until needed.
4. **Consumer story:** greenfield-only fork, or migration guide from upstream AWOS installs.

---

## 8. Bottom line

- **npm:** You cannot disable upstream’s package. Publish under a **new scope** (or git-only) and make the fork unmistakable; rewrite hire’s `npx @provectusinc/awos-recruitment` lines if that CLI must diverge too.
- **OpenSpec / Spec Kit:** Both can replace AWOS’s **spec spine**; neither ships **`/awos:flow`** or **recruitment**. Both can **host** those features — Spec Kit via extensions (best formal fit), OpenSpec via companion commands, or Soft-AWOS by keeping the plugin and optionally wrapping foreign SDD layouts.
- **Practical path:** Soft-AWOS now; if SDD replacement becomes the goal, prefer **Spec Kit extension** for flow and a thin **hire** command that still talks to awos-recruitment.
