/**
 * Setup Orchestrator
 * Coordinates the entire AWOS setup process
 * Single Responsibility: Orchestration of setup workflow
 */

const { AWOS_ASCII, AWOS_SUBTITLE, style } = require('../config/constants');
const { directories, copyOperations } = require('../config/setup-config');
const {
  showHeader,
  showStep,
  log,
  clearLine,
  showSummary,
} = require('../utils/logger');
const { createDirectories } = require('../services/directory-creator');
const { executeCopyOperations } = require('../services/file-copier');
const { configureMcp } = require('../services/mcp-configurator');
const {
  configureMarketplace,
} = require('../services/marketplace-configurator');
const { configureCursorSurfaces } = require('../services/cursor-surfaces');
const { stampVersion } = require('../services/version-stamper');
const { runMigrations } = require('../migrations/runner');

/**
 * Run the setup process
 * @param {Object} config - Setup configuration
 * @param {string} config.workingDir - The working directory where setup will be performed
 * @param {string} config.packageRoot - The root directory of the AWOS package
 * @param {boolean} config.dryRun - Run in dry-run mode (preview changes only)
 * @param {boolean} [config.skipCursorPlugin] - Skip acplugin Layer C (offline tests)
 * @param {string|null} [config.cursorPluginStaging] - Fixture staging for Layer C
 * @param {Function} [config.promptForOverwrite] - Async callback invoked by
 *   the file-copier for operations declared `preserveOnUpdate: true` when it
 *   finds existing files that would be overwritten. Signature:
 *   `async ({operation, files}) => boolean`. Defaults to a no-op that returns
 *   `false`, which is the safe default for non-interactive callers (CI,
 *   tests, piped runs); the CLI entry point wires a TTY-aware default.
 * @returns {Promise<void>}
 */
async function runSetup({
  workingDir,
  packageRoot,
  dryRun = false,
  skipCursorPlugin = false,
  cursorPluginStaging = null,
  promptForOverwrite,
}) {
  const TOTAL_STEPS = 8;

  // Display header
  showHeader(AWOS_ASCII, AWOS_SUBTITLE);

  // Show dry-run mode notice
  if (dryRun) {
    log(`${style.warn('DRY-RUN MODE:')} No files will be modified`, 'info');
    console.log('');
  }

  // Step 1: Initialization
  showStep(
    'Initialization',
    'Checking environment and preparing setup',
    1,
    TOTAL_STEPS
  );
  log(`Working directory: ${style.dim(workingDir)}`, 'item');

  // Step 2: Creating directories
  showStep(
    'Creating Directories',
    'Setting up project structure',
    2,
    TOTAL_STEPS
  );
  const directoryStatistics = await createDirectories({
    baseDir: workingDir,
    directories,
    dryRun,
  });
  clearLine();

  // Step 3: Running migrations
  showStep(
    'Running Migrations',
    'Updating existing project structure',
    3,
    TOTAL_STEPS
  );
  const migrationStatistics = await runMigrations(workingDir, { dryRun });
  clearLine();

  // Step 4: Installing components
  showStep(
    'Installing Components',
    'Copying commands, templates, and agents',
    4,
    TOTAL_STEPS
  );
  const fileStatistics = await executeCopyOperations({
    packageRoot,
    targetDir: workingDir,
    copyOperations,
    promptForOverwrite,
    dryRun,
  });

  // Step 5: Configure MCP (Claude .mcp.json)
  showStep(
    'Configuring MCP',
    'Setting up MCP server configuration',
    5,
    TOTAL_STEPS
  );
  const mcpStatistics = await configureMcp({ workingDir, dryRun });
  clearLine();

  // Step 6: Cursor surfaces (rules, .cursor/mcp.json, wrappers, acplugin)
  showStep(
    'Configuring Cursor',
    'Syncing Cursor commands, rules, MCP, and plugin surfaces',
    6,
    TOTAL_STEPS
  );
  const cursorStatistics = await configureCursorSurfaces({
    workingDir,
    packageRoot,
    dryRun,
    skipPlugin:
      skipCursorPlugin ||
      process.env.AWOS_SKIP_CURSOR_PLUGIN === '1' ||
      process.env.AWOS_SKIP_CURSOR_PLUGIN === 'true',
    pluginStaging:
      cursorPluginStaging || process.env.AWOS_PLUGIN_STAGING || null,
  });
  clearLine();

  // Step 7: Register Marketplace
  showStep(
    'Registering Marketplace',
    'Adding AWOS plugin marketplace to settings',
    7,
    TOTAL_STEPS
  );
  const marketplaceStatistics = await configureMarketplace({
    workingDir,
    dryRun,
  });
  clearLine();

  // Step 8: Stamp the installed version
  // Runs last, after migrations, copies, and both configurators: a crash
  // mid-install must never leave behind a stamp claiming a version that
  // was not fully installed.
  showStep(
    'Recording Version',
    'Stamping the installed AWOS version',
    8,
    TOTAL_STEPS
  );
  const versionStatistics = await stampVersion({
    workingDir,
    packageRoot,
    dryRun,
  });
  clearLine();

  // Display summary with combined statistics
  const statistics = {
    ...directoryStatistics,
    ...fileStatistics,
    ...mcpStatistics,
    ...cursorStatistics,
    ...marketplaceStatistics,
    ...versionStatistics,
    migrations: migrationStatistics.applied,
  };
  showSummary(statistics, { dryRun });
}

module.exports = { runSetup };
