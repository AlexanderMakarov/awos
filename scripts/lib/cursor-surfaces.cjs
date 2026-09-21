/**
 * Cursor surface sync for AWOS installs.
 *
 * Layer A: flat `.cursor/commands/awos-*.md` from `.awos/commands/*.md`
 * Layer C: acplugin convert of plugins/awos → prefixed `.cursor/{commands,skills,agents}/`
 *
 * CommonJS so the installer (require) and CLI scripts can share one implementation.
 * Zero npm dependencies — stdlib only; acplugin is invoked via bunx/npx when needed.
 */

'use strict';

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const DEFAULT_PREFIX = 'awos';
const RECRUITMENT_MCP = {
  url: 'https://recruitment.awos.provectus.pro/mcp',
};

/**
 * Extract YAML frontmatter `description:` from an AWOS command markdown file.
 * @param {string} text
 * @param {string} fallbackStem
 * @returns {string}
 */
function extractDescription(text, fallbackStem) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return `AWOS command: ${fallbackStem}`;
  const dm = m[1].match(/^description:\s*(.+)$/m);
  if (!dm) return `AWOS command: ${fallbackStem}`;
  let val = dm[1].trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return val;
}

/**
 * Build the body of a flat Cursor wrapper for one core AWOS command.
 * @param {string} name - command stem (e.g. product)
 * @param {string} description
 * @returns {string}
 */
function buildCoreWrapper(name, description) {
  let hireExtra = '';
  if (name === 'hire') {
    hireExtra = `
Recruitment specifics:

- Call the \`awos-recruitment\` MCP tool \`search_capabilities\` (not a tool named \`search\`).
- Prefer \`bunx\` for installs; fall back to \`npx\` only if \`bun\`/\`bunx\` is unavailable:

\`\`\`text
bunx @provectusinc/awos-recruitment skill <names...>
bunx @provectusinc/awos-recruitment agent <names...>
bunx @provectusinc/awos-recruitment mcp <names...>
\`\`\`

Hired skills/agents land under \`.claude/skills/\` and \`.claude/agents/\` — Cursor already reads those trees.

`;
  }

  return `---
description: ${description}
---

# /awos-${name} (Cursor)

Follow \`.awos/commands/${name}.md\` as the source of truth (do not edit that file — the AWOS installer overwrites it).

Apply the tool mapping in \`.cursor/rules/awos-cursor-runtime.mdc\`.

**Multiple-choice interaction (strict):** when the AWOS prompt says \`AskUserQuestion\`, call native \`AskQuestion\` if it is already listed as a first-class tool this turn (invoke by name). Do **not** \`CallDynamicTool\` with \`namespace: cursor\` and \`toolName: AskQuestion\` — that tool is not in the cursor namespace. Use prose numbered choices **only** if native \`AskQuestion\` is missing. Never call \`AskUserQuestion\` (Claude-only name).
${hireExtra}
Optional user hint (if provided after the slash command): treat it as \`$ARGUMENTS\` / the \`<user_prompt>\` in that command file.
`;
}

/**
 * Sync Layer A: regenerate flat Cursor wrappers from `.awos/commands/*.md`.
 *
 * @param {Object} opts
 * @param {string} opts.root - project root (consumer)
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<{ commandsWritten: number }>}
 */
async function syncCursorCommands({ root, dryRun = false }) {
  const srcDir = path.join(root, '.awos', 'commands');
  const dstDir = path.join(root, '.cursor', 'commands');

  if (!fs.existsSync(srcDir)) {
    if (dryRun) {
      return { commandsWritten: 0 };
    }
    throw new Error(
      `missing ${srcDir} — run the AWOS installer before syncing Cursor commands`
    );
  }

  const files = (await fsPromises.readdir(srcDir)).filter((f) =>
    f.endsWith('.md')
  );
  // Only replace wrappers for core commands — leave plugin surfaces
  // (e.g. awos-flow.md from Layer C) untouched.
  const coreNames = new Set(files.map((f) => path.basename(f, '.md')));

  if (!dryRun) {
    await fsPromises.mkdir(dstDir, { recursive: true });
    const nested = path.join(dstDir, 'awos');
    if (fs.existsSync(nested)) {
      await fsPromises.rm(nested, { recursive: true, force: true });
    }
    if (fs.existsSync(dstDir)) {
      for (const entry of await fsPromises.readdir(dstDir)) {
        if (!entry.startsWith('awos-') || !entry.endsWith('.md')) continue;
        const stem = entry.slice('awos-'.length, -'.md'.length);
        if (coreNames.has(stem)) {
          await fsPromises.unlink(path.join(dstDir, entry));
        }
      }
    }
  }

  let written = 0;
  for (const file of files) {
    const name = path.basename(file, '.md');
    const text = await fsPromises.readFile(path.join(srcDir, file), 'utf8');
    const description = extractDescription(text, name);
    const outPath = path.join(dstDir, `awos-${name}.md`);
    const body = buildCoreWrapper(name, description);
    if (!dryRun) {
      await fsPromises.writeFile(outPath, body, 'utf8');
    }
    written += 1;
  }

  return { commandsWritten: written };
}

/**
 * Inject a one-line Cursor banner after frontmatter if missing.
 * @param {string} filePath
 * @param {string} slash - e.g. awos-flow
 * @param {boolean} dryRun
 */
async function injectCursorBanner(filePath, slash, dryRun) {
  if (dryRun) return;
  let text = await fsPromises.readFile(filePath, 'utf8');
  if (text.includes(`Cursor slash: /${slash}`)) return;
  const banner =
    `\n<!-- Cursor slash: /${slash}. ` +
    `When the body says AskUserQuestion, call native AskQuestion if listed ` +
    `(never CallDynamicTool cursor/AskQuestion; ` +
    `see .cursor/rules/awos-cursor-runtime.mdc). ` +
    `Agent(…) → Task(…). -->\n`;
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) {
      const insertAt = end + '\n---'.length;
      text = text.slice(0, insertAt) + banner + text.slice(insertAt);
    } else {
      text = banner + text;
    }
  } else {
    text = banner + text;
  }
  await fsPromises.writeFile(filePath, text, 'utf8');
}

/**
 * Copy a directory tree excluding node_modules/ and .git/.
 * Keeps dist/ so the audit skill's committed engine bundle remains runnable.
 * @param {string} src
 * @param {string} dest
 */
async function copyDirFiltered(src, dest) {
  await fsPromises.mkdir(dest, { recursive: true });
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirFiltered(from, to);
    } else if (entry.isFile()) {
      await fsPromises.copyFile(from, to);
    }
  }
}

/**
 * Resolve which directory holds acplugin output (commands/skills/agents).
 * @param {string} candidate
 * @param {string} root
 * @returns {string}
 */
function resolveStaging(candidate, root) {
  if (process.env.AWOS_PLUGIN_STAGING) {
    const envStaging = process.env.AWOS_PLUGIN_STAGING;
    if (fs.existsSync(envStaging)) return envStaging;
  }
  if (
    fs.existsSync(path.join(candidate, 'commands')) ||
    fs.existsSync(path.join(candidate, 'skills')) ||
    fs.existsSync(path.join(candidate, 'agents'))
  ) {
    return candidate;
  }
  const nested = path.join(candidate, '.cursor');
  if (
    fs.existsSync(path.join(nested, 'commands')) ||
    fs.existsSync(path.join(nested, 'skills'))
  ) {
    return nested;
  }
  if (
    fs.existsSync(path.join(root, 'commands', 'flow.md')) ||
    fs.existsSync(path.join(root, 'skills', 'ai-readiness-audit'))
  ) {
    return root;
  }
  throw new Error(
    `no acplugin staging found under ${candidate} (set AWOS_PLUGIN_STAGING or pass relocateOnly after convert)`
  );
}

/**
 * Prefer bunx, else npx.
 * @returns {'bunx'|'npx'|null}
 */
function resolveRunner() {
  const which = (cmd) => {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    return r.status === 0;
  };
  if (which('bunx')) return 'bunx';
  if (which('npx')) return 'npx';
  return null;
}

/**
 * Run @disdjj/acplugin convert against the local plugins/awos tree.
 * @param {string} packageRoot
 * @param {string} outDir
 * @param {string} runner - bunx|npx
 */
function runAcplugin(packageRoot, outDir, runner) {
  const pluginPath = path.join(packageRoot, 'plugins', 'awos');
  if (!fs.existsSync(pluginPath)) {
    throw new Error(`AWOS plugin not found at ${pluginPath}`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  // Source must be a local filesystem path — a fake owner/repo string makes
  // acplugin try to clone from GitHub and fail. Converting plugins/awos as the
  // source root emits commands/skills/agents at the -o directory top level.
  const args = [
    '@disdjj/acplugin',
    'convert',
    pluginPath,
    '--to',
    'cursor',
    '-a',
    '-o',
    outDir,
  ];
  const result = spawnSync(runner, args, {
    encoding: 'utf8',
    cwd: packageRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(
      `${runner} @disdjj/acplugin failed (exit ${result.status}): ${err || 'no output'}`
    );
  }
}

/**
 * Relocate acplugin staging into `.cursor/` with an awos- prefix.
 *
 * @param {Object} opts
 * @param {string} opts.root
 * @param {string} opts.staging
 * @param {string} [opts.prefix]
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<{ commands: number, skills: number, agents: number }>}
 */
async function relocatePluginStaging({
  root,
  staging,
  prefix = DEFAULT_PREFIX,
  dryRun = false,
}) {
  const pick = (base, nested) => {
    if (fs.existsSync(path.join(staging, base))) {
      return path.join(staging, base);
    }
    if (fs.existsSync(path.join(staging, nested))) {
      return path.join(staging, nested);
    }
    return null;
  };

  const cmdSrc = pick('commands', path.join('.cursor', 'commands'));
  const skillSrc = pick('skills', path.join('.cursor', 'skills'));
  const agentSrc = pick('agents', path.join('.cursor', 'agents'));

  const cmdDst = path.join(root, '.cursor', 'commands');
  const skillDst = path.join(root, '.cursor', 'skills');
  const agentDst = path.join(root, '.cursor', 'agents');

  if (!dryRun) {
    await fsPromises.mkdir(cmdDst, { recursive: true });
    await fsPromises.mkdir(skillDst, { recursive: true });
    await fsPromises.mkdir(agentDst, { recursive: true });
  }

  let nCmd = 0;
  let nSkill = 0;
  let nAgent = 0;

  if (cmdSrc) {
    for (const file of await fsPromises.readdir(cmdSrc)) {
      if (!file.endsWith('.md')) continue;
      const stem = path.basename(file, '.md');
      const destName = stem.startsWith(`${prefix}-`)
        ? `${stem}.md`
        : `${prefix}-${stem}.md`;
      // Do not overwrite Layer A core wrappers (product, hire, …) if acplugin
      // emits a colliding basename — Layer A owns awos-<core>.md.
      const dest = path.join(cmdDst, destName);
      if (!dryRun) {
        await fsPromises.copyFile(path.join(cmdSrc, file), dest);
        await injectCursorBanner(dest, path.basename(dest, '.md'), dryRun);
      }
      nCmd += 1;
    }
  }

  if (skillSrc) {
    for (const name of await fsPromises.readdir(skillSrc)) {
      const from = path.join(skillSrc, name);
      if (!(await fsPromises.stat(from)).isDirectory()) continue;
      const destName = name.startsWith(`${prefix}-`)
        ? name
        : `${prefix}-${name}`;
      const dest = path.join(skillDst, destName);
      if (!dryRun) {
        await fsPromises.rm(dest, { recursive: true, force: true });
        await copyDirFiltered(from, dest);
      }
      nSkill += 1;
    }
  }

  if (agentSrc) {
    for (const file of await fsPromises.readdir(agentSrc)) {
      if (!file.endsWith('.md')) continue;
      const stem = path.basename(file, '.md');
      const destName = stem.startsWith(`${prefix}-`)
        ? `${stem}.md`
        : `${prefix}-${stem}.md`;
      const dest = path.join(agentDst, destName);
      if (!dryRun) {
        await fsPromises.copyFile(path.join(agentSrc, file), dest);
        await injectCursorBanner(dest, path.basename(dest, '.md'), dryRun);
      }
      nAgent += 1;
    }
  }

  if (!dryRun && path.resolve(staging) === path.resolve(root)) {
    for (const junk of ['commands', 'skills', 'agents', '.cursor-plugin']) {
      await fsPromises.rm(path.join(root, junk), {
        recursive: true,
        force: true,
      });
    }
  }

  if (nCmd === 0 && nSkill === 0) {
    throw new Error(
      `nothing relocated from staging ${staging} — check acplugin output layout`
    );
  }

  return { commands: nCmd, skills: nSkill, agents: nAgent };
}

/**
 * Sync Layer C: convert AWOS plugin to Cursor paths via acplugin (or relocate-only).
 *
 * @param {Object} opts
 * @param {string} opts.root - consumer project root
 * @param {string} opts.packageRoot - AWOS package root (has plugins/awos)
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.relocateOnly] - skip acplugin; use AWOS_PLUGIN_STAGING or root dump
 * @param {string} [opts.stagingDir] - pre-built staging (tests)
 * @returns {Promise<{ skipped?: boolean, reason?: string, commands?: number, skills?: number, agents?: number }>}
 */
async function syncCursorPlugin({
  root,
  packageRoot,
  dryRun = false,
  relocateOnly = false,
  stagingDir = null,
}) {
  const prefix = process.env.AWOS_CURSOR_PREFIX || DEFAULT_PREFIX;

  if (stagingDir || relocateOnly) {
    const staging = stagingDir ? stagingDir : resolveStaging(root, root);
    return relocatePluginStaging({ root, staging, prefix, dryRun });
  }

  const runner = resolveRunner();
  if (!runner) {
    return {
      skipped: true,
      reason:
        'neither bunx nor npx found — Cursor plugin surfaces not generated; install Bun or Node and re-run',
    };
  }

  if (dryRun) {
    return {
      commands: 0,
      skills: 0,
      agents: 0,
      dryRun: true,
      runner,
    };
  }

  const tmp = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), 'awos-plugin-cursor-')
  );
  try {
    runAcplugin(packageRoot, tmp, runner);
    const staging = resolveStaging(tmp, root);
    return await relocatePluginStaging({ root, staging, prefix, dryRun });
  } finally {
    await fsPromises.rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Ensure `.cursor/mcp.json` has awos-recruitment (url-only shape for Cursor).
 *
 * @param {Object} opts
 * @param {string} opts.workingDir
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<{ cursorMcpConfigured: boolean }>}
 */
async function configureCursorMcp({ workingDir, dryRun = false }) {
  const mcpPath = path.join(workingDir, '.cursor', 'mcp.json');
  let config = { mcpServers: {} };
  let fileExists = false;

  if (fs.existsSync(mcpPath)) {
    fileExists = true;
    const raw = await fsPromises.readFile(mcpPath, 'utf8');
    try {
      config = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON in .cursor/mcp.json: ${error.message}`);
    }
  }
  if (!config.mcpServers) config.mcpServers = {};

  if (config.mcpServers['awos-recruitment']) {
    return { cursorMcpConfigured: false };
  }

  config.mcpServers['awos-recruitment'] = { ...RECRUITMENT_MCP };

  if (!dryRun) {
    await fsPromises.mkdir(path.dirname(mcpPath), { recursive: true });
    await fsPromises.writeFile(mcpPath, JSON.stringify(config, null, 2) + '\n');
  }

  return { cursorMcpConfigured: true, created: !fileExists };
}

/**
 * Copy framework cursor/rules into the consumer project.
 *
 * @param {Object} opts
 * @param {string} opts.packageRoot
 * @param {string} opts.workingDir
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<{ rulesCopied: number }>}
 */
async function syncCursorRules({ packageRoot, workingDir, dryRun = false }) {
  const srcDir = path.join(packageRoot, 'cursor', 'rules');
  const dstDir = path.join(workingDir, '.cursor', 'rules');
  if (!fs.existsSync(srcDir)) {
    throw new Error(`missing framework rules at ${srcDir}`);
  }
  if (!dryRun) {
    await fsPromises.mkdir(dstDir, { recursive: true });
  }
  let copied = 0;
  for (const file of await fsPromises.readdir(srcDir)) {
    if (!file.endsWith('.mdc') && !file.endsWith('.md')) continue;
    if (!dryRun) {
      await fsPromises.copyFile(
        path.join(srcDir, file),
        path.join(dstDir, file)
      );
    }
    copied += 1;
  }
  return { rulesCopied: copied };
}

module.exports = {
  extractDescription,
  buildCoreWrapper,
  syncCursorCommands,
  syncCursorPlugin,
  relocatePluginStaging,
  configureCursorMcp,
  syncCursorRules,
  resolveRunner,
  resolveStaging,
  DEFAULT_PREFIX,
  RECRUITMENT_MCP,
};
