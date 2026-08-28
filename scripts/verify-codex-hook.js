'use strict';

// 실제 codex exec 한 번을 실행해 UserPromptSubmit(working) → Stop(done) 훅을 검증한다.
// ADStudyHelper 본 앱과 충돌하지 않도록 별도 포트를 사용한다.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  startControlServer,
  stopControlServer,
  getCodingAgentCount,
  setCodingAgentStatusListener,
} = require('../src/main/controlServer');

const TEST_PORT = 47622;
const observedCounts = [];
let finished = false;

function codexInvocation() {
  if (process.platform !== 'win32') return { command: 'codex', prefixArgs: [] };
  const entrypoint = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  if (fs.existsSync(entrypoint)) return { command: process.execPath, prefixArgs: [entrypoint] };
  return { command: 'codex.cmd', prefixArgs: [] };
}

function finish(code, stdout, stderr) {
  if (finished) return;
  finished = true;
  setTimeout(() => {
    const finalCount = getCodingAgentCount();
    stopControlServer();
    if (stdout.trim()) process.stdout.write(stdout);
    if (stderr.trim()) process.stderr.write(stderr);
    console.log(`Observed ADStudyHelper counts: ${JSON.stringify(observedCounts)}`);

    const sawWorking = observedCounts.some((count) => count > 0);
    if (code !== 0 || !sawWorking || finalCount !== 0) {
      console.error(`Codex hook smoke test failed (codex=${code}, sawWorking=${sawWorking}, finalCount=${finalCount}).`);
      process.exitCode = 1;
      return;
    }
    console.log('Codex hook smoke test passed.');
  }, 500);
}

setCodingAgentStatusListener((_working, count) => {
  observedCounts.push(count);
});
startControlServer(TEST_PORT);

setTimeout(() => {
  let child;
  try {
    const invocation = codexInvocation();
    child = spawn(
      invocation.command,
      [
        ...invocation.prefixArgs,
        'exec',
        '--strict-config',
        '--dangerously-bypass-hook-trust',
        '--sandbox', 'read-only',
        '--ephemeral',
        '--color', 'never',
        'Reply with exactly OK. Do not call tools or modify files.',
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, ADSTUDYHELPER_PORT: String(TEST_PORT) },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  } catch (error) {
    finish(1, '', `${error.message}\n`);
    return;
  }

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', (error) => {
    stderr += `${error.message}\n`;
    finish(1, stdout, stderr);
  });
  child.on('close', (code) => finish(code, stdout, stderr));

  setTimeout(() => {
    if (child.exitCode === null) {
      stderr += 'Codex smoke test timed out after 120 seconds.\n';
      child.kill();
    }
  }, 120000).unref();
}, 200);
