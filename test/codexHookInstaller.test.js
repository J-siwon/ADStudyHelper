'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  installHooks,
  isAdStudyHelperHandler,
} = require('../scripts/install-codex-hook');

test('Codex 훅 설치/제거가 기존 hooks.json 항목을 보존한다', (t) => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'adstudyhelper-codex-'));
  t.after(() => fs.rmSync(codexHome, { recursive: true, force: true }));

  const hooksPath = path.join(codexHome, 'hooks.json');
  const existing = {
    description: 'Existing user hooks.',
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: 'node existing-hook.js' }] },
      ],
    },
  };
  fs.writeFileSync(hooksPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');

  const installed = installHooks({ codexHome });
  assert.equal(installed.changed, true);
  assert.ok(installed.backupPath);
  assert.equal(fs.existsSync(installed.backupPath), true);
  assert.equal(fs.existsSync(path.join(installed.installDir, 'codex-hook.js')), true);
  assert.equal(fs.existsSync(path.join(installed.installDir, 'coding-agent-hook.js')), true);

  const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  assert.equal(config.description, existing.description);
  assert.equal(config.hooks.UserPromptSubmit[0].hooks[0].command, 'node existing-hook.js');
  for (const eventName of ['UserPromptSubmit', 'PostToolUse', 'Stop', 'SessionEnd']) {
    const handlers = config.hooks[eventName].flatMap((group) => group.hooks || []);
    assert.equal(handlers.filter(isAdStudyHelperHandler).length, 1);
  }

  const removed = installHooks({ codexHome, uninstall: true });
  assert.equal(removed.changed, true);
  assert.equal(fs.existsSync(removed.installDir), false);

  const after = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  assert.equal(after.hooks.UserPromptSubmit.length, 1);
  assert.equal(after.hooks.UserPromptSubmit[0].hooks[0].command, 'node existing-hook.js');
  assert.equal(after.hooks.PostToolUse, undefined);
  assert.equal(after.hooks.Stop, undefined);
  assert.equal(after.hooks.SessionEnd, undefined);
});
