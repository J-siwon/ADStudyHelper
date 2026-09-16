const DEFAULT_CHAPTER_ID = 'memory-alignment';

function byId(id) {
  return document.getElementById(id);
}

function setStatus(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function statusLabel(status) {
  return ({ Ready: 'READY', Progress: 'PROGRESS', Learning: 'LEARNING', Completed: 'COMPLETED' })[status] || String(status || '').toUpperCase();
}

function coverageLevelLabel(level) {
  return ({ unseen: '기록 없음', familiar: '개념 접함', practiced: '추론·문제 풀이', applied: '적용·설명' })[level] || '기록 없음';
}

function providerLabel(provider) {
  return provider === 'claude' ? 'Claude' : 'ChatGPT';
}

function difficultyLabel(difficulty) {
  return ({ basic: '기본', applied: '응용', advanced: '심화' })[difficulty] || difficulty;
}

function errorMessage(error) {
  const raw = error && error.message ? error.message : String(error);
  const messages = {
    another_session_active: '다른 챕터를 학습 중입니다. 현재 세션을 먼저 완료해 주세요.',
    chapter_already_completed: '이미 완료한 챕터입니다.',
    chapter_not_learning: '현재 학습 중인 챕터가 아닙니다.',
    prior_learning_source_required: '이전 학습 기록을 먼저 붙여넣어 주세요.',
    assessment_response_required: 'AI 판정 결과를 붙여넣어 주세요.',
    assessment_json_not_found: '판정 결과에서 JSON 객체를 찾지 못했습니다.',
    assessment_json_invalid: '판정 JSON 형식이 올바르지 않습니다.',
    assessment_contract_mismatch: '지원하지 않는 판정 결과 형식입니다.',
    assessment_chapter_mismatch: '현재 챕터와 다른 판정 결과입니다.',
    nothing_selected: '적용할 단계나 목표를 하나 이상 선택해 주세요.',
    curriculum_chapter_selection_required: '분석하거나 적용할 챕터를 하나 이상 선택해 주세요.',
    invalid_curriculum_chapter_ids: '선택한 챕터 목록이 올바르지 않습니다.',
    stage_out_of_order: '현재 표시된 단계부터 순서대로 완료해 주세요.',
    stage_result_mismatch: '현재 챕터·단계와 다른 AI 결과입니다.',
    objective_result_mismatch: '현재 목표와 다른 AI 결과입니다.',
    review_result_mismatch: '현재 복습 목표와 다른 AI 결과입니다.',
    invalid_review_grade: '복습 판정 등급이 올바르지 않습니다.',
    objective_already_completed: '이미 달성한 목표입니다.',
  };
  const key = Object.keys(messages).find((code) => raw.includes(code));
  return key ? messages[key] : raw;
}

export function initLearningApp() {
  const api = window.learningAPI;
  let snapshot = null;
  let selectedChapterId = DEFAULT_CHAPTER_ID;
  let currentView = 'home';
  let assessmentPreview = null;
  let curriculumAssessmentPreview = null;
  let curriculumDetailPreviewData = null;
  let curriculumDetailChapterIds = [];
  let stageResultPreview = null;
  let objectiveSessionTarget = null;
  let objectiveResultPreview = null;
  let reviewTarget = null;
  let reviewResultPreview = null;

  const views = [...document.querySelectorAll('[data-view]')];
  const navItems = [...document.querySelectorAll('.side-nav [data-view-target]')];
  const homePrimaryBtn = byId('homePrimaryBtn');
  const chapterStartBtn = byId('chapterStartBtn');
  const priorLearningBtn = byId('priorLearningBtn');
  const chapterActionStatus = byId('chapterActionStatus');
  const sessionActionStatus = byId('sessionActionStatus');
  const completeStageBtn = byId('completeStageBtn');
  const startStageBtn = byId('startStageBtn');
  const cancelChapterBtn = byId('cancelChapterBtn');
  const cancelLearningDialog = byId('cancelLearningDialog');
  const confirmCancelChapterBtn = byId('confirmCancelChapterBtn');
  const priorLearningDialog = byId('priorLearningDialog');
  const curriculumImportDialog = byId('curriculumImportDialog');

  function catalogChapter(chapterId) {
    return snapshot?.chapterCatalog.find((chapter) => chapter.id === chapterId) || null;
  }

  function chapterState(chapterId) {
    return snapshot?.state.chapters[chapterId] || null;
  }

  function pathLabel(chapter, separator = ' / ') {
    return [...chapter.path, chapter.title].join(separator);
  }

  function showView(name) {
    currentView = name;
    views.forEach((view) => view.classList.toggle('active', view.dataset.view === name));
    navItems.forEach((item) => item.classList.toggle('active', item.dataset.viewTarget === name));
    document.querySelector('.workspace')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openChapter(chapterId) {
    if (!catalogChapter(chapterId)) return;
    selectedChapterId = chapterId;
    renderChapter();
    showView('chapter');
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-view-target]');
    if (!target) return;
    showView(target.dataset.viewTarget);
  });
  byId('focusMiniCard')?.addEventListener('click', () => showView('focus'));

  const todayLabel = byId('todayLabel');
  if (todayLabel) {
    todayLabel.textContent = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    }).format(new Date());
  }

  function countAreaChapters(area) {
    return area.topics.reduce((count, topic) => count + (topic.chapters ? topic.chapters.length : 1), 0);
  }

  function createChapterNode(chapterReference) {
    const state = chapterState(chapterReference.id);
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `chapter-node active${state.status === 'Completed' ? ' completed' : ''}${state.status === 'Learning' ? ' learning' : ''}${state.status === 'Progress' ? ' progress' : ''}`;
    const nodeTitle = document.createElement('span');
    nodeTitle.textContent = chapterReference.title;
    const meta = document.createElement('small');
    const coverage = state.priorCoverage;
    const achieved = state.checkedObjectiveIds.length;
    meta.textContent = coverage && coverage.level !== 'unseen' && state.status !== 'Completed'
      ? `${statusLabel(state.status)} · 목표 ${achieved}/5 · ${coverageLevelLabel(coverage.level)}`
      : `${statusLabel(state.status)} · 목표 ${achieved}/5`;
    node.append(nodeTitle, meta);
    node.addEventListener('click', () => openChapter(chapterReference.id));
    return node;
  }

  function renderCurriculum() {
    const grid = byId('curriculumGrid');
    if (!grid || !snapshot) return;
    grid.replaceChildren();

    snapshot.curriculum.forEach((area) => {
      const card = document.createElement('article');
      card.className = `area-card${area.id === 'computer-science' ? ' active-area' : ''}`;
      const eyebrow = document.createElement('p');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = `${countAreaChapters(area)} chapters available`;
      const title = document.createElement('h3');
      title.textContent = area.title;
      const description = document.createElement('p');
      description.textContent = area.description;
      card.append(eyebrow, title, description);

      const directTopics = area.topics.filter((topic) => !topic.chapters);
      if (directTopics.length) {
        const topicList = document.createElement('div');
        topicList.className = 'chapter-topic-list';
        directTopics.forEach((topic) => topicList.appendChild(createChapterNode(topic)));
        card.appendChild(topicList);
      }

      area.topics.filter((topic) => topic.chapters).forEach((topic) => {
        const group = document.createElement('div');
        group.className = 'memory-path';
        const groupTitle = document.createElement('h4');
        groupTitle.textContent = topic.title;
        group.appendChild(groupTitle);
        topic.chapters.forEach((chapter) => group.appendChild(createChapterNode(chapter)));
        card.appendChild(group);
      });
      grid.appendChild(card);
    });
  }

  function renderReviews() {
    const list = byId('reviewList');
    const dueCount = byId('reviewDueCount');
    if (!list || !snapshot) return;
    const all = [
      ...snapshot.reviews.due.map((review) => ({ ...review, due: true, kind: 'scheduled' })),
      ...snapshot.reviews.recovery.map((review) => ({ ...review, due: true, kind: 'surprise' })),
      ...snapshot.reviews.surprise.assignments
        .filter((item) => item.status === 'pending' || item.multiplier < 1)
        .map((review) => ({ ...review, due: true, kind: 'surprise' })),
      ...snapshot.reviews.upcoming.map((review) => ({ ...review, due: false, kind: 'scheduled' })),
    ].sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    if (dueCount) dueCount.textContent = String(all.filter((review) => review.due).length);
    const surprise = snapshot.reviews.surprise;
    if (byId('surpriseProgress')) byId('surpriseProgress').textContent = `이번 주 기습 질문 ${surprise.completed} / ${surprise.configuredTarget}`;
    if (byId('surpriseDueDate')) byId('surpriseDueDate').textContent = surprise.dueDate ? `${surprise.dueDate}까지` : '';
    list.replaceChildren();
    if (!all.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = '목표를 달성하면 목표별 복습 일정이 등록됩니다.';
      list.appendChild(empty);
      return;
    }
    all.slice(0, 12).forEach((review) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `review-item${review.due ? ' due' : ''}`;
      const name = document.createElement('span');
      name.className = 'review-item-copy';
      const chapterName = document.createElement('strong');
      chapterName.textContent = review.chapterTitle;
      const objectiveName = document.createElement('small');
      objectiveName.textContent = review.objectiveDescription;
      name.append(chapterName, objectiveName);
      const date = document.createElement('strong');
      date.textContent = review.kind === 'surprise' ? '기습 질문' : `${review.phaseLabel} · ${review.dueDate}`;
      item.append(name, date);
      item.addEventListener('click', () => openReview(review, review.kind));
      list.appendChild(item);
    });
  }

  function checklistProgress(state, chapter) {
    const checked = state.checkedStageIds.length;
    const total = chapter.stages.length;
    return total ? Math.round((checked / total) * 100) : 0;
  }

  function applyStatusPill(pill, status) {
    if (!pill) return;
    pill.textContent = statusLabel(status);
    pill.classList.toggle('learning', status === 'Learning');
    pill.classList.toggle('progress', status === 'Progress');
    pill.classList.toggle('completed', status === 'Completed');
  }

  function renderHome() {
    const featuredId = snapshot.activeChapterId || snapshot.featuredChapterId || DEFAULT_CHAPTER_ID;
    const chapter = catalogChapter(featuredId);
    const state = chapterState(featuredId);
    if (!chapter || !state) return;
    const progress = state.status === 'Completed' ? 100 : checklistProgress(state, chapter);
    applyStatusPill(byId('homeChapterStatus'), state.status);
    byId('homeProgressRing')?.style.setProperty('--progress', `${progress}%`);
    if (byId('homeProgressText')) byId('homeProgressText').textContent = `${progress}%`;
    if (byId('homeChapterBreadcrumb')) byId('homeChapterBreadcrumb').textContent = chapter.path.join(' / ');
    if (byId('homeChapterTitle')) byId('homeChapterTitle').textContent = chapter.title;
    if (byId('homeChapterMessage')) {
      byId('homeChapterMessage').textContent = state.status === 'Learning'
        ? '외부 AI 학습을 이어가고, 완료한 단계와 목표를 직접 확인하세요.'
        : state.status === 'Progress'
          ? '이전 학습에서 확인한 진행도가 있습니다. 남은 목표부터 학습을 시작하세요.'
        : state.status === 'Completed'
          ? '첫 학습 사이클을 완료했습니다. 등록된 복습 일정을 확인하세요.'
          : chapter.description;
    }
    homePrimaryBtn.textContent = state.status === 'Learning' ? '이어서 공부하기' : state.status === 'Completed' ? '완료 기록 보기' : '챕터 살펴보기';
    homePrimaryBtn.dataset.chapterId = featuredId;

    const progressInfo = snapshot.releasedProgress;
    if (byId('releasedProgressText')) byId('releasedProgressText').textContent = `${progressInfo.completed} / ${progressInfo.total}`;
    const progressPercent = progressInfo.total ? Math.round((progressInfo.completed / progressInfo.total) * 100) : 0;
    byId('releasedProgressBar')?.style.setProperty('width', `${progressPercent}%`);

    const rating = snapshot.rating;
    if (byId('ratingTier')) byId('ratingTier').textContent = rating.tier.display;
    if (byId('ratingRp')) byId('ratingRp').textContent = `${rating.effectiveRp} / ${rating.maxRp} RP`;
    const nextProgress = rating.maxRp ? Math.min(100, (rating.effectiveRp / rating.maxRp) * 100) : 0;
    byId('ratingProgressBar')?.style.setProperty('width', `${nextProgress}%`);
    if (byId('ratingNextText')) {
      byId('ratingNextText').textContent = rating.nextTier
        ? `${rating.nextTier}까지 ${Math.max(0, rating.nextThresholdRp - rating.effectiveRp)} RP · 목표 ${rating.achievedObjectives}/${rating.totalObjectives}`
        : `모든 목표 달성 · ${rating.maxRp} RP`;
    }
    const penalty = byId('ratingPenaltyText');
    if (penalty) {
      penalty.classList.toggle('is-hidden', rating.penaltyRp <= 0);
      penalty.textContent = rating.penaltyRp > 0 ? `복습 페널티 -${rating.penaltyRp} RP · 지금 복습하면 회복할 수 있습니다.` : '';
    }
  }

  function renderPrerequisites(chapter) {
    const container = byId('prerequisiteList');
    if (!container) return;
    container.replaceChildren();
    if (!chapter.prerequisites.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = '필수 선행 챕터가 없습니다.';
      container.appendChild(empty);
      return;
    }
    chapter.prerequisites.forEach((chapterId) => {
      const prerequisite = catalogChapter(chapterId);
      const state = chapterState(chapterId);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'prerequisite-item prerequisite-item--button';
      const mark = document.createElement('span');
      mark.textContent = state.status === 'Completed' ? '✓' : '○';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = prerequisite.title;
      const status = document.createElement('small');
      status.textContent = statusLabel(state.status);
      copy.append(title, status);
      item.append(mark, copy);
      item.addEventListener('click', () => openChapter(chapterId));
      container.appendChild(item);
    });
  }

  function renderObjectivePreview(chapter) {
    const list = byId('objectivePreview');
    if (!list) return;
    list.replaceChildren();
    const state = chapterState(chapter.id);
    chapter.objectives.forEach((objective) => {
      const completed = state.checkedObjectiveIds.includes(objective.id);
      const item = document.createElement('div');
      item.className = `objective-row${completed ? ' completed' : ''}`;
      const mark = document.createElement('span');
      mark.className = 'objective-mark';
      mark.textContent = completed ? '✓' : '○';
      const copy = document.createElement('div');
      const description = document.createElement('span');
      description.textContent = objective.description;
      const meta = document.createElement('small');
      const rp = snapshot.balance.objectiveRp[objective.difficulty];
      meta.textContent = `${difficultyLabel(objective.difficulty)} · ${rp} RP${completed ? ' · 달성 완료' : ''}`;
      copy.append(description, meta);
      const action = document.createElement('button');
      action.type = 'button';
      action.textContent = completed ? '복습 일정' : '집중 학습';
      action.disabled = completed;
      if (!completed) action.addEventListener('click', () => startObjectiveFocus(chapter.id, objective.id));
      item.append(mark, copy, action);
      list.appendChild(item);
    });
    if (byId('chapterObjectiveCount')) byId('chapterObjectiveCount').textContent = `${state.checkedObjectiveIds.length} / ${chapter.objectives.length}`;
  }

  function renderChapter() {
    if (!snapshot) return;
    const chapter = catalogChapter(selectedChapterId) || catalogChapter(DEFAULT_CHAPTER_ID);
    selectedChapterId = chapter.id;
    const state = chapterState(chapter.id);
    if (byId('chapterBreadcrumb')) byId('chapterBreadcrumb').textContent = chapter.path.join(' / ');
    if (byId('chapterTitle')) byId('chapterTitle').textContent = chapter.title;
    if (byId('chapterDescription')) byId('chapterDescription').textContent = chapter.description;
    applyStatusPill(byId('chapterStatus'), state.status);
    renderObjectivePreview(chapter);
    renderPrerequisites(chapter);

    const stagesComplete = state.checkedStageIds.length === chapter.stages.length;
    chapterStartBtn.textContent = state.status === 'Learning'
      ? '이어서 공부하기'
      : state.status === 'Progress'
        ? '남은 내용 이어서 시작'
        : stagesComplete ? '6단계 완료' : '챕터 시작';
    chapterStartBtn.disabled = stagesComplete;
    priorLearningBtn.disabled = false;
  }

  function renderChecklist(containerId, items, checkedIds, kind) {
    const container = byId(containerId);
    if (!container) return;
    container.replaceChildren();
    items.forEach((item) => {
      const label = document.createElement('label');
      label.className = `check-item${checkedIds.includes(item.id) ? ' checked' : ''}`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = item.id;
      input.dataset.checkKind = kind;
      input.checked = checkedIds.includes(item.id);
      const text = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = item.title || item.description;
      text.appendChild(title);
      if (item.title && item.description) {
        const description = document.createElement('small');
        description.textContent = item.description;
        text.appendChild(description);
      }
      label.append(input, text);
      container.appendChild(label);
    });
  }

  function renderSession() {
    if (!snapshot) return;
    byId('stageRewardCard')?.classList.add('is-hidden');
    const chapterId = selectedChapterId || snapshot.activeChapterId;
    const chapter = catalogChapter(chapterId);
    const state = chapterState(chapterId);
    if (!chapter || !state) return;
    selectedChapterId = chapterId;
    if (byId('sessionBreadcrumb')) byId('sessionBreadcrumb').textContent = `현재 학습 / ${chapter.path.join(' / ')}`;
    if (byId('sessionChapterTitle')) byId('sessionChapterTitle').textContent = chapter.title;
    const stage = chapter.stages.find((item) => !state.checkedStageIds.includes(item.id));
    if (!stage) return;
    if (byId('currentStageTitle')) byId('currentStageTitle').textContent = stage.title;
    if (byId('currentStageDescription')) byId('currentStageDescription').textContent = stage.description;
    if (byId('stageCount')) byId('stageCount').textContent = `${state.checkedStageIds.length + 1} / ${chapter.stages.length}`;
    if (byId('objectiveCount')) byId('objectiveCount').textContent = `달성 목표 ${state.checkedObjectiveIds.length} / ${chapter.objectives.length}`;
    completeStageBtn.dataset.stageId = stage.id;
    const stageIsActive = state.status === 'Learning';
    completeStageBtn.classList.toggle('is-hidden', !stageIsActive);
    startStageBtn.classList.toggle('is-hidden', stageIsActive);
    cancelChapterBtn.disabled = state.status !== 'Learning';
    if (byId('providerHeading')) byId('providerHeading').textContent = `${providerLabel(snapshot.chatProvider)}에서 ${chapter.title} 학습 중`;
  }

  function render() {
    if (!snapshot) return;
    renderCurriculum();
    renderReviews();
    renderHome();
    renderChapter();
    renderSession();
  }

  async function reload() {
    if (!api) throw new Error('learning_api_unavailable');
    snapshot = await api.getSnapshot();
    if (!catalogChapter(selectedChapterId)) selectedChapterId = snapshot.featuredChapterId || DEFAULT_CHAPTER_ID;
    if (snapshot.activeChapterId) selectedChapterId = snapshot.activeChapterId;
    render();
  }

  homePrimaryBtn?.addEventListener('click', () => {
    selectedChapterId = homePrimaryBtn.dataset.chapterId || snapshot.featuredChapterId;
    const state = chapterState(selectedChapterId);
    showView(state.status === 'Learning' ? 'session' : 'chapter');
    if (state.status === 'Learning') renderSession(); else renderChapter();
  });

  chapterStartBtn?.addEventListener('click', async () => {
    const state = chapterState(selectedChapterId);
    if (state.status === 'Learning') {
      renderSession();
      showView('session');
      return;
    }
    setStatus(chapterActionStatus, '맞춤 프롬프트를 복사하고 채팅 사이트를 여는 중…');
    chapterStartBtn.disabled = true;
    try {
      snapshot = await api.startChapter(selectedChapterId);
      render();
      setStatus(sessionActionStatus, '맞춤 프롬프트가 복사되었습니다. 채팅 입력창에 붙여넣으세요.');
      showView('session');
    } catch (error) {
      await reload().catch(() => {});
      if (snapshot?.activeChapterId === selectedChapterId) showView('session');
      setStatus(chapterActionStatus, `시작하지 못했습니다: ${errorMessage(error)}`, true);
    } finally {
      const latestState = chapterState(selectedChapterId);
      if (latestState && latestState.status !== 'Completed') chapterStartBtn.disabled = false;
    }
  });

  byId('copyPromptBtn')?.addEventListener('click', async () => {
    try {
      await api.copyPrompt(selectedChapterId, completeStageBtn.dataset.stageId);
      setStatus(sessionActionStatus, '현재 단계 프롬프트를 다시 복사했습니다.');
    } catch (error) {
      setStatus(sessionActionStatus, `복사 실패: ${errorMessage(error)}`, true);
    }
  });

  byId('openChatBtn')?.addEventListener('click', async () => {
    try {
      await api.openChat();
      setStatus(sessionActionStatus, `${providerLabel(snapshot.chatProvider)}를 열었습니다.`);
    } catch (error) {
      setStatus(sessionActionStatus, `사이트 열기 실패: ${errorMessage(error)}`, true);
    }
  });

  startStageBtn?.addEventListener('click', async () => {
    startStageBtn.disabled = true;
    setStatus(sessionActionStatus, '다음 단계 프롬프트를 복사하고 채팅을 여는 중…');
    try {
      snapshot = await api.startChapter(selectedChapterId);
      render();
      setStatus(sessionActionStatus, '현재 단계 프롬프트를 복사했습니다.');
    } catch (error) {
      setStatus(sessionActionStatus, errorMessage(error), true);
    } finally {
      startStageBtn.disabled = false;
    }
  });

  completeStageBtn?.addEventListener('click', () => {
    stageResultPreview = null;
    byId('stageResultInput').value = '';
    byId('stageResultObjectives').replaceChildren();
    byId('confirmStageResultBtn').disabled = true;
    setStatus(byId('stageResultStatus'), '');
    byId('stageResultDialog')?.showModal();
  });

  byId('previewStageResultBtn')?.addEventListener('click', async () => {
    setStatus(byId('stageResultStatus'), 'AI 결과를 확인하는 중…');
    try {
      stageResultPreview = await api.previewStageResult(
        selectedChapterId,
        completeStageBtn.dataset.stageId,
        byId('stageResultInput').value
      );
      const chapter = catalogChapter(selectedChapterId);
      const state = chapterState(selectedChapterId);
      const container = byId('stageResultObjectives');
      container.replaceChildren();
      stageResultPreview.achievedObjectives.forEach((recommendation) => {
        const objective = chapter.objectives.find((item) => item.id === recommendation.id);
        if (state.checkedObjectiveIds.includes(objective.id)) return;
        const label = document.createElement('label');
        label.className = `check-item${recommendation.achieved ? ' checked' : ''}`;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = objective.id;
        input.dataset.stageResultObjective = 'true';
        input.checked = recommendation.achieved;
        const copy = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = `${difficultyLabel(objective.difficulty)} · ${snapshot.balance.objectiveRp[objective.difficulty]} RP`;
        const description = document.createElement('small');
        description.textContent = `${objective.description} · ${recommendation.evidence}`;
        copy.append(title, description);
        label.append(input, copy);
        container.appendChild(label);
      });
      byId('confirmStageResultBtn').disabled = false;
      setStatus(byId('stageResultStatus'), '제안된 목표를 직접 확인·수정한 뒤 확정하세요.');
    } catch (error) {
      stageResultPreview = null;
      byId('confirmStageResultBtn').disabled = true;
      setStatus(byId('stageResultStatus'), errorMessage(error), true);
    }
  });

  byId('stageResultObjectives')?.addEventListener('change', (event) => {
    event.target.closest('.check-item')?.classList.toggle('checked', event.target.checked);
  });

  byId('confirmStageResultBtn')?.addEventListener('click', async () => {
    if (!stageResultPreview) return;
    const button = byId('confirmStageResultBtn');
    button.disabled = true;
    const objectiveIds = [...document.querySelectorAll('[data-stage-result-objective]:checked')].map((input) => input.value);
    const evidenceById = Object.fromEntries(stageResultPreview.achievedObjectives.map((item) => [item.id, item.evidence]));
    try {
      snapshot = await api.completeStage(selectedChapterId, completeStageBtn.dataset.stageId, objectiveIds, evidenceById);
      byId('stageResultDialog').close();
      const reward = snapshot.reward;
      render();
      const chapter = catalogChapter(selectedChapterId);
      const state = chapterState(selectedChapterId);
      if (state.status === 'Completed') {
        showView('chapter');
        setStatus(chapterActionStatus, `6단계를 완료했습니다. 새 목표 ${reward.objectiveIds.length}개 · +${reward.rp} RP`);
      } else {
        showView('session');
        byId('stageRewardCard').classList.remove('is-hidden');
        byId('stageRewardTitle').textContent = reward.previousTier.display === reward.tier.display
          ? '단계 완료'
          : `${reward.tier.display} 승급!`;
        byId('stageRewardText').textContent = `새 목표 ${reward.objectiveIds.length}개 · +${reward.rp} RP · 현재 ${snapshot.rating.effectiveRp} RP`;
      }
    } catch (error) {
      setStatus(byId('stageResultStatus'), errorMessage(error), true);
      button.disabled = false;
    }
  });

  byId('showNextStageBtn')?.addEventListener('click', () => {
    byId('stageRewardCard').classList.add('is-hidden');
    renderSession();
  });

  async function startObjectiveFocus(chapterId, objectiveId) {
    const chapter = catalogChapter(chapterId);
    const objective = chapter.objectives.find((item) => item.id === objectiveId);
    objectiveSessionTarget = { chapterId, objectiveId };
    objectiveResultPreview = null;
    byId('objectiveResultTitle').textContent = `${chapter.title} · 목표 집중 학습`;
    byId('objectiveResultInput').value = '';
    byId('objectiveResultEvidence').textContent = objective.description;
    byId('confirmObjectiveResultBtn').disabled = true;
    setStatus(byId('objectiveResultStatus'), '프롬프트를 복사하고 채팅 사이트를 여는 중…');
    byId('objectiveResultDialog')?.showModal();
    try {
      await api.startObjectiveSession(chapterId, objectiveId);
      setStatus(byId('objectiveResultStatus'), '목표 집중 프롬프트를 복사했습니다. 학습 후 JSON을 붙여넣으세요.');
    } catch (error) {
      setStatus(byId('objectiveResultStatus'), errorMessage(error), true);
    }
  }

  byId('previewObjectiveResultBtn')?.addEventListener('click', async () => {
    if (!objectiveSessionTarget) return;
    try {
      objectiveResultPreview = await api.previewObjectiveResult(
        objectiveSessionTarget.chapterId,
        objectiveSessionTarget.objectiveId,
        byId('objectiveResultInput').value
      );
      byId('objectiveResultEvidence').textContent = `${objectiveResultPreview.evidence} ${objectiveResultPreview.feedback}`;
      byId('confirmObjectiveResultBtn').disabled = !objectiveResultPreview.achieved;
      setStatus(byId('objectiveResultStatus'), objectiveResultPreview.achieved ? '달성 근거를 확인하고 확정하세요.' : 'AI가 아직 목표 달성을 인정하지 않았습니다.', !objectiveResultPreview.achieved);
    } catch (error) {
      setStatus(byId('objectiveResultStatus'), errorMessage(error), true);
    }
  });

  byId('confirmObjectiveResultBtn')?.addEventListener('click', async () => {
    if (!objectiveSessionTarget || !objectiveResultPreview?.achieved) return;
    try {
      snapshot = await api.completeObjectiveSession(objectiveSessionTarget.chapterId, objectiveSessionTarget.objectiveId, objectiveResultPreview.evidence);
      byId('objectiveResultDialog').close();
      render();
      setStatus(chapterActionStatus, `목표 달성 · +${snapshot.reward.rp} RP · ${snapshot.rating.tier.display}`);
    } catch (error) {
      setStatus(byId('objectiveResultStatus'), errorMessage(error), true);
    }
  });

  async function openReview(review, kind) {
    reviewTarget = { ...review, kind };
    reviewResultPreview = null;
    byId('reviewResultTitle').textContent = `${review.chapterTitle} · ${review.phaseLabel}`;
    byId('reviewResultInput').value = '';
    byId('reviewResultEvidence').textContent = review.objectiveDescription;
    byId('confirmReviewResultBtn').disabled = true;
    setStatus(byId('reviewResultStatus'), '복습 프롬프트를 준비하는 중…');
    byId('reviewResultDialog')?.showModal();
    try {
      await api.startReview({ ...review, retry: review.multiplier < 1 });
      setStatus(byId('reviewResultStatus'), '복습 프롬프트를 복사했습니다. 답변 후 JSON을 붙여넣으세요.');
    } catch (error) {
      setStatus(byId('reviewResultStatus'), errorMessage(error), true);
    }
  }

  byId('previewReviewResultBtn')?.addEventListener('click', async () => {
    if (!reviewTarget) return;
    try {
      reviewResultPreview = await api.previewReviewResult(reviewTarget.chapterId, reviewTarget.objectiveId, byId('reviewResultInput').value);
      byId('reviewGradeSelect').value = reviewResultPreview.grade;
      byId('reviewResultEvidence').textContent = `${reviewResultPreview.evidence} ${reviewResultPreview.feedback}`;
      byId('confirmReviewResultBtn').disabled = false;
      setStatus(byId('reviewResultStatus'), 'AI 판정을 확인하거나 수정한 뒤 확정하세요.');
    } catch (error) {
      setStatus(byId('reviewResultStatus'), errorMessage(error), true);
    }
  });

  byId('confirmReviewResultBtn')?.addEventListener('click', async () => {
    if (!reviewTarget || !reviewResultPreview) return;
    try {
      snapshot = await api.completeReview(
        reviewTarget.chapterId,
        reviewTarget.objectiveId,
        byId('reviewGradeSelect').value,
        reviewTarget.kind
      );
      byId('reviewResultDialog').close();
      render();
    } catch (error) {
      setStatus(byId('reviewResultStatus'), errorMessage(error), true);
    }
  });

  cancelChapterBtn?.addEventListener('click', () => {
    setStatus(byId('cancelLearningStatus'), '');
    cancelLearningDialog?.showModal();
  });

  confirmCancelChapterBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    confirmCancelChapterBtn.disabled = true;
    setStatus(byId('cancelLearningStatus'), '학습 진행 상태를 보존하는 중…');
    try {
      snapshot = await api.cancelChapter(selectedChapterId);
      cancelLearningDialog.close();
      render();
      setStatus(chapterActionStatus, '현재 학습을 취소했습니다. 체크한 내용은 진행 상태로 보존됩니다.');
      showView('chapter');
    } catch (error) {
      setStatus(byId('cancelLearningStatus'), `학습 취소 실패: ${errorMessage(error)}`, true);
    } finally {
      confirmCancelChapterBtn.disabled = false;
    }
  });

  function resetPriorLearningDialog() {
    assessmentPreview = null;
    byId('priorLearningSourceInput').value = '';
    byId('priorAssessmentResultInput').value = '';
    byId('priorImportSummaryInput').value = '';
    byId('priorAssessmentPreview').classList.add('is-hidden');
    ['priorRequestStatus', 'priorPreviewStatus', 'priorApplyStatus'].forEach((id) => setStatus(byId(id), ''));
  }

  priorLearningBtn?.addEventListener('click', () => {
    const chapter = catalogChapter(selectedChapterId);
    resetPriorLearningDialog();
    byId('priorLearningChapterLabel').textContent = pathLabel(chapter, ' > ');
    byId('assessmentAdapterLabel').textContent = `${snapshot.assessmentCapability.activeAdapterId} · API 교체 가능 계약`;
    priorLearningDialog?.showModal();
  });

  byId('preparePriorAssessmentBtn')?.addEventListener('click', async () => {
    const button = byId('preparePriorAssessmentBtn');
    button.disabled = true;
    setStatus(byId('priorRequestStatus'), '판정 프롬프트를 만드는 중…');
    try {
      const result = await api.preparePriorAssessment(selectedChapterId, byId('priorLearningSourceInput').value);
      setStatus(byId('priorRequestStatus'), `${providerLabel(result.provider)}를 열고 판정 요청을 복사했습니다.`);
    } catch (error) {
      setStatus(byId('priorRequestStatus'), errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  function updateImportCounts() {
    const stageInputs = [...document.querySelectorAll('[data-import-kind="stage"]')];
    const objectiveInputs = [...document.querySelectorAll('[data-import-kind="objective"]')];
    if (byId('priorStageCount')) byId('priorStageCount').textContent = `${stageInputs.filter((input) => input.checked).length} / ${stageInputs.length}`;
    if (byId('priorObjectiveCount')) byId('priorObjectiveCount').textContent = `${objectiveInputs.filter((input) => input.checked).length} / ${objectiveInputs.length}`;
    document.querySelectorAll('[data-import-kind]').forEach((input) => {
      input.closest('.check-item')?.classList.toggle('checked', input.checked);
    });
  }

  function renderAssessmentChecklist(containerId, definitions, recommendations, kind) {
    const container = byId(containerId);
    const byRecommendationId = new Map(recommendations.map((recommendation) => [recommendation.id, recommendation]));
    container.replaceChildren();
    definitions.forEach((definition) => {
      const recommendation = byRecommendationId.get(definition.id);
      const label = document.createElement('label');
      label.className = `check-item assessment-item${recommendation.completed ? ' checked recommended' : ''}`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = definition.id;
      input.dataset.importKind = kind;
      input.checked = recommendation.completed;
      const text = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = definition.title || definition.description;
      const evidence = document.createElement('small');
      evidence.className = recommendation.completed ? 'assessment-evidence recommended' : 'assessment-evidence';
      evidence.textContent = `${recommendation.completed ? '추천 완료' : '추가 확인'} · ${recommendation.evidence}`;
      text.append(title, evidence);
      label.append(input, text);
      container.appendChild(label);
    });
  }

  function renderAssessmentPreview() {
    const chapter = catalogChapter(selectedChapterId);
    renderAssessmentChecklist('priorStageChecklist', chapter.stages, assessmentPreview.stageRecommendations, 'stage');
    renderAssessmentChecklist('priorObjectiveChecklist', chapter.objectives, assessmentPreview.objectiveRecommendations, 'objective');
    const weakPoints = assessmentPreview.weakPoints.length ? `\n추가 확인: ${assessmentPreview.weakPoints.join(', ')}` : '';
    byId('priorAssessmentSummary').textContent = `${assessmentPreview.overallSummary || '전체 요약이 제공되지 않았습니다.'}${weakPoints}`;
    byId('priorImportSummaryInput').value = assessmentPreview.overallSummary || '';
    byId('priorAssessmentPreview').classList.remove('is-hidden');
    updateImportCounts();
  }

  byId('previewPriorAssessmentBtn')?.addEventListener('click', async () => {
    const button = byId('previewPriorAssessmentBtn');
    button.disabled = true;
    setStatus(byId('priorPreviewStatus'), '판정 결과를 확인하는 중…');
    try {
      assessmentPreview = await api.previewPriorAssessment(
        selectedChapterId,
        byId('priorLearningSourceInput').value,
        byId('priorAssessmentResultInput').value
      );
      renderAssessmentPreview();
      setStatus(byId('priorPreviewStatus'), '추천 항목과 근거를 확인한 뒤 직접 수정·적용하세요.');
    } catch (error) {
      assessmentPreview = null;
      byId('priorAssessmentPreview').classList.add('is-hidden');
      setStatus(byId('priorPreviewStatus'), errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  byId('priorAssessmentPreview')?.addEventListener('change', (event) => {
    if (event.target.matches('[data-import-kind]')) updateImportCounts();
  });

  byId('applyPriorAssessmentBtn')?.addEventListener('click', async () => {
    if (!assessmentPreview) return;
    const button = byId('applyPriorAssessmentBtn');
    const stageIds = [...document.querySelectorAll('[data-import-kind="stage"]:checked')].map((input) => input.value);
    const objectiveIds = [...document.querySelectorAll('[data-import-kind="objective"]:checked')].map((input) => input.value);
    button.disabled = true;
    setStatus(byId('priorApplyStatus'), '선택한 완료 범위를 저장하는 중…');
    try {
      snapshot = await api.applyPriorAssessment(selectedChapterId, assessmentPreview, {
        stageIds,
        objectiveIds,
        summary: byId('priorImportSummaryInput').value,
      });
      const importedState = chapterState(selectedChapterId);
      priorLearningDialog.close();
      assessmentPreview = null;
      render();
      if (importedState.status === 'Completed') {
        showView('home');
      } else {
        renderSession();
        setStatus(sessionActionStatus, '이전 학습에서 확인한 범위를 적용했습니다. 남은 항목부터 이어가세요.');
        showView('session');
      }
    } catch (error) {
      setStatus(byId('priorApplyStatus'), errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  function resetCurriculumImportDialog() {
    curriculumAssessmentPreview = null;
    curriculumDetailPreviewData = null;
    curriculumDetailChapterIds = [];
    byId('curriculumSourceInput').value = '';
    byId('curriculumAssessmentResultInput').value = '';
    byId('curriculumDetailResultInput').value = '';
    byId('curriculumCoveragePreview').classList.add('is-hidden');
    byId('curriculumDetailStep').classList.add('is-hidden');
    byId('curriculumDetailPreview').classList.add('is-hidden');
    byId('curriculumCoverageList').replaceChildren();
    byId('curriculumDetailList').replaceChildren();
    [
      'curriculumRequestStatus', 'curriculumPreviewStatus', 'curriculumCoverageApplyStatus',
      'curriculumDetailStatus', 'curriculumDetailApplyStatus',
    ].forEach((id) => setStatus(byId(id), ''));
  }

  function openCurriculumImport() {
    resetCurriculumImportDialog();
    curriculumImportDialog?.showModal();
  }

  byId('homeCurriculumImportBtn')?.addEventListener('click', openCurriculumImport);
  byId('curriculumImportBtn')?.addEventListener('click', openCurriculumImport);

  byId('prepareCurriculumAssessmentBtn')?.addEventListener('click', async () => {
    const button = byId('prepareCurriculumAssessmentBtn');
    button.disabled = true;
    setStatus(byId('curriculumRequestStatus'), '40개 챕터 범위 분석 요청을 만드는 중…');
    try {
      const result = await api.prepareCurriculumAssessment(byId('curriculumSourceInput').value);
      setStatus(byId('curriculumRequestStatus'), `${providerLabel(result.provider)}를 열고 전체 분석 요청을 복사했습니다.`);
    } catch (error) {
      setStatus(byId('curriculumRequestStatus'), errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  function selectedCoverageChapterIds() {
    return [...document.querySelectorAll('[data-curriculum-coverage]:checked')].map((input) => input.value);
  }

  function updateCoverageCount() {
    const inputs = [...document.querySelectorAll('[data-curriculum-coverage]')];
    if (byId('curriculumCoverageCount')) {
      byId('curriculumCoverageCount').textContent = `${inputs.filter((input) => input.checked).length} / ${inputs.length} 선택`;
    }
    inputs.forEach((input) => input.closest('.coverage-item')?.classList.toggle('selected', input.checked));
  }

  function renderCurriculumCoveragePreview() {
    const list = byId('curriculumCoverageList');
    list.replaceChildren();
    curriculumAssessmentPreview.chapterAssessments.forEach((assessment) => {
      const chapter = catalogChapter(assessment.chapterId);
      const label = document.createElement('label');
      label.className = `coverage-item level-${assessment.level}${assessment.level !== 'unseen' ? ' selected' : ''}`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = assessment.chapterId;
      input.dataset.curriculumCoverage = 'true';
      input.dataset.detected = assessment.level !== 'unseen' ? 'true' : 'false';
      input.checked = assessment.level !== 'unseen';
      const copy = document.createElement('span');
      copy.className = 'coverage-copy';
      const heading = document.createElement('span');
      heading.className = 'coverage-heading';
      const title = document.createElement('strong');
      title.textContent = pathLabel(chapter, ' > ');
      const level = document.createElement('span');
      level.className = `coverage-level level-${assessment.level}`;
      level.textContent = `${coverageLevelLabel(assessment.level)} · ${Math.round(assessment.confidence * 100)}%`;
      heading.append(title, level);
      const evidence = document.createElement('small');
      evidence.textContent = assessment.evidence;
      copy.append(heading, evidence);
      label.append(input, copy);
      list.appendChild(label);
    });
    byId('curriculumCoverageSummary').textContent = curriculumAssessmentPreview.overallSummary || '전체 요약이 제공되지 않았습니다.';
    byId('curriculumCoveragePreview').classList.remove('is-hidden');
    updateCoverageCount();
  }

  byId('previewCurriculumAssessmentBtn')?.addEventListener('click', async () => {
    const button = byId('previewCurriculumAssessmentBtn');
    button.disabled = true;
    setStatus(byId('curriculumPreviewStatus'), '40개 챕터 결과를 확인하는 중…');
    try {
      curriculumAssessmentPreview = await api.previewCurriculumAssessment(
        byId('curriculumSourceInput').value,
        byId('curriculumAssessmentResultInput').value
      );
      renderCurriculumCoveragePreview();
      setStatus(byId('curriculumPreviewStatus'), '근거와 수준을 확인하고 저장하거나 상세 판정할 챕터를 선택하세요.');
    } catch (error) {
      curriculumAssessmentPreview = null;
      byId('curriculumCoveragePreview').classList.add('is-hidden');
      setStatus(byId('curriculumPreviewStatus'), errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  byId('curriculumCoverageList')?.addEventListener('change', updateCoverageCount);

  byId('selectDetectedCoverageBtn')?.addEventListener('click', () => {
    document.querySelectorAll('[data-curriculum-coverage]').forEach((input) => {
      input.checked = input.dataset.detected === 'true';
    });
    updateCoverageCount();
  });

  byId('saveCurriculumCoverageBtn')?.addEventListener('click', async () => {
    if (!curriculumAssessmentPreview) return;
    const button = byId('saveCurriculumCoverageBtn');
    button.disabled = true;
    setStatus(byId('curriculumCoverageApplyStatus'), '선택한 범위 분석을 저장하는 중…');
    try {
      snapshot = await api.applyCurriculumCoverage(curriculumAssessmentPreview, selectedCoverageChapterIds());
      render();
      setStatus(byId('curriculumCoverageApplyStatus'), '전체 진행도 표시에 범위 분석을 저장했습니다. 완료 상태는 변경하지 않았습니다.');
    } catch (error) {
      setStatus(byId('curriculumCoverageApplyStatus'), errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  byId('prepareCurriculumDetailBtn')?.addEventListener('click', async () => {
    if (!curriculumAssessmentPreview) return;
    const button = byId('prepareCurriculumDetailBtn');
    curriculumDetailChapterIds = selectedCoverageChapterIds();
    button.disabled = true;
    setStatus(byId('curriculumCoverageApplyStatus'), '선택 범위를 저장하고 상세 판정 요청을 만드는 중…');
    try {
      snapshot = await api.applyCurriculumCoverage(curriculumAssessmentPreview, curriculumDetailChapterIds);
      render();
      const result = await api.prepareCurriculumDetailAssessment(
        byId('curriculumSourceInput').value,
        curriculumDetailChapterIds
      );
      byId('curriculumDetailStep').classList.remove('is-hidden');
      byId('curriculumDetailPreview').classList.add('is-hidden');
      byId('curriculumDetailHelp').textContent = `${result.chapterCount}개 챕터의 상세 요청을 복사했습니다. ${providerLabel(result.provider)}의 JSON 결과를 붙여넣으세요.`;
      setStatus(byId('curriculumCoverageApplyStatus'), '범위 분석을 저장하고 상세 판정 요청을 복사했습니다.');
      byId('curriculumDetailStep').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      setStatus(byId('curriculumCoverageApplyStatus'), errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  function renderCurriculumDetailChecklist(container, chapterId, definitions, recommendations, kind) {
    const recommendationById = new Map(recommendations.map((item) => [item.id, item]));
    definitions.forEach((definition) => {
      const recommendation = recommendationById.get(definition.id);
      const label = document.createElement('label');
      label.className = `check-item assessment-item${recommendation.completed ? ' checked recommended' : ''}`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = definition.id;
      input.dataset.curriculumDetailKind = kind;
      input.dataset.chapterId = chapterId;
      input.checked = recommendation.completed;
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = definition.title || definition.description;
      const evidence = document.createElement('small');
      evidence.className = recommendation.completed ? 'assessment-evidence recommended' : 'assessment-evidence';
      evidence.textContent = `${recommendation.completed ? '추천 완료' : '추가 확인'} · ${recommendation.evidence}`;
      copy.append(title, evidence);
      label.append(input, copy);
      container.appendChild(label);
    });
  }

  function renderCurriculumDetailPreview() {
    const list = byId('curriculumDetailList');
    list.replaceChildren();
    curriculumDetailPreviewData.chapterAssessments.forEach((assessment) => {
      const chapter = catalogChapter(assessment.chapterId);
      const recommendedCount = [...assessment.stageRecommendations, ...assessment.objectiveRecommendations]
        .filter((item) => item.completed).length;
      const details = document.createElement('details');
      details.className = 'curriculum-detail-item';
      details.open = true;
      const summary = document.createElement('summary');
      const summaryTitle = document.createElement('strong');
      summaryTitle.textContent = pathLabel(chapter, ' > ');
      const summaryCount = document.createElement('span');
      summaryCount.textContent = `추천 ${recommendedCount} / ${chapter.stages.length + chapter.objectives.length}`;
      summary.append(summaryTitle, summaryCount);
      const body = document.createElement('div');
      body.className = 'curriculum-detail-body';
      const stageColumn = document.createElement('div');
      stageColumn.className = 'curriculum-detail-column';
      const stageTitle = document.createElement('h4');
      stageTitle.textContent = '학습 단계';
      stageColumn.appendChild(stageTitle);
      renderCurriculumDetailChecklist(stageColumn, chapter.id, chapter.stages, assessment.stageRecommendations, 'stage');
      const objectiveColumn = document.createElement('div');
      objectiveColumn.className = 'curriculum-detail-column';
      const objectiveTitle = document.createElement('h4');
      objectiveTitle.textContent = '학습 목표';
      objectiveColumn.appendChild(objectiveTitle);
      renderCurriculumDetailChecklist(objectiveColumn, chapter.id, chapter.objectives, assessment.objectiveRecommendations, 'objective');
      const summaryInput = document.createElement('textarea');
      summaryInput.className = 'curriculum-detail-summary';
      summaryInput.dataset.chapterSummary = chapter.id;
      summaryInput.maxLength = 20000;
      summaryInput.value = assessment.overallSummary || '';
      body.append(stageColumn, objectiveColumn, summaryInput);
      details.append(summary, body);
      list.appendChild(details);
    });
    byId('curriculumDetailPreview').classList.remove('is-hidden');
  }

  byId('previewCurriculumDetailBtn')?.addEventListener('click', async () => {
    const button = byId('previewCurriculumDetailBtn');
    button.disabled = true;
    setStatus(byId('curriculumDetailStatus'), '선택 챕터의 상세 결과를 확인하는 중…');
    try {
      curriculumDetailPreviewData = await api.previewCurriculumDetailAssessment(
        byId('curriculumSourceInput').value,
        curriculumDetailChapterIds,
        byId('curriculumDetailResultInput').value
      );
      renderCurriculumDetailPreview();
      setStatus(byId('curriculumDetailStatus'), '추천 항목과 근거를 챕터별로 확인하고 직접 수정하세요.');
    } catch (error) {
      curriculumDetailPreviewData = null;
      byId('curriculumDetailPreview').classList.add('is-hidden');
      setStatus(byId('curriculumDetailStatus'), errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  byId('curriculumDetailList')?.addEventListener('change', (event) => {
    if (!event.target.matches('[data-curriculum-detail-kind]')) return;
    event.target.closest('.check-item')?.classList.toggle('checked', event.target.checked);
  });

  byId('applyCurriculumDetailBtn')?.addEventListener('click', async () => {
    if (!curriculumDetailPreviewData) return;
    const button = byId('applyCurriculumDetailBtn');
    const inputs = [...document.querySelectorAll('[data-curriculum-detail-kind]')];
    const selections = curriculumDetailPreviewData.chapterAssessments.map((assessment) => ({
      chapterId: assessment.chapterId,
      stageIds: inputs.filter((input) => input.dataset.chapterId === assessment.chapterId && input.dataset.curriculumDetailKind === 'stage' && input.checked).map((input) => input.value),
      objectiveIds: inputs.filter((input) => input.dataset.chapterId === assessment.chapterId && input.dataset.curriculumDetailKind === 'objective' && input.checked).map((input) => input.value),
      summary: document.querySelector(`[data-chapter-summary="${assessment.chapterId}"]`)?.value || '',
    }));
    button.disabled = true;
    setStatus(byId('curriculumDetailApplyStatus'), '여러 챕터의 진행도를 일괄 적용하는 중…');
    try {
      snapshot = await api.applyCurriculumDetailAssessment(curriculumDetailPreviewData, selections);
      curriculumImportDialog.close();
      render();
      showView('curriculum');
    } catch (error) {
      setStatus(byId('curriculumDetailApplyStatus'), errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  reload().catch((error) => {
    setStatus(chapterActionStatus, `학습 데이터를 불러오지 못했습니다: ${errorMessage(error)}`, true);
    if (currentView !== 'home') showView('home');
  });
}
