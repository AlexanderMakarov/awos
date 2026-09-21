#!/usr/bin/env node
/**
 * Regenerate flat Cursor AWOS slash commands from .awos/commands/*.md.
 *
 * Usage (from a project that already has AWOS installed):
 *   node .awos/scripts/sync-awos-cursor-commands.mjs
 *   node .awos/scripts/sync-awos-cursor-commands.mjs --root /path/to/project
 *
 * Prefer re-running the installer (`bunx github:AlexanderMakarov/awos`), which
 * runs this sync automatically.
 */

'use strict';

const path = require('path');
const { syncCursorCommands } = require('./lib/cursor-surfaces.cjs');

function parseArgs(argv) {
  let root = process.cwd();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) {
      root = path.resolve(argv[++i]);
    } else if (argv[i] === '--dry-run') {
      dryRun = true;
    }
  }
  return { root, dryRun };
}

async function main() {
  const { root, dryRun } = parseArgs(process.argv.slice(2));
  const { commandsWritten } = await syncCursorCommands({ root, dryRun });
  console.log(
    `${dryRun ? '[dry-run] would sync' : 'synced'} ${commandsWritten} Cursor AWOS command(s) from .awos/commands/`
  );
  console.log(
    'Tip: in Cursor Agent, type /awos- (not /awos:) — reload the window if the menu is stale.'
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
