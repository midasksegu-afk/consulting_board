/**
 * admin.js — 마이더스K 관리자 기능
 * admin.html 전용. index.html에서는 로드하지 않음.
 *
 * 로드 순서: config.js → store.js → admin.js
 */

const Admin = (() => {

  let _unlocked = false;
  let _currentTab = 'tab-program';
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
      switchTab('tab-program');
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
      'tab-program': renderProgramTab,
      'tab-content': renderContentTab,
      'tab-pin':     renderPinTab,
      'tab-log':     renderLogTab,
      'tab-students':renderStudentsTab,
    };
    if (renderMap[tabId]) renderMap[tabId]();
  }


  /* ============================================================
   * 3. 탭1 — 프로그램 관리 (이름 + 단가 통합)
   * ============================================================ */
  let _programPageId = null;

  function renderProgramTab() {
    const el  = document.getElementById('tab-program');
    const cfg = _draft;
    const groups = [
      { key: 'roadmap',    label: '로드맵 컨설팅' },
      { key: 'individual', label: '개별 컨설팅' },
      { key: 'strategy',   label: '대입 전략 컨설팅' },
    ];

    let sideHtml = '';
    groups.forEach(g => {
      const pages = MK_CONFIG.pageOrder.filter(id => {
        const p = cfg.pages[id];
        return p && p.group === g.key && !p.isOverview;
      });
      sideHtml += `<div class="ct-group-label">${g.label}</div>`;
      pages.forEach(id => {
        const p = cfg.pages[id];
        const active = id === _programPageId ? 'ct-side-active' : '';
        sideHtml += `
          <div class="ct-side-item ${active}" onclick="Admin.loadProgramPage('${id}')">
            <i class="ti ${p.sbIcon}" style="font-size:14px;"></i> ${p.sbLabel}
          </div>`;
      });
      sideHtml += `
        <div style="padding:4px 10px 10px;">
          <button class="admin-add-btn" style="margin-top:0;width:100%;justify-content:center;"
            onclick="Admin.addProgram('${g.key}')">
            <i class="ti ti-plus"></i> 새 프로그램
          </button>
        </div>`;
    });

    el.innerHTML = `
      <div style="display:flex;gap:0;min-height:500px;">
        <div class="ct-sidebar">${sideHtml}</div>
        <div class="ct-editor" id="program-editor">
          <div style="color:var(--text-3);font-size:13px;padding:24px;">좌측에서 편집할 프로그램을 선택하세요.</div>
        </div>
      </div>`;

    if (_programPageId) loadProgramPage(_programPageId);
  }

  function loadProgramPage(pageId) {
    _programPageId = pageId;
    const page = _draft.pages[pageId];
    const el   = document.getElementById('program-editor');
    if (!page || !el) return;

    // 사이드 active 갱신
    document.querySelectorAll('#tab-program .ct-side-item').forEach(i => i.classList.remove('ct-side-active'));
    const sel = document.querySelector(`#tab-program .ct-side-item[onclick*="${pageId}"]`);
    if (sel) sel.classList.add('ct-side-active');

    const prices = page.prices || [];
    const priceRows = prices.map((price, idx) => {
      const numOnly = price.amt ? Math.round(price.amt / 10000) : 0;
      return `
        <div class="admin-price-row" id="price-row-${pageId}-${idx}" style="gap:6px;flex-wrap:nowrap;">
          <input class="admin-input" style="flex:1;min-width:80px;max-width:200px;"
            value="${price.label}"
            oninput="Admin.updatePriceField('${pageId}', ${idx}, 'label', this.value)"
            placeholder="항목명">
          <div style="display:flex;align-items:center;gap:4px;flex:0.8;">
            <input class="admin-input" style="width:70px;text-align:right;"
              value="${numOnly}" type="number" min="0"
              oninput="Admin.updatePriceField('${pageId}', ${idx}, 'amt', this.value)"
              placeholder="예:230">
            <span style="font-size:13px;color:var(--text-2);white-space:nowrap;font-weight:600;">만원</span>
          </div>
          <select class="admin-input" style="width:68px;flex-shrink:0;"
            title="이 항목이 표시될 학년 (무관=항상 표시)"
            onchange="Admin.updatePriceField('${pageId}', ${idx}, 'grade', this.value)">
            <option value="" ${!price.grade ? 'selected' : ''}>무관</option>
            <option value="1" ${price.grade == 1 ? 'selected' : ''}>고1</option>
            <option value="2" ${price.grade == 2 ? 'selected' : ''}>고2</option>
            <option value="3" ${price.grade == 3 ? 'selected' : ''}>고3</option>
            <option value="1,2,3" ${price.grade == '1,2,3' ? 'selected' : ''}>전학년</option>
          </select>
          <label style="display:flex;align-items:center;gap:3px;font-size:11px;white-space:nowrap;cursor:pointer;">
            <input type="checkbox" ${price.isDefault ? 'checked' : ''}
              onchange="Admin.updatePriceField('${pageId}', ${idx}, 'isDefault', this.checked)">
            기본
          </label>
          <button class="admin-add-btn" style="margin-top:0;padding:6px 10px;"
            onclick="Admin.saveProgram('${pageId}')" title="저장">
            <i class="ti ti-device-floppy"></i>
          </button>
          <button class="admin-del-btn" onclick="Admin.deletePriceItem('${pageId}', ${idx})" title="삭제">
            <i class="ti ti-trash"></i>
          </button>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="admin-editor-title">
        <i class="ti ${page.sbIcon}"></i> ${page.sbLabel}
      </div>

      <div class="admin-field-group">
        <label class="admin-field-label">사이드바 메뉴명</label>
        <input class="admin-input admin-input-md"
          value="${page.sbLabel || ''}"
          oninput="Admin.updateNameField('${pageId}', 'sbLabel', this.value)">
      </div>
      <div class="admin-field-group">
        <label class="admin-field-label">페이지 제목</label>
        <input class="admin-input admin-input-lg"
          value="${page.title || ''}"
          oninput="Admin.updateNameField('${pageId}', 'title', this.value)">
      </div>
      <div class="admin-field-group">
        <label class="admin-field-label">부제목</label>
        <input class="admin-input admin-input-lg"
          value="${page.subtitle || ''}"
          oninput="Admin.updateNameField('${pageId}', 'subtitle', this.value)">
      </div>

      <div class="admin-section-title" style="margin-top:20px;">가격 항목</div>
      <div style="font-size:11px;color:var(--text-3);margin-bottom:8px;">숫자만 입력 (만원 단위). 예: 230 → 230만원</div>
      <div id="price-list-${pageId}">${priceRows}</div>
      <div style="margin-top:8px;display:flex;gap:8px;">
        <button class="admin-add-btn" style="margin-top:0;" onclick="Admin.addPriceItem('${pageId}')">
          <i class="ti ti-plus"></i> 항목 추가
        </button>
      </div>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);display:flex;gap:8px;">
        <button class="admin-add-btn" style="margin-top:0;" onclick="Admin.saveProgram('${pageId}')">
          <i class="ti ti-device-floppy"></i> 저장
        </button>
        <button class="admin-add-btn" style="margin-top:0;" onclick="Admin.switchTab('tab-content');Admin.loadContentPage('${pageId}')">
          <i class="ti ti-file-text"></i> 콘텐츠 편집으로 이동
        </button>
        <button class="admin-del-btn" style="margin-left:auto;" onclick="Admin.deleteProgram('${pageId}')">
          <i class="ti ti-trash"></i> 프로그램 삭제
        </button>
      </div>`;
  }

  function updatePriceField(pageId, idx, field, value) {
    if (!_draft.pages[pageId].prices) _draft.pages[pageId].prices = [];
    const old = { ..._draft.pages[pageId].prices[idx] };
    if (field === 'amt') {
      const str = String(value).replace(/,/g, '').trim();
      if (str.includes('만')) {
        value = Math.round(parseFloat(str.replace(/만원|만/g, '')) * 10000) || 0;
      } else {
        const num = parseInt(str) || 0;
        value = num > 0 && num < 10000 ? num * 10000 : num;
      }
    }
    _draft.pages[pageId].prices[idx][field] = value;
    Store.addLog('price', `${pageId} > ${old.label || ''} ${field}`, old[field], value);
  }

  function addPriceItem(pageId) {
    if (!_draft.pages[pageId].prices) _draft.pages[pageId].prices = [];
    _draft.pages[pageId].prices.push({ label: '새 항목', amt: 0 });
    loadProgramPage(pageId);
  }

  function deletePriceItem(pageId, idx) {
    if (!confirm('이 가격 항목을 삭제할까요?')) return;
    const removed = _draft.pages[pageId].prices.splice(idx, 1)[0];
    Store.addLog('price', `${pageId} 항목 삭제`, removed.label, '—');
    loadProgramPage(pageId);
  }

  function updateNameField(pageId, field, value) {
    const old = _draft.pages[pageId][field];
    _draft.pages[pageId][field] = value;
    Store.addLog('name', `${pageId} ${field}`, old, value);
  }

  function saveProgram(pageId) {
    Store.saveConfig(_draft);
    showMsg(`✓ "${_draft.pages[pageId]?.sbLabel}" 저장되었습니다.`, true);
  }

  function addProgram(group) {
    const id = 'pg-' + Date.now();
    _draft.pages[id] = {
      group,
      sbIcon:   'ti-circle',
      sbLabel:  '새 프로그램',
      title:    '새 프로그램',
      subtitle: '',
      prices:   [],
    };
    if (!MK_CONFIG.pageOrder.includes(id)) MK_CONFIG.pageOrder.push(id);
    renderProgramTab();
    loadProgramPage(id);
  }

  function deleteProgram(pageId) {
    const label = _draft.pages[pageId]?.sbLabel || pageId;
    if (!confirm(`"${label}"을 삭제하시겠습니까?
이 작업은 되돌릴 수 없습니다.`)) return;
    _confirmWithPin(() => {
      delete _draft.pages[pageId];
      const idx = MK_CONFIG.pageOrder.indexOf(pageId);
      if (idx > -1) MK_CONFIG.pageOrder.splice(idx, 1);
      _programPageId = null;
      Store.saveConfig(_draft);
      showMsg(`✓ "${label}" 삭제되었습니다.`, true);
      renderProgramTab();
    });
  }

  function _confirmWithPin(callback) {
    const existing = document.getElementById('pin-confirm-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'pin-confirm-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,10,30,0.55);backdrop-filter:blur(4px);z-index:2000;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:var(--surface);border-radius:var(--radius-lg);padding:32px 40px;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;align-items:center;gap:14px;min-width:280px;">
        <i class="ti ti-shield-lock" style="font-size:32px;color:var(--accent);"></i>
        <div style="font-size:15px;font-weight:700;color:var(--text-1);">관리자 PIN을 입력하세요</div>
        <input class="admin-input" id="pin-confirm-input" type="password" maxlength="6"
          placeholder="••••" style="text-align:center;font-size:20px;letter-spacing:.3em;width:160px;">
        <div id="pin-confirm-err" style="font-size:12px;color:var(--red-tx);min-height:16px;"></div>
        <div style="display:flex;gap:8px;">
          <button class="admin-add-btn" style="margin-top:0;" onclick="Admin._pinConfirmSubmit()">확인</button>
          <button class="admin-del-btn" onclick="document.getElementById('pin-confirm-modal').remove()">취소</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('pin-confirm-input').focus();
    document.getElementById('pin-confirm-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin._pinConfirmSubmit();
    });
    window._pinConfirmCallback = callback;
  }

  function _pinConfirmSubmit() {
    const val = document.getElementById('pin-confirm-input')?.value;
    if (Store.verifyPin(val)) {
      document.getElementById('pin-confirm-modal')?.remove();
      if (window._pinConfirmCallback) window._pinConfirmCallback();
      window._pinConfirmCallback = null;
    } else {
      const err = document.getElementById('pin-confirm-err');
      if (err) err.textContent = 'PIN이 올바르지 않습니다.';
      document.getElementById('pin-confirm-input').value = '';
      document.getElementById('pin-confirm-input').focus();
    }
  }

  /* ============================================================
   * 5. 탭3 — 콘텐츠 편집 CRUD (3섹션)
   * ============================================================ */
  let _contentPageId = null;

  function renderContentTab() {
    const el = document.getElementById('tab-content');

    // 그룹별 사이드 메뉴 구성
    const groups = [
      { key: 'roadmap',    label: '로드맵 컨설팅' },
      { key: 'individual', label: '개별 컨설팅' },
      { key: 'strategy',   label: '대입 전략 컨설팅' },
    ];

    let sideHtml = '';
    groups.forEach(g => {
      const pages = MK_CONFIG.pageOrder.filter(id => {
        const p = _draft.pages[id];
        return p && p.group === g.key && !p.isOverview;
      });
      if (!pages.length) return;
      sideHtml += `<div class="ct-group-label">${g.label}</div>`;
      pages.forEach(id => {
        const p = _draft.pages[id];
        const active = id === _contentPageId ? 'ct-side-active' : '';
        sideHtml += `
          <div class="ct-side-item ${active}" onclick="Admin.loadContentPage('${id}')">
            <i class="ti ${p.sbIcon}" style="font-size:14px;"></i>
            ${p.sbLabel}
          </div>`;
      });
    });

    el.innerHTML = `
      <div style="display:flex;gap:0;height:100%;min-height:500px;">
        <div class="ct-sidebar">${sideHtml}</div>
        <div class="ct-editor" id="content-editor">
          <div style="color:var(--text-3);font-size:13px;padding:24px;">
            좌측에서 편집할 페이지를 선택하세요.
          </div>
        </div>
      </div>`;

    if (_contentPageId) loadContentPage(_contentPageId);
  }

  function loadContentPage(pageId) {
    _contentPageId = pageId;
    const page = _draft.pages[pageId];
    if (!page) return;
    const el = document.getElementById('content-editor');
    if (!el) return;

    // 사이드 메뉴 active 갱신
    document.querySelectorAll('.ct-side-item').forEach(item => {
      item.classList.remove('ct-side-active');
    });
    const activeItem = document.querySelector(`.ct-side-item[onclick*="${pageId}"]`);
    if (activeItem) activeItem.classList.add('ct-side-active');

    el.innerHTML = `
      ${_renderContentSection(pageId, 'programs',   '프로그램 구성', page.programs   || [])}
      ${_renderContentSection(pageId, 'conditions', '제공 조건',     page.conditions || [])}
      ${_renderNotesSection(pageId,                 '참고 노트',     page.notes      || [])}
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">
        <button class="admin-save-btn" onclick="Admin.saveContentTab()">
          <i class="ti ti-device-floppy"></i> 콘텐츠 저장
        </button>
      </div>`;
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

  function saveContentTab() {
    const page = _draft.pages[_contentPageId];
    const label = page ? page.sbLabel : '콘텐츠';
    if (!confirm(`"${label}" 콘텐츠를 저장하시겠습니까?`)) return;
    Store.saveConfig(_draft);
    showMsg(`✓ "${label}" 콘텐츠가 저장되었습니다.`, true);
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

    // _draft에 직접 저장 후 즉시 persist
    _draft.adminPin = nw;
    if (!_draft.app) _draft.app = {};
    _draft.app.adminPin = nw;
    Store.saveConfig(_draft);
    Store.addLog('pin', '관리자 PIN', '****', '****');

    show('PIN이 변경되었습니다.', true);
    showMsg('✓ PIN이 변경되었습니다.', true);
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
    _confirmWithPin(() => {
      Store.clearLog();
      renderLogTab();
      showMsg('✓ 변경 이력이 삭제되었습니다.', true);
    });
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
    _confirmWithPin(async () => {
      const ok = await Store.deleteStudent(key);
      if (ok) { renderStudentsTab(); showMsg(`✓ ${key} 삭제되었습니다.`, true); }
      else showMsg('삭제 실패 — 네트워크 확인', false);
    });
  }

  function clearAllStudents() {
    alert('개별 삭제를 이용해 주세요.\n(구글 시트에서 직접 행 삭제도 가능합니다)');
  }


  /* ============================================================
   * 8-1. DC 할인율 업데이트
   * ============================================================ */
  function updateDiscountField(group, value) {
    if (!_draft.discount) _draft.discount = {};
    const old = _draft.discount[group];
    _draft.discount[group] = parseInt(value) || 0;
    Store.addLog('price', `DC 할인율 ${group}`, old, value);
  }

  function saveDcDiscount() {
    if (!confirm('DC 할인율을 저장하시겠습니까?')) return;
    Store.saveConfig(_draft);
    showMsg('✓ DC 할인율이 저장되었습니다.', true);
  }

  /* ============================================================
   * 9. 전체 저장
   * ============================================================ */
  function saveAll() {
    if (!confirm('전체 설정을 저장하시겠습니까?')) return;
    Store.saveConfig(_draft);
    showMsg('✓ 전체 설정이 저장되었습니다. 메인 화면을 새로고침하면 반영됩니다.', true);
  }

  function showMsg(text, ok) {
    // 하단 푸터 텍스트
    const el = document.getElementById('admin-save-msg');
    if (el) { el.textContent = text; el.style.color = ok ? 'var(--green-tx)' : 'var(--red-tx)'; }

    // 토스트 팝업
    let toast = document.getElementById('admin-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'admin-toast';
      document.body.appendChild(toast);
    }
    const bg     = ok ? '#1a1d2e' : '#FFD3E1';
    const color  = ok ? '#fff'    : '#8b1c3a';
    const border = ok ? 'transparent' : '#FF8FB1';
    const icon   = ok ? 'ti-circle-check' : 'ti-alert-circle';
    const icolor = ok ? '#B79CFF' : '#8b1c3a';
    toast.style.cssText = `
      position:fixed; bottom:36px; left:50%; transform:translateX(-50%);
      background:${bg}; color:${color};
      padding:12px 28px; border-radius:12px;
      font-size:14px; font-weight:600;
      box-shadow:0 8px 32px rgba(0,0,0,0.15);
      z-index:9999; border:1.5px solid ${border};
      display:flex; align-items:center; gap:10px;
      opacity:1; transition:opacity 0.3s;
      white-space:nowrap;`;
    toast.innerHTML = `<i class="ti ${icon}" style="font-size:18px;color:${icolor};"></i> ${text}`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
  }


  /* ============================================================
   * Public API
   * ============================================================ */
  return {
    checkPin, switchTab,
    // 프로그램 관리 (통합)
    renderProgramTab, loadProgramPage, saveProgram,
    addProgram, deleteProgram,
    _confirmWithPin, _pinConfirmSubmit,
    // 가격 필드
    updatePriceField, addPriceItem, deletePriceItem,
    updateDiscountField, saveDcDiscount,
    // 콘텐츠
    saveContentTab,
    // 프로그램명 필드 (공용)
    updateNameField,
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
