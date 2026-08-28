'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const learningApp = fs.readFileSync(path.join(root, 'src/renderer/learning-app.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src/preload/index.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main/index.js'), 'utf8');

function referencedIds(source) {
  return [...source.matchAll(/(?:getElementById|byId)\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
}

describe('renderer DOM 계약', () => {
  it('렌더러가 정적으로 참조하는 모든 ID가 HTML에 존재한다', () => {
    const ids = [...new Set([...referencedIds(renderer), ...referencedIds(learningApp)])];
    const missing = ids.filter((id) => !new RegExp(`id=["']${id}["']`).test(html));
    assert.deepEqual(missing, []);
  });

  it('index.html은 CSP에 막히는 인라인 style 속성을 사용하지 않는다', () => {
    assert.doesNotMatch(html, /\sstyle=["']/i);
  });

  it('메인 화면 스크립트는 ES module로 로드된다', () => {
    assert.match(html, /<script type="module" src="renderer\.js"><\/script>/);
    assert.match(renderer, /import \{ initLearningApp \} from '\.\/learning-app\.js';/);
  });
});

describe('learning IPC 계약', () => {
  const methods = {
    getSnapshot: 'learning:getSnapshot',
    startChapter: 'learning:startChapter',
    updateChecklist: 'learning:updateChecklist',
    cancelChapter: 'learning:cancelChapter',
    copyPrompt: 'learning:copyPrompt',
    openChat: 'learning:openChat',
    completeChapter: 'learning:completeChapter',
    preparePriorAssessment: 'learning:preparePriorAssessment',
    previewPriorAssessment: 'learning:previewPriorAssessment',
    applyPriorAssessment: 'learning:applyPriorAssessment',
    prepareCurriculumAssessment: 'learning:prepareCurriculumAssessment',
    previewCurriculumAssessment: 'learning:previewCurriculumAssessment',
    applyCurriculumCoverage: 'learning:applyCurriculumCoverage',
    prepareCurriculumDetailAssessment: 'learning:prepareCurriculumDetailAssessment',
    previewCurriculumDetailAssessment: 'learning:previewCurriculumDetailAssessment',
    applyCurriculumDetailAssessment: 'learning:applyCurriculumDetailAssessment',
    setChatProvider: 'learning:setProvider',
  };

  for (const [method, channel] of Object.entries(methods)) {
    it(`${method} preload 메서드와 ${channel} main 핸들러가 함께 존재한다`, () => {
      assert.match(preload, new RegExp(`${method}\\(`));
      assert.ok(preload.includes(`ipcRenderer.invoke('${channel}'`));
      assert.ok(main.includes(`ipcMain.handle('${channel}'`));
    });
  }
});
