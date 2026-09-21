/**
 * Cursor surfaces service — thin wrapper around scripts/lib/cursor-surfaces.cjs
 * so the orchestrator can require from src/services like other steps.
 */

'use strict';

const path = require('path');

function loadLib(packageRoot) {
  return require(path.join(packageRoot, 'scripts/lib/cursor-surfaces.cjs'));
}

/**
 * Configure all Cursor-facing surfaces after framework files are copied.
 *
 * @param {Object} opts
 * @param {string} opts.workingDir
 * @param {string} opts.packageRoot
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.skipPlugin] - skip acplugin (tests / offline)
 * @param {string|null} [opts.pluginStaging] - fixture staging for Layer C tests
 * @returns {Promise<Object>} statistics
 */
async function configureCursorSurfaces({
  workingDir,
  packageRoot,
  dryRun = false,
  skipPlugin = false,
  pluginStaging = null,
}) {
  const lib = loadLib(packageRoot);
  const { log } = require('../utils/logger');

  const rules = await lib.syncCursorRules({
    packageRoot,
    workingDir,
    dryRun,
  });
  log(
    dryRun
      ? `Would copy ${rules.rulesCopied} Cursor rule(s)`
      : `Copied ${rules.rulesCopied} Cursor rule(s)`,
    'success'
  );

  const cursorMcp = await lib.configureCursorMcp({
    workingDir,
    dryRun,
  });
  if (cursorMcp.cursorMcpConfigured) {
    log(
      dryRun
        ? 'Would configure .cursor/mcp.json'
        : 'Configured .cursor/mcp.json with awos-recruitment',
      'success'
    );
  } else {
    log('.cursor/mcp.json already has awos-recruitment configured', 'info');
  }

  const commands = await lib.syncCursorCommands({
    root: workingDir,
    dryRun,
  });
  log(
    dryRun
      ? `Would sync ${commands.commandsWritten} Cursor command wrapper(s)`
      : `Synced ${commands.commandsWritten} Cursor command wrapper(s)`,
    'success'
  );

  let plugin = { skipped: true, reason: 'skipped by caller' };
  if (!skipPlugin) {
    try {
      plugin = await lib.syncCursorPlugin({
        root: workingDir,
        packageRoot,
        dryRun,
        relocateOnly: Boolean(pluginStaging),
        stagingDir: pluginStaging,
      });
      if (plugin.skipped) {
        log(`Cursor plugin sync skipped: ${plugin.reason}`, 'info');
      } else if (plugin.dryRun) {
        log(
          `Would convert AWOS plugin via ${plugin.runner} → .cursor/ (Layer C)`,
          'info'
        );
      } else {
        log(
          `Cursor plugin: ${plugin.commands} command(s), ${plugin.skills} skill(s), ${plugin.agents} agent(s)`,
          'success'
        );
      }
    } catch (err) {
      log(
        `Cursor plugin sync failed (${err.message}) — Claude surfaces are installed; re-run with bunx/npx or fix acplugin`,
        'info'
      );
      plugin = {
        skipped: true,
        reason: err.message,
        commands: 0,
        skills: 0,
        agents: 0,
      };
    }
  }

  return {
    cursorRulesCopied: rules.rulesCopied,
    cursorCommandsWritten: commands.commandsWritten,
    cursorMcpConfigured: cursorMcp.cursorMcpConfigured,
    cursorPluginCommands: plugin.commands || 0,
    cursorPluginSkills: plugin.skills || 0,
    cursorPluginAgents: plugin.agents || 0,
    cursorPluginSkipped: Boolean(plugin.skipped),
  };
}

module.exports = { configureCursorSurfaces, loadLib };
