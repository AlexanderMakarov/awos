#!/usr/bin/env node
/**
 * Layer C: convert the AWOS marketplace plugin to Cursor paths with an `awos-` prefix.
 *
 * Usage:
 *   node scripts/sync-awos-plugin-cursor.mjs --package-root /path/to/awos [--root /path/to/project]
 *   node .awos/scripts/sync-awos-plugin-cursor.mjs --package-root …   # after install
 *   … --relocate-only   # skip acplugin; use AWOS_PLUGIN_STAGING or a prior dump
 *
 * Prefer bunx; falls back to npx for @disdjj/acplugin.
 * The installer runs this automatically after copying framework files.
 */

'use strict';

const path = require('path');
const { syncCursorPlugin } = require('./lib/cursor-surfaces.cjs');

function parseArgs(argv) {
  let root = process.cwd();
  let packageRoot = null;
  let dryRun = false;
  let relocateOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) {
      root = path.resolve(argv[++i]);
    } else if (argv[i] === '--package-root' && argv[i + 1]) {
      packageRoot = path.resolve(argv[++i]);
    } else if (argv[i] === '--dry-run') {
      dryRun = true;
    } else if (argv[i] === '--relocate-only') {
      relocateOnly = true;
    }
  }
  return { root, packageRoot, dryRun, relocateOnly };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (
    !opts.packageRoot &&
    !opts.relocateOnly &&
    !process.env.AWOS_PLUGIN_STAGING
  ) {
    // When invoked from a clone of AWOS itself, default package root to repo.
    const candidate = path.resolve(__dirname, '..');
    if (require('fs').existsSync(path.join(candidate, 'plugins', 'awos'))) {
      opts.packageRoot = candidate;
    }
  }
  if (
    !opts.packageRoot &&
    !opts.relocateOnly &&
    !process.env.AWOS_PLUGIN_STAGING
  ) {
    console.error(
      'error: pass --package-root <awos-repo> (directory containing plugins/awos)'
    );
    process.exit(1);
  }

  const result = await syncCursorPlugin({
    root: opts.root,
    packageRoot: opts.packageRoot || opts.root,
    dryRun: opts.dryRun,
    relocateOnly: opts.relocateOnly,
  });

  if (result.skipped) {
    console.error(`warning: ${result.reason}`);
    process.exit(0);
  }
  if (result.dryRun) {
    console.log(
      `[dry-run] would run acplugin via ${result.runner} then relocate into .cursor/`
    );
    return;
  }
  console.log(
    `Layer C relocate: ${result.commands} command(s), ${result.skills} skill(s), ${result.agents} agent(s) under .cursor/`
  );
  console.log(
    'Tip: reload Agent; slash /awos-flow (not /flow, not /awos:flow).'
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
