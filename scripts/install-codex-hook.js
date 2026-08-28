'use strict';

// Codex 사용자 hooks.json에 ADStudyHelper 활동 훅을 병합/제거한다.
// 기존 훅은 그대로 보존하며, 변경 전 hooks.json 백업을 같은 폴더에 남긴다.

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK_EVENTS = [
  { name: 'UserPromptSubmit', action: 'working', async: true },
  { name: 'PostToolUse', action: 'working', async: true, matcher: '*' },
  { name: 'Stop', action: 'done', async: false },
  { name: 'SessionEnd', action: 'done', async: false },
];

function normalizeCommandPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function commandFor(hookPath, action) {
  return `node "${normalizeCommandPath(hookPath)}" ${action}`;
}

function isAdStudyHelperHandler(handler) {
  if (!handler || typeof handler !== 'object') return false;
  const commands = [handler.command, handler.commandWindows, handler.command_windows]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return commands.includes('/adstudyhelper/codex-hook.js') || commands.includes('\\adstudyhelper\\codex-hook.js');
}

function removeAdStudyHelperHooks(config) {
  if (!config.hooks || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) return false;
  let changed = false;

  for (const eventName of Object.keys(config.hooks)) {
    const groups = config.hooks[eventName];
    if (!Array.isArray(groups)) continue;

    const nextGroups = [];
    for (const group of groups) {
      if (!group || !Array.isArray(group.hooks)) {
        nextGroups.push(group);
        continue;
      }
      const handlers = group.hooks.filter((handler) => !isAdStudyHelperHandler(handler));
      if (handlers.length !== group.hooks.length) changed = true;
      if (handlers.length > 0) nextGroups.push({ ...group, hooks: handlers });
    }

    if (nextGroups.length > 0) config.hooks[eventName] = nextGroups;
    else {
      delete config.hooks[eventName];
      if (groups.length > 0) changed = true;
    }
  }

  return changed;
}

function addAdStudyHelperHooks(config, hookPath) {
  if (!config.hooks || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) {
    config.hooks = {};
  }

  const commandPath = normalizeCommandPath(hookPath);
  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(config.hooks[event.name])) config.hooks[event.name] = [];
    const command = commandFor(commandPath, event.action);
    const handler = {
      type: 'command',
      command,
      commandWindows: command,
      timeout: 3,
    };
    if (event.async) handler.async = true;

    const group = { hooks: [handler] };
    if (event.matcher) group.matcher = event.matcher;
    config.hooks[event.name].push(group);
  }
}

function readConfig(hooksPath) {
  if (!fs.existsSync(hooksPath)) {
    return { description: 'ADStudyHelper Codex activity hooks.', hooks: {} };
  }
  const text = fs.readFileSync(hooksPath, 'utf8');
  const config = JSON.parse(text);
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`${hooksPath} must contain a JSON object.`);
  }
  return config;
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/[TZ.]/g, '-');
  const backupPath = `${filePath}.backup-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function removeInstalledScripts(installDir) {
  for (const fileName of ['codex-hook.js', 'coding-agent-hook.js']) {
    const target = path.join(installDir, fileName);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  if (fs.existsSync(installDir) && fs.readdirSync(installDir).length === 0) {
    fs.rmdirSync(installDir);
  }
}

function installHooks(options = {}) {
  const codexHome = path.resolve(options.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
  const hooksPath = path.join(codexHome, 'hooks.json');
  const installDir = path.join(codexHome, 'hooks', 'adstudyhelper');
  const installedHookPath = path.join(installDir, 'codex-hook.js');
  const config = readConfig(hooksPath);
  const before = JSON.stringify(config);

  removeAdStudyHelperHooks(config);
  if (!options.uninstall) addAdStudyHelperHooks(config, installedHookPath);

  const changed = before !== JSON.stringify(config);
  let backupPath = null;
  if (!options.dryRun) {
    fs.mkdirSync(codexHome, { recursive: true });
    if (!options.uninstall) {
      fs.mkdirSync(installDir, { recursive: true });
      fs.copyFileSync(path.join(__dirname, 'codex-hook.js'), path.join(installDir, 'codex-hook.js'));
      fs.copyFileSync(path.join(__dirname, 'coding-agent-hook.js'), path.join(installDir, 'coding-agent-hook.js'));
    }
    if (changed) {
      backupPath = backupFile(hooksPath);
      fs.writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    }
    if (options.uninstall) removeInstalledScripts(installDir);
  }

  return { backupPath, changed, codexHome, hooksPath, installDir, config };
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const result = installHooks({
    codexHome: valueAfter(args, '--codex-home'),
    dryRun: args.includes('--dry-run'),
    uninstall: args.includes('--uninstall'),
  });
  const verb = args.includes('--uninstall') ? 'removed' : 'installed';
  console.log(`ADStudyHelper Codex hooks ${verb}: ${result.hooksPath}`);
  if (result.backupPath) console.log(`Backup: ${result.backupPath}`);
  if (!result.changed) console.log('Hook configuration was already up to date.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Failed to update Codex hooks: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  addAdStudyHelperHooks,
  installHooks,
  isAdStudyHelperHandler,
  removeAdStudyHelperHooks,
};
