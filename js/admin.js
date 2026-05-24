/**
 * admin.js — 마이더스K 관리자 기능
 * admin.html 전용. index.html에서는 로드하지 않음.
 *
 * 로드 순서: config.js → store.js → admin.js
 */

const Admin = (() => {

  let _unlocked = false;
  let _currentTab = 'tab-price';
  // 관리자가 편집 중인 config 임시 복사본
  let _draft = null;

  function fmt(n) { return n.toLocaleString('ko-KR'); }


  /* ============================================================
   * 1. PIN 인증
   * ============================================================ */
  function checkPin() {
    const input = document.getElementById('pin-input')?.value;
    if (Store.verifyPin(input)) {
      _unlocked = true;
      _draft    = JSON.parse(JSON.stringify(MK_CONFIG.resolve())); // 깊은 복사
      document.getElementById('pin-screen').style.display = 'none';
      document.getElementById('admin-body').style.display = 'flex';
      switchTab('tab-price');
    } else {
      const err = document.getElementById('pin-err');
      if (err) { err.style.display = 'block'; }
      document.getElementById('pin-input').value = '';
      document.getElementById('pin-input').focus();
    }
  }


  /* ============================================================
   * 2. 탭 전환
   * ============================================================ */
  function switchTab(tabId) {
    _currentTab = tabId;
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');

    const btn = document.querySelector(`.admin-tab[data-tab="${tabId}"]`);
    const pane = document.getElementById(tabId);
    if (btn)  btn.classList.add('active');
    if (pane) pane.style.display = 'block';

    // 탭별 렌더
    const renderMap = {
      'tab-price':   renderPriceTab,
      'tab-name':    renderNameTab,
      'tab-content': renderContentTab,
      'tab-pin':     renderPinTab,
      'tab-log':     renderLogTab,
      'tab-students':renderStudentsTab,
    };
    if (renderMap[tabId]) renderMap[tabId]();
  }


  /* ============================================================
   * 3. 탭1 — 금액 단가 CRUD
   * ============================================================ */
  function renderPriceTab() {
    const el   = document.getElementById('tab-price');
    const cfg  = _draft;
    let html   = '';

    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = cfg.pages[pageId];
      if (!page || page.isOverview) return;

      html += `
        <div class="admin-section">
          <div class="admin-section-title">${page.sbLabel}</div>
          <div id="price-list-${pageId}">
            ${_renderPriceList(pageId, page.prices || [])}
          </div>
          <button class="admin-add-btn" onclick="Admin.addPriceItem('${pageId}')">
            <i class="ti ti-plus"></i> 가격 항목 추가
          </button>
        </div>`;
    });

    el.innerHTML = html;
  }

  function _renderPriceList(pageId, prices) {
    if (!prices.length) return '<div style="font-size:13px;color:var(--text-3);padding:8px 0;">항목 없음</div>';
    return prices.map((price, idx) => `
      <div class="admin-price-row" id="price-row-${pageId}-${idx}">
        <input class="admin-input" style="flex:2;"
          value="${price.label}"
          onchange="Admin.updatePriceField('${pageId}', ${idx}, 'label', this.value)"
          placeholder="항목명">
        <input class="admin-input" style="flex:1;text-align:right;"
          value="${fmt(price.amt)}"
          onchange="Admin.updatePriceField('${pageId}', ${idx}, 'amt', this.value)"
          placeholder="금액">
        <select class="admin-input" style="flex:1;"
          onchange="Admin.updatePriceField('${pageId}', ${idx}, 'grade', this.value)">
          <option value="" ${!price.grade ? 'selected' : ''}>학년 무관</option>
          <option value="1" ${price.grade == 1 ? 'selected' : ''}>고1</option>
          <option value="2" ${price.grade == 2 ? 'selected' : ''}>고2</option>
          <option value="3" ${price.grade == 3 ? 'selected' : ''}>고3</option>
          <option value="1,2,3" ${price.grade == '1,2,3' ? 'selected' : ''}>전학년</option>
        </select>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;">
          <input type="checkbox" ${price.isDefault ? 'checked' : ''}
            onchange="Admin.updatePriceField('${pageId}', ${idx}, 'isDefault', this.checked)">
          기본체크
        </label>
        <button class="admin-del-btn" onclick="Admin.deletePriceItem('${pageId}', ${idx})" title="삭제">
          <i class="ti ti-trash"></i>
        </button>
      </div>`).join('');
  }

  function updatePriceField(pageId, idx, field, value) {
    if (!_draft.pages[pageId].prices) _draft.pages[pageId].prices = [];
    const old = { ..._draft.pages[pageId].prices[idx] };
    if (field === 'amt') {
      value = parseInt(value.replace(/,/g,'')) || 0;
    }
    _draft.pages[pageId].prices[idx][field] = value;
    Store.addLog('price', `${pageId} > ${old.label} ${field}`, old[field], value);
  }

  function addPriceItem(pageId) {
    if (!_draft.pages[pageId].prices) _draft.pages[pageId].prices = [];
    _draft.pages[pageId].prices.push({ label: '새 항목', amt: 0 });
    document.getElementById(`price-list-${pageId}`).innerHTML =
      _renderPriceList(pageId, _draft.pages[pageId].prices);
  }

  function deletePriceItem(pageId, idx) {
    if (!confirm('이 가격 항목을 삭제할까요?')) return;
    const removed = _draft.pages[pageId].prices.splice(idx, 1)[0];
    Store.addLog('price', `${pageId} 항목 삭제`, removed.label, '—');
    document.getElementById(`price-list-${pageId}`).innerHTML =
      _renderPriceList(pageId, _draft.pages[pageId].prices);
  }


  /* ============================================================
   * 4. 탭2 — 프로그램명 CRUD
   * ============================================================ */
  function renderNameTab() {
    const el  = document.getElementById('tab-name');
    const cfg = _draft;
    let html  = '';

    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = cfg.pages[pageId];
      if (!page || page.isOverview) return;

      html += `
        <div class="admin-name-row">
          <div class="admin-name-id">${pageId}</div>
          <input class="admin-input" style="flex:1.2;"
            value="${page.sbLabel}"
            onchange="Admin.updateNameField('${pageId}', 'sbLabel', this.value)"
            placeholder="사이드바 메뉴명">
          <input class="admin-input" style="flex:2;"
            value="${page.title}"
            onchange="Admin.updateNameField('${pageId}', 'title', this.value)"
            placeholder="페이지 제목">
          <input class="admin-input" style="flex:2;"
            value="${page.subtitle || ''}"
            onchange="Admin.updateNameField('${pageId}', 'subtitle', this.value)"
            placeholder="부제목">
        </div>`;
    });

    el.innerHTML = html || '<div style="color:var(--text-3);font-size:13px;">페이지가 없습니다.</div>';
  }

  function updateNameField(pageId, field, value) {
    const old = _draft.pages[pageId][field];
    _draft.pages[pageId][field] = value;
    Store.addLog('name', `${pageId} ${field}`, old, value);
  }


  /* ============================================================
   * 5. 탭3 — 콘텐츠 편집 CRUD (3섹션)
   * ============================================================ */
  let _contentPageId = null;

  function renderContentTab() {
    const el = document.getElementById('tab-content');
    // 페이지 선택 드롭다운 + 편집 영역
    el.innerHTML = `
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px;">
        <label style="font-size:13px;font-weight:600;color:var(--text-2);">페이지 선택</label>
        <select class="admin-input" style="width:260px;" id="content-page-sel"
          onchange="Admin.loadContentPage(this.value)">
          <option value="">— 선택 —</option>
          ${MK_CONFIG.pageOrder
            .filter(id => !_draft.pages[id]?.isOverview)
            .map(id => `<option value="${id}" ${id === _contentPageId ? 'selected':''}>
              ${_draft.pages[id]?.sbLabel || id}
            </option>`).join('')}
        </select>
      </div>
      <div id="content-editor"></div>`;

    if (_contentPageId) loadContentPage(_contentPageId);
  }

  function loadContentPage(pageId) {
    _contentPageId = pageId;
    const page = _draft.pages[pageId];
    if (!page) return;
    const el = document.getElementById('content-editor');
    if (!el) return;

    el.innerHTML = `
      ${_renderContentSection(pageId, 'programs',   '프로그램 구성', page.programs   || [])}
      ${_renderContentSection(pageId, 'conditions', '제공 조건',     page.conditions || [])}
      ${_renderNotesSection(pageId,                 '참고 노트',     page.notes      || [])}`;
  }

  function _renderContentSection(pageId, section, label, items) {
    const rows = items.map((item, idx) => `
      <div class="content-item" id="ci-${section}-${idx}">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
          <input class="admin-input" style="flex:0.3;" value="${item.num || ''}"
            onchange="Admin.updateContentField('${pageId}','${section}',${idx},'num',this.value)"
            placeholder="번호">
          <input class="admin-input" style="flex:1;" value="${item.title || ''}"
            onchange="Admin.updateContentField('${pageId}','${section}',${idx},'title',this.value)"
            placeholder="제목">
          <button class="admin-del-btn" onclick="Admin.deleteContentItem('${pageId}','${section}',${idx})">
            <i class="ti ti-trash"></i>
          </button>
        </div>
        <textarea class="admin-input" rows="3" style="resize:vertical;"
          onchange="Admin.updateContentField('${pageId}','${section}',${idx},'items',this.value)"
          placeholder="내용 (줄바꿈으로 항목 구분)">${(item.items || []).join('\n')}</textarea>
        <input class="admin-input" style="margin-top:6px;" value="${item.text || ''}"
          onchange="Admin.updateContentField('${pageId}','${section}',${idx},'text',this.value)"
          placeholder="요약 텍스트 (조건 섹션)">
      </div>`).join('<hr style="border:none;border-top:1px dashed var(--border);margin:10px 0;">');

    return `
      <div class="content-section" style="margin-bottom:20px;">
        <div class="admin-section-title">${label}</div>
        <div id="ci-list-${section}">${rows || '<div style="color:var(--text-3);font-size:13px;">항목 없음</div>'}</div>
        <button class="admin-add-btn" onclick="Admin.addContentItem('${pageId}','${section}')">
          <i class="ti ti-plus"></i> 항목 추가
        </button>
      </div>`;
  }

  function _renderNotesSection(pageId, label, notes) {
    const colorOpts = ['blue','amber','red','green'].map(c =>
      `<option value="${c}">${c}</option>`).join('');

    const rows = notes.map((note, idx) => `
      <div class="content-item" style="display:flex;gap:8px;align-items:flex-start;">
        <select class="admin-input" style="flex:0.5;"
          onchange="Admin.updateNoteField('${pageId}',${idx},'color',this.value)">
          ${['blue','amber','red','green'].map(c =>
            `<option value="${c}" ${note.color===c?'selected':''}>${c}</option>`).join('')}
        </select>
        <textarea class="admin-input" rows="2" style="flex:3;resize:vertical;"
          onchange="Admin.updateNoteField('${pageId}',${idx},'text',this.value)"
          placeholder="노트 내용">${note.text || ''}</textarea>
        <button class="admin-del-btn" onclick="Admin.deleteNote('${pageId}',${idx})">
          <i class="ti ti-trash"></i>
        </button>
      </div>`).join('<hr style="border:none;border-top:1px dashed var(--border);margin:8px 0;">');

    return `
      <div class="content-section" style="margin-bottom:20px;">
        <div class="admin-section-title">${label} (색깔 박스)</div>
        <div id="ci-list-notes">${rows || '<div style="color:var(--text-3);font-size:13px;">항목 없음</div>'}</div>
        <button class="admin-add-btn" onclick="Admin.addNote('${pageId}')">
          <i class="ti ti-plus"></i> 노트 추가
        </button>
      </div>`;
  }

  function updateContentField(pageId, section, idx, field, value) {
    const item = _draft.pages[pageId][section][idx];
    if (!item) return;
    if (field === 'items') {
      item.items = value.split('\n').map(s => s.trim()).filter(Boolean);
    } else {
      item[field] = value;
    }
    Store.addLog('content', `${pageId} ${section}[${idx}] ${field}`, '—', value.substring(0,30));
  }

  function addContentItem(pageId, section) {
    if (!_draft.pages[pageId][section]) _draft.pages[pageId][section] = [];
    _draft.pages[pageId][section].push({ num:'', title:'새 항목', items:[], text:'' });
    loadContentPage(pageId);
  }

  function deleteContentItem(pageId, section, idx) {
    if (!confirm('이 항목을 삭제할까요?')) return;
    _draft.pages[pageId][section].splice(idx, 1);
    Store.addLog('content', `${pageId} ${section}[${idx}] 삭제`, '—', '—');
    loadContentPage(pageId);
  }

  function updateNoteField(pageId, idx, field, value) {
    _draft.pages[pageId].notes[idx][field] = value;
  }
  function addNote(pageId) {
    if (!_draft.pages[pageId].notes) _draft.pages[pageId].notes = [];
    _draft.pages[pageId].notes.push({ color:'blue', icon:'ti-info-circle', text:'' });
    loadContentPage(pageId);
  }
  function deleteNote(pageId, idx) {
    if (!confirm('이 노트를 삭제할까요?')) return;
    _draft.pages[pageId].notes.splice(idx, 1);
    loadContentPage(pageId);
  }


  /* ============================================================
   * 6. 탭4 — PIN 변경
   * ============================================================ */
  function renderPinTab() {
    document.getElementById('tab-pin').innerHTML = `
      <div style="max-width:300px;display:flex;flex-direction:column;gap:14px;padding-top:8px;">
        <div>
          <label class="admin-label">현재 PIN</label>
          <input class="admin-input" type="password" id="pin-cur" maxlength="6" placeholder="현재 PIN">
        </div>
        <div>
          <label class="admin-label">새 PIN</label>
          <input class="admin-input" type="password" id="pin-new" maxlength="6" placeholder="새 PIN (4~6자리)">
        </div>
        <div>
          <label class="admin-label">새 PIN 확인</label>
          <input class="admin-input" type="password" id="pin-con" maxlength="6" placeholder="새 PIN 재입력">
        </div>
        <div id="pin-change-msg" style="font-size:13px;min-height:18px;"></div>
        <button class="admin-add-btn" onclick="Admin.changePin()">PIN 변경</button>
      </div>`;
  }

  function changePin() {
    const cur = document.getElementById('pin-cur')?.value;
    const nw  = document.getElementById('pin-new')?.value;
    const con = document.getElementById('pin-con')?.value;
    const msg = document.getElementById('pin-change-msg');
    const show = (text, ok) => {
      if (msg) { msg.textContent = text; msg.style.color = ok ? 'var(--green-tx)' : 'var(--red-tx)'; }
    };
    if (!Store.verifyPin(cur)) return show('현재 PIN이 틀립니다.', false);
    if (nw.length < 4)        return show('PIN은 4자리 이상이어야 합니다.', false);
    if (nw !== con)           return show('새 PIN이 일치하지 않습니다.', false);
    Store.savePin(nw);
    show('PIN이 변경되었습니다.', true);
    ['pin-cur','pin-new','pin-con'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  }


  /* ============================================================
   * 7. 탭5 — 변경 이력 로그
   * ============================================================ */
  function renderLogTab() {
    const log = Store.getLog();
    const el  = document.getElementById('tab-log');

    if (!log.length) {
      el.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:16px 0;">변경 이력이 없습니다.</div>';
      return;
    }

    const categoryLabel = { price:'금액', name:'프로그램명', content:'콘텐츠', pin:'PIN' };
    const rows = log.map(entry => `
      <tr>
        <td>${Store.formatDate(entry.at)}</td>
        <td><span class="log-badge log-${entry.category}">${categoryLabel[entry.category]||entry.category}</span></td>
        <td>${entry.label}</td>
        <td style="color:var(--red-tx);">${String(entry.before).substring(0,20)}</td>
        <td style="color:var(--green-tx);">${String(entry.after).substring(0,20)}</td>
      </tr>`).join('');

    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
        <button class="admin-del-btn" onclick="Admin.clearLog()" style="padding:6px 14px;">
          <i class="ti ti-trash"></i> 이력 전체 삭제
        </button>
      </div>
      <div style="overflow-x:auto;">
        <table class="admin-log-table">
          <thead><tr><th>일시</th><th>분류</th><th>항목</th><th>변경 전</th><th>변경 후</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function clearLog() {
    if (!confirm('변경 이력을 전체 삭제할까요?')) return;
    Store.clearLog();
    renderLogTab();
  }


  /* ============================================================
   * 8. 탭6 — 학생 데이터 관리
   * ============================================================ */
  async function renderStudentsTab() {
    const el = document.getElementById('tab-students');
    el.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:16px 0;">불러오는 중...</div>';

    const list = await Store.listStudents();

    if (!list.length) {
      el.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:16px 0;">저장된 학생이 없습니다.</div>';
      return;
    }

    const rows = list.map(s => `
      <tr>
        <td><strong>${s.key}</strong></td>
        <td>${s.meta?.school || '—'}</td>
        <td>${s.meta?.goal   || '—'}</td>
        <td>${Store.formatDate(s.savedAt)}</td>
        <td>
          <button class="admin-del-btn" onclick="Admin.deleteStudent('${s.key}')">
            <i class="ti ti-trash"></i> 삭제
          </button>
        </td>
      </tr>`).join('');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:13px;color:var(--text-3);">총 ${list.length}명</span>
        <button class="admin-add-btn" onclick="Admin.renderStudentsTab()" style="margin-top:0;">
          <i class="ti ti-refresh"></i> 새로고침
        </button>
      </div>
      <div style="overflow-x:auto;">
        <table class="admin-log-table">
          <thead><tr><th>학생 키</th><th>학교/학년</th><th>진로목표</th><th>저장일시</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function deleteStudent(key) {
    if (!confirm(`${key} 데이터를 삭제할까요?`)) return;
    const ok = await Store.deleteStudent(key);
    if (ok) renderStudentsTab();
    else showMsg('삭제 실패 — 네트워크 확인', false);
  }

  function clearAllStudents() {
    alert('개별 삭제를 이용해 주세요.\n(구글 시트에서 직접 행 삭제도 가능합니다)');
  }


  /* ============================================================
   * 9. 전체 저장
   * ============================================================ */
  function saveAll() {
    Store.saveConfig(_draft);
    showMsg('✓ 저장되었습니다. index.html을 새로고침하면 반영됩니다.', true);
  }

  function showMsg(text, ok) {
    const el = document.getElementById('admin-save-msg');
    if (el) { el.textContent = text; el.style.color = ok ? 'var(--green-tx)' : 'var(--red-tx)'; }
  }


  /* ============================================================
   * Public API
   * ============================================================ */
  return {
    checkPin, switchTab,
    // 금액
    renderPriceTab, updatePriceField, addPriceItem, deletePriceItem,
    // 프로그램명
    renderNameTab, updateNameField,
    // 콘텐츠
    renderContentTab, loadContentPage,
    updateContentField, addContentItem, deleteContentItem,
    updateNoteField, addNote, deleteNote,
    // PIN
    renderPinTab, changePin,
    // 로그
    renderLogTab, clearLog,
    // 학생
    renderStudentsTab, deleteStudent, clearAllStudents,
    // 저장
    saveAll,
  };

})();

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pin-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') Admin.checkPin();
  });
  document.getElementById('pin-input')?.focus();
});
