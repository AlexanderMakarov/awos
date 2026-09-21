/**
 * Unit tests for scripts/lib/cursor-surfaces.cjs (Layer A + relocate).
 * Layer C live acplugin is gated behind RUN_ACPLUGIN=1 (not required in CI).
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = fs.promises;
const path = require('node:path');

const {
  extractDescription,
  buildCoreWrapper,
  syncCursorCommands,
  relocatePluginStaging,
  configureCursorMcp,
  syncCursorRules,
} = require('../../scripts/lib/cursor-surfaces.cjs');
const { makeTempDir, removeTempDir } = require('../helpers/temp-project');

const repoRoot = path.resolve(__dirname, '..', '..');
const createdDirs = [];

async function freshTemp() {
  const d = await makeTempDir();
  createdDirs.push(d);
  return d;
}

after(async () => {
  for (const d of createdDirs) await removeTempDir(d);
});

test('extractDescription reads frontmatter description', () => {
  const text = `---\ndescription: Builds the product definition\n---\n\n# body\n`;
  assert.equal(
    extractDescription(text, 'product'),
    'Builds the product definition',
    'must prefer the YAML description field over the stem fallback'
  );
});

test('buildCoreWrapper includes AskQuestion dispatch and hire extras', () => {
  const hire = buildCoreWrapper('hire', 'Hire specialists');
  assert.match(
    hire,
    /search_capabilities/,
    'hire wrapper must name the real recruitment MCP tool'
  );
  assert.match(
    hire,
    /AskQuestion/,
    'every Cursor wrapper must instruct native AskQuestion'
  );
  assert.match(
    hire,
    /Do \*\*not\*\* `CallDynamicTool`/,
    'must forbid CallDynamicTool cursor/AskQuestion (llm-wiki #137a75b)'
  );
  const product = buildCoreWrapper('product', 'Product');
  assert.doesNotMatch(
    product,
    /search_capabilities/,
    'non-hire wrappers must not include recruitment CLI extras'
  );
});

test('syncCursorCommands writes flat awos-*.md wrappers', async () => {
  const root = await freshTemp();
  const cmdDir = path.join(root, '.awos', 'commands');
  await fsPromises.mkdir(cmdDir, { recursive: true });
  await fsPromises.writeFile(
    path.join(cmdDir, 'product.md'),
    '---\ndescription: Defines the product\n---\n\n# Product\n',
    'utf8'
  );
  await fsPromises.writeFile(
    path.join(cmdDir, 'hire.md'),
    '---\ndescription: Hires agents\n---\n\n# Hire\n',
    'utf8'
  );

  // Pre-existing plugin wrapper must survive core sync.
  const cursorCmd = path.join(root, '.cursor', 'commands');
  await fsPromises.mkdir(cursorCmd, { recursive: true });
  await fsPromises.writeFile(
    path.join(cursorCmd, 'awos-flow.md'),
    '# keep me\n',
    'utf8'
  );

  const { commandsWritten } = await syncCursorCommands({ root });
  assert.equal(
    commandsWritten,
    2,
    'must write one Cursor wrapper per .awos/commands/*.md file'
  );
  assert.ok(
    fs.existsSync(path.join(cursorCmd, 'awos-product.md')),
    'must emit .cursor/commands/awos-product.md'
  );
  assert.equal(
    await fsPromises.readFile(path.join(cursorCmd, 'awos-flow.md'), 'utf8'),
    '# keep me\n',
    'Layer A must not delete Layer C plugin wrappers like awos-flow.md'
  );
});

test('configureCursorMcp writes url-only recruitment entry', async () => {
  const workingDir = await freshTemp();
  const result = await configureCursorMcp({ workingDir });
  assert.equal(result.cursorMcpConfigured, true);
  const cfg = JSON.parse(
    await fsPromises.readFile(
      path.join(workingDir, '.cursor', 'mcp.json'),
      'utf8'
    )
  );
  assert.equal(
    cfg.mcpServers['awos-recruitment'].url,
    'https://recruitment.awos.provectus.pro/mcp',
    'Cursor MCP must use the official recruitment URL'
  );
  assert.equal(
    cfg.mcpServers['awos-recruitment'].type,
    undefined,
    'Cursor .cursor/mcp.json entries are url-only (no type field)'
  );

  const again = await configureCursorMcp({ workingDir });
  assert.equal(
    again.cursorMcpConfigured,
    false,
    'second configureCursorMcp must be idempotent'
  );
});

test('syncCursorRules copies framework mdc into the project', async () => {
  const workingDir = await freshTemp();
  const { rulesCopied } = await syncCursorRules({
    packageRoot: repoRoot,
    workingDir,
  });
  assert.ok(rulesCopied >= 1, 'must copy at least the runtime rule');
  assert.ok(
    fs.existsSync(
      path.join(workingDir, '.cursor', 'rules', 'awos-cursor-runtime.mdc')
    ),
    'awos-cursor-runtime.mdc must land under .cursor/rules/'
  );
});

test('relocatePluginStaging prefixes commands/skills/agents', async () => {
  const root = await freshTemp();
  const staging = await freshTemp();
  await fsPromises.mkdir(path.join(staging, 'commands'), { recursive: true });
  await fsPromises.mkdir(path.join(staging, 'skills', 'ai-readiness-audit'), {
    recursive: true,
  });
  await fsPromises.mkdir(path.join(staging, 'agents'), { recursive: true });
  await fsPromises.writeFile(
    path.join(staging, 'commands', 'flow.md'),
    '---\ndescription: Flow\n---\n\n# flow body\n',
    'utf8'
  );
  await fsPromises.writeFile(
    path.join(staging, 'skills', 'ai-readiness-audit', 'SKILL.md'),
    '# skill\n',
    'utf8'
  );
  await fsPromises.mkdir(
    path.join(staging, 'skills', 'ai-readiness-audit', 'dist'),
    { recursive: true }
  );
  await fsPromises.writeFile(
    path.join(staging, 'skills', 'ai-readiness-audit', 'dist', 'cli.js'),
    '/* engine */\n',
    'utf8'
  );
  await fsPromises.mkdir(
    path.join(staging, 'skills', 'ai-readiness-audit', 'node_modules', 'x'),
    { recursive: true }
  );
  await fsPromises.writeFile(
    path.join(
      staging,
      'skills',
      'ai-readiness-audit',
      'node_modules',
      'x',
      'index.js'
    ),
    'module.exports = {}\n',
    'utf8'
  );
  await fsPromises.writeFile(
    path.join(staging, 'agents', 'repo-auditor.md'),
    '---\nname: repo-auditor\n---\n\n# agent\n',
    'utf8'
  );

  const counts = await relocatePluginStaging({ root, staging });
  assert.equal(counts.commands, 1);
  assert.equal(counts.skills, 1);
  assert.equal(counts.agents, 1);

  const flow = path.join(root, '.cursor', 'commands', 'awos-flow.md');
  assert.ok(fs.existsSync(flow), 'flow.md must become awos-flow.md');
  const flowText = await fsPromises.readFile(flow, 'utf8');
  assert.match(
    flowText,
    /Cursor slash: \/awos-flow/,
    'relocated commands must get the Cursor banner'
  );
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        '.cursor',
        'skills',
        'awos-ai-readiness-audit',
        'SKILL.md'
      )
    ),
    'skills must be prefixed under .cursor/skills/'
  );
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        '.cursor',
        'skills',
        'awos-ai-readiness-audit',
        'dist',
        'cli.js'
      )
    ),
    'dist/ must be kept so the audit engine remains runnable under Cursor'
  );
  assert.ok(
    !fs.existsSync(
      path.join(
        root,
        '.cursor',
        'skills',
        'awos-ai-readiness-audit',
        'node_modules'
      )
    ),
    'node_modules/ must still be excluded from relocated skills'
  );
  assert.ok(
    fs.existsSync(path.join(root, '.cursor', 'agents', 'awos-repo-auditor.md')),
    'agents must be prefixed under .cursor/agents/'
  );
});
