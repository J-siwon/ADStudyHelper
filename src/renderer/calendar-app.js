'use strict';

const key = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthKey = (date) => key(date).slice(0, 7);
const time = (seconds) => `${Math.floor(seconds / 3600)}시간 ${Math.floor(seconds % 3600 / 60)}분 ${seconds % 60}초`;
const byId = (id) => document.getElementById(id);
const messages = {
  google_client_required: '먼저 Google 로그인 설정 파일을 선택해 주세요.',
  invalid_google_client: 'Google Cloud에서 다운로드한 데스크톱 앱용 JSON 파일을 선택해 주세요.',
  google_not_connected: 'Google 계정을 먼저 연결해 주세요.',
  google_already_connected: '다른 계정으로 연결하려면 먼저 연결을 해제해 주세요.',
  disconnect_before_configure: '연결을 해제한 뒤 로그인 설정을 변경해 주세요.',
  google_reconnect_required: 'Google 로그인이 만료되었습니다. 연결을 해제하고 다시 로그인해 주세요.',
  google_login_cancelled: 'Google 로그인을 취소했습니다.',
  google_login_timeout: '로그인 대기 시간이 지났습니다. 다시 연결해 주세요.',
  google_login_failed: 'Google 로그인과 Drive 저장 권한을 확인해 주세요.',
  secure_storage_unavailable: '이 PC에서 로그인 정보를 안전하게 저장할 수 없습니다.',
  google_request_failed: 'Google 요청에 실패했습니다. 인터넷 연결과 Drive API 설정을 확인해 주세요. 로컬 기록은 유지됩니다.',
  backup_conflict: '다른 PC의 백업이 있습니다. 복원하거나 현재 기록으로 백업할지 선택해 주세요.',
  no_backup: '이 계정에 저장된 공부 백업이 없습니다.',
  invalid_backup: '백업 형식이 올바르지 않습니다. 현재 기록은 유지됩니다.',
  restore_preview_expired: '복원 미리보기가 만료되었습니다. 다시 불러와 주세요.',
  backup_busy: 'Google 작업이 진행 중입니다.',
  backup_too_large: '백업 용량이 너무 큽니다. 현재 로컬 기록은 유지됩니다.',
};

function errorMessage(error) {
  const text = String(error?.message || error);
  const code = Object.keys(messages).find((item) => text.includes(item));
  return code ? messages[code] : '기록을 불러오지 못했습니다. 다시 시도해 주세요.';
}

export function initCalendarApp() {
  const api = window.studyAPI;
  const view = document.querySelector('[data-view="calendar"]');
  let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selected = key(); let records = []; let status = {}; let preview = null; let operation = false; let requestId = 0;
  let lastDay = key(); let lastRefresh = 0;
  const notice = (text) => { byId('calendarNotice').textContent = text; };

  function detail() {
    const record = records.find((item) => item.date === selected);
    byId('calendarSelectedDate').textContent = selected;
    byId('calendarWorkTime').textContent = time(record?.workSeconds || 0);
    const summary = record?.summary;
    byId('calendarTier').textContent = summary ? `${summary.tier} · ${summary.rp.toLocaleString('ko-KR')} RP` : '기록 없음';
    byId('calendarProgress').textContent = summary ? `${(summary.progress * 100).toFixed(1)}% (${summary.completedObjectives}/${summary.totalObjectives} 목표)` : '기록 없음';
    const list = byId('calendarEvents'); list.replaceChildren();
    const labels = { complete: '목표 완료', review: '복습', import: '학습 가져오기' };
    const grades = { correct: '정답', partial: '부분 정답', incorrect: '오답' };
    (record?.events || []).forEach((event) => {
      const row = document.createElement('li');
      const at = new Date(event.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      row.textContent = `${at} · ${labels[event.type]}${event.grade ? ` (${grades[event.grade] || event.grade})` : ''} · ${event.chapterTitle} / ${event.title}`;
      list.append(row);
    });
    byId('calendarEventsEmpty').hidden = !!record?.events.length;
  }

  function grid() {
    byId('calendarMonth').textContent = month.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
    const container = byId('calendarGrid'); container.replaceChildren();
    for (let i = 0; i < month.getDay(); i++) {
      const blank = document.createElement('div'); blank.className = 'calendar-blank'; container.append(blank);
    }
    records.forEach((record) => {
      const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'calendar-day'; cell.dataset.date = record.date;
      const intensity = record.workSeconds >= 14400 ? 4 : record.workSeconds >= 7200 ? 3 : record.workSeconds >= 3600 ? 2 : record.workSeconds > 0 ? 1 : 0;
      cell.classList.add(`study-${intensity}`); cell.classList.toggle('selected', record.date === selected); cell.classList.toggle('today', record.date === key());
      cell.setAttribute('aria-pressed', String(record.date === selected));
      cell.setAttribute('aria-label', `${record.date}, 공부 ${time(record.workSeconds)}`);
      const number = document.createElement('strong'); number.textContent = Number(record.date.slice(-2));
      const amount = document.createElement('span'); amount.textContent = record.workSeconds ? `${Math.floor(record.workSeconds / 3600)}h ${Math.floor(record.workSeconds % 3600 / 60)}m` : '—';
      cell.append(number, amount);
      if (record.events.length) { const dot = document.createElement('small'); dot.textContent = `${record.events.length}개 기록`; cell.append(dot); }
      container.append(cell);
    });
    detail();
  }

  function googleStatus() {
    byId('googleAccount').textContent = status.connected ? status.email : 'Google 계정 연결 안 됨';
    byId('googleBackupStatus').textContent = status.lastBackupAt ? `마지막 백업: ${new Date(status.lastBackupAt).toLocaleString('ko-KR')}` : '아직 백업하지 않았습니다.';
    byId('googleRestoreStatus').textContent = status.lastRestoreAt ? `마지막 복원: ${new Date(status.lastRestoreAt).toLocaleString('ko-KR')}` : '';
    byId('googleConfigureBtn').textContent = status.configured ? '로그인 설정 변경' : '로그인 설정 파일 선택';
    const busy = operation || status.busy;
    byId('googleConfigureBtn').disabled = busy || status.connected;
    byId('googleConnectBtn').disabled = busy || status.connected || !status.configured;
    byId('googleDisconnectBtn').disabled = busy || !status.connected;
    byId('googleBackupBtn').disabled = busy || !status.connected;
    byId('googleRestoreBtn').disabled = busy || !status.connected;
    byId('googleConflictActions').hidden = !status.conflict;
    byId('googleOverwriteBtn').disabled = busy;
    byId('googleBackupError').textContent = status.error ? messages[status.error] || '백업 상태를 확인해 주세요.' : '';
  }

  async function refresh() {
    const id = ++requestId;
    try {
      const [nextRecords, nextStatus] = await Promise.all([api.getMonth(monthKey(month)), api.getBackupStatus()]);
      if (id !== requestId) return;
      records = nextRecords; status = nextStatus; grid(); googleStatus(); lastRefresh = Date.now();
    } catch (error) { notice(errorMessage(error)); }
  }

  async function action(work, success = '') {
    if (operation) return;
    operation = true; googleStatus(); notice('처리 중입니다…');
    try { const result = await work(); notice(result?.cancelled ? '설정 파일 선택을 취소했습니다.' : success); } catch (error) { notice(errorMessage(error)); }
    finally { operation = false; await refresh(); }
  }

  byId('calendarGrid').addEventListener('click', (event) => {
    const cell = event.target.closest('[data-date]');
    if (cell) { selected = cell.dataset.date; grid(); }
  });
  const move = (offset) => { month = new Date(month.getFullYear(), month.getMonth() + offset, 1); selected = key(month); void refresh(); };
  byId('calendarPrev').addEventListener('click', () => move(-1));
  byId('calendarNext').addEventListener('click', () => move(1));
  byId('calendarToday').addEventListener('click', () => { month = new Date(new Date().getFullYear(), new Date().getMonth(), 1); selected = key(); void refresh(); });
  document.addEventListener('click', (event) => { if (event.target.closest('[data-view-target="calendar"]')) void refresh(); });
  byId('googleConfigureBtn').addEventListener('click', () => action(() => api.configureGoogle(), '로그인 설정을 확인했습니다. Google 계정을 연결해 주세요.'));
  byId('googleConnectBtn').addEventListener('click', () => action(() => api.connectGoogle(), 'Google 계정을 연결했습니다.'));
  byId('googleDisconnectBtn').addEventListener('click', () => action(() => api.disconnectGoogle(), 'Google 연결을 해제했습니다.'));
  byId('googleBackupBtn').addEventListener('click', () => action(() => api.backup(), '공부 기록을 백업했습니다.'));
  byId('googleOverwriteBtn').addEventListener('click', () => {
    if (window.confirm('현재 PC의 기록을 최신 백업으로 저장할까요? 다른 PC의 최신 기록은 자동으로 합쳐지지 않습니다.'))
      void action(() => api.backup(status.conflict.token), '현재 PC의 기록을 백업했습니다.');
  });
  byId('googleRestoreBtn').addEventListener('click', () => action(async () => {
    preview = await api.previewRestore();
    byId('restorePreviewText').textContent = `${preview.from || '기록 없음'} ~ ${preview.to || '기록 없음'} · ${preview.days}일 · ${time(preview.workSeconds)}\n완료 목표 ${preview.completedObjectives}/${preview.totalObjectives} · 현재 기준 ${preview.tier} · ${preview.rp} RP\n백업 시각: ${new Date(preview.createdAt).toLocaleString('ko-KR')}\n현재 기록을 이 백업으로 교체합니다. 교체 전 로컬 기록의 사본을 보관합니다.`;
    byId('studyRestoreDialog').showModal();
  }, '복원할 내용을 확인해 주세요.'));
  byId('studyRestoreConfirm').addEventListener('click', () => {
    if (!preview || operation) return;
    byId('studyRestoreConfirm').disabled = true;
    byId('studyRestoreCancel').disabled = true;
    void action(async () => {
      await api.confirmRestore(preview.token); preview = null; byId('studyRestoreDialog').close();
      window.location.reload();
    }, '공부 기록을 복원했습니다.').finally(() => { byId('studyRestoreConfirm').disabled = false; byId('studyRestoreCancel').disabled = false; });
  });
  const cancelRestore = () => { if (operation) return; preview = null; byId('studyRestoreDialog').close(); void api.cancelRestore(); };
  byId('studyRestoreCancel').addEventListener('click', cancelRestore);
  byId('studyRestoreDialog').addEventListener('cancel', (event) => { event.preventDefault(); if (!operation) cancelRestore(); });
  window.focusAPI.onTick(({ workSeconds }) => {
    if (!view.classList.contains('active')) return;
    if (lastDay !== key()) { lastDay = key(); void refresh(); return; }
    const today = records.find((record) => record.date === key());
    if (today) { today.workSeconds = workSeconds; grid(); }
    if (Date.now() - lastRefresh > 60000) { lastRefresh = Date.now(); void refresh(); }
  });
  void refresh();
}
