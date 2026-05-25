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
      'tab-program':  renderProgramTab,
      'tab-content':  renderContentTab,
      'tab-discount': renderDiscountTab,
      'tab-students': renderStudentsTab,
      'tab-log':      renderLogTab,
      'tab-pin':      renderPinTab,
    };
    if (renderMap[tabId]) renderMap[tabId]();
  }


  /* ============================================================
   * 3. 탭1 — 프로그램 관리 (이름 + 단가 통합)
   * ============================================================ */
  let _programPageId = null;
  const _groupOpen = { roadmap: true, individual: false, strategy: false };

  function _toggleGroup(key, tabPrefix) {
    _groupOpen[key] = !_groupOpen[key];
    // 해당 그룹 아이템 토글
    const items = document.querySelectorAll(`#tab-${tabPrefix} .ct-group-items-${key}`);
    items.forEach(el => { el.style.display = _groupOpen[key] ? 'block' : 'none'; });
    // 화살표 회전
    const arrow = document.querySelector(`#tab-${tabPrefix} .ct-group-arrow-${key}`);
    if (arrow) arrow.style.transform = _groupOpen[key] ? 'rotate(90deg)' : 'rotate(0deg)';
  }

  function _buildSideMenu(cfg, tabPrefix, includeOverview) {
    const groups = [
      { key: 'roadmap',    label: (cfg.groups?.roadmap?.label    || '학년 관리 로드맵') },
      { key: 'individual', label: (cfg.groups?.individual?.label || '개별 컨설팅') },
      { key: 'strategy',   label: (cfg.groups?.strategy?.label  || '대입 전략 컨설팅') },
    ];
    let html = '';
    groups.forEach(g => {
      const pages = MK_CONFIG.pageOrder.filter(id => {
        const p = cfg.pages[id];
        return p && p.group === g.key && !p.isOverview;
      });
      if (!pages.length && !includeOverview) return;
      const isOpen = _groupOpen[g.key];
      const arrow  = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';

      html += `
        <div class="ct-group-label" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;"
          onclick="Admin._toggleGroup('${g.key}','${tabPrefix}')">
          ${g.label}
          <i class="ti ti-chevron-right ct-group-arrow-${g.key}" style="font-size:13px;transition:transform 0.2s;transform:${arrow};"></i>
        </div>
        <div class="ct-group-items-${g.key}" style="display:${isOpen ? 'block' : 'none'};">`;

      // 전체 개요 항목 (로드맵 + 프로그램 탭만)
      if (g.key === 'roadmap' && includeOverview) {
        const active = _programPageId === '__overview__' ? 'ct-side-active' : '';
        html += `
          <div class="ct-side-item ${active}" onclick="Admin.loadProgramPage('__overview__')">
            <i class="ti ti-layout-grid" style="font-size:14px;"></i> 전체 개요 카드
          </div>`;
      }

      pages.forEach(id => {
        const p = cfg.pages[id];
        const fn = tabPrefix === 'program' ? 'loadProgramPage' : 'loadContentPage';
        const currentId = tabPrefix === 'program' ? _programPageId : _contentPageId;
        const active = id === currentId ? 'ct-side-active' : '';
        html += `
          <div class="ct-side-item ${active}" onclick="Admin.${fn}('${id}')">
            <i class="ti ${p.sbIcon}" style="font-size:14px;"></i> ${p.sbLabel}
          </div>`;
      });

      if (tabPrefix === 'program') {
        html += `
          <div style="padding:4px 10px 10px;">
            <button class="admin-add-btn" style="margin-top:0;width:100%;justify-content:center;"
              onclick="Admin.addProgram('${g.key}')">
              <i class="ti ti-plus"></i> 새 프로그램
            </button>
          </div>`;
      }
      html += `</div>`;
    });
    return html;
  }

  function renderProgramTab() {
    const el  = document.getElementById('tab-program');
    const cfg = _draft;
    const sideHtml = _buildSideMenu(cfg, 'program', true);

    el.innerHTML = `
      <div style="display:flex;gap:0;min-height:500px;">
        <div class="ct-sidebar">
          <div style="padding:8px 10px 6px;border-bottom:1px solid rgba(0,0,0,0.07);">
            <button class="admin-add-btn" style="margin:0;width:100%;justify-content:center;font-size:12px;padding:6px 10px;"
              onclick="Admin.loadGroupLabelEditor()">
              <i class="ti ti-edit"></i> 그룹명 수정
            </button>
          </div>
          ${sideHtml}
        </div>
        <div class="ct-editor" id="program-editor">
          <div style="color:var(--text-3);font-size:13px;padding:24px;">좌측에서 편집할 프로그램을 선택하세요.</div>
        </div>
      </div>`;

    if (_programPageId) loadProgramPage(_programPageId);
  }

  function loadGroupLabelEditor() {
    _programPageId = null;
    document.querySelectorAll('#tab-program .ct-side-item').forEach(i => i.classList.remove('ct-side-active'));
    const el = document.getElementById('program-editor');
    if (!el) return;
    const cfg = _draft;
    const gKeys = [
      { key:'roadmap',    name:'로드맵' },
      { key:'individual', name:'개별' },
      { key:'strategy',   name:'대입전략' },
    ];
    const rows = gKeys.map(g => {
      const val = cfg.groups?.[g.key]?.label || '';
      return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <span style="font-size:12px;color:var(--text-3);min-width:60px;">${g.name}</span>
        <input class="admin-input" style="flex:1;" value="${val}"
          oninput="Admin.updateGroupLabel('${g.key}', this.value)"
          placeholder="그룹 헤더명">
      </div>`;
    }).join('');
    el.innerHTML = `
      <div style="padding:24px;">
        <div class="admin-section-title" style="margin-bottom:16px;">그룹 헤더명 수정</div>
        ${rows}
        <button class="admin-add-btn" style="margin-top:8px;" onclick="Admin.saveGroupLabels()">
          <i class="ti ti-device-floppy"></i> 저장
        </button>
      </div>`;
  }

  function loadProgramPage(pageId) {
    _programPageId = pageId;
    const el = document.getElementById('program-editor');
    if (!el) return;

    // 사이드 active 갱신
    document.querySelectorAll('#tab-program .ct-side-item').forEach(i => i.classList.remove('ct-side-active'));
    const sel = document.querySelector(`#tab-program .ct-side-item[onclick*="${pageId}"]`);
    if (sel) sel.classList.add('ct-side-active');

    // 전체 개요 편집
    if (pageId === '__overview__') {
      _renderOverviewEditor(el);
      return;
    }

    const page = _draft.pages[pageId];
    if (!page) return;

    const prices = page.prices || [];
    const priceRows = prices.map((price, idx) => {
      const numOnly = price.amt ? Math.round(price.amt / 10000) : 0;
      return `
        <div class="admin-price-row" id="price-row-${pageId}-${idx}" style="gap:6px;flex-wrap:nowrap;">
          <input class="admin-input" style="flex:1;min-width:80px;max-width:200px;"
            value="${price.label}"
            oninput="Admin.updatePriceField('${pageId}', ${idx}, 'label', this.value)"
            placeholder="항목명">
          <input class="admin-input" style="flex:1;min-width:60px;max-width:140px;"
            value="${price.note || ''}"
            oninput="Admin.updatePriceField('${pageId}', ${idx}, 'note', this.value)"
            placeholder="비고 (예: 1회/고3)">
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

  function _renderOverviewEditor(el) {
    const ovPage = Object.values(_draft.pages).find(p => p.isOverview);
    const ovKey  = Object.keys(_draft.pages).find(k => _draft.pages[k].isOverview);
    if (!ovPage || !ovKey) return;

    // 트리 항목들 (rm-a/b/c만 해당)
    const treePages = MK_CONFIG.pageOrder.filter(id => {
      const p = _draft.pages[id];
      return p && p.group === 'roadmap' && !p.isOverview && p.ovCard;
    });

    const treeSections = treePages.map(id => {
      const p = _draft.pages[id];
      const tree = (p.ovCard && p.ovCard.tree) || [];
      const treeRows = tree.map((t, idx) => `
        <div class="admin-price-row" style="gap:8px;align-items:flex-start;flex-direction:column;">
          <div style="display:flex;gap:8px;width:100%;align-items:center;">
            <input class="admin-input" style="flex:1;" value="${t.label || ''}"
              oninput="Admin.updateTreeField('${id}',${idx},'label',this.value)"
              placeholder="트리 제목">
            <button class="admin-del-btn" onclick="Admin.deleteTreeItem('${id}',${idx})">
              <i class="ti ti-trash"></i>
            </button>
          </div>
          <input class="admin-input" style="width:100%;" value="${t.sub || ''}"
            oninput="Admin.updateTreeField('${id}',${idx},'sub',this.value)"
            placeholder="트리 설명">
        </div>`).join('');

      return `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:8px;">
            <i class="ti ${p.sbIcon}"></i> ${p.sbLabel} 트리
            <span style="font-size:11px;color:var(--text-3);font-weight:400;margin-left:8px;">
              (프로그램명은 프로그램 관리에서 수정 시 자동 반영됩니다)
            </span>
          </div>
          <div>${treeRows}</div>
          <button class="admin-add-btn" style="margin-top:6px;" onclick="Admin.addTreeItem('${id}')">
            <i class="ti ti-plus"></i> 트리 항목 추가
          </button>
        </div>`;
    }).join('<hr style="border:none;border-top:1px dashed var(--border);margin:12px 0;">');

    el.innerHTML = `
      <div class="admin-editor-title">
        <i class="ti ti-layout-grid"></i> 전체 개요 카드 편집
      </div>
      <div class="notice n-blue" style="margin-bottom:16px;">
        <i class="ti ti-info-circle"></i>
        <span>카드 이름·금액은 프로그램 관리에서 수정하면 자동 반영됩니다.</span>
      </div>
      <div class="admin-field-group">
        <label class="admin-field-label">하단 공지 텍스트</label>
        <textarea class="admin-input" rows="2" style="resize:vertical;"
          oninput="Admin.updateOverviewNotice(this.value)">${_draft.overviewNotice || ''}</textarea>
      </div>
      <div class="admin-section-title" style="margin-top:20px;">카드 트리 항목 편집</div>
      ${treeSections}
      <div style="margin-top:20px;">
        <button class="admin-add-btn" style="margin-top:0;" onclick="Admin.saveOverview()">
          <i class="ti ti-device-floppy"></i> 저장
        </button>
      </div>`;
  }

  function updateTreeField(pageId, idx, field, value) {
    if (!_draft.pages[pageId].ovCard) return;
    if (!_draft.pages[pageId].ovCard.tree) _draft.pages[pageId].ovCard.tree = [];
    _draft.pages[pageId].ovCard.tree[idx][field] = value;
  }

  function addTreeItem(pageId) {
    if (!_draft.pages[pageId].ovCard) return;
    if (!_draft.pages[pageId].ovCard.tree) _draft.pages[pageId].ovCard.tree = [];
    _draft.pages[pageId].ovCard.tree.push({ label: '새 항목', sub: '' });
    _renderOverviewEditor(document.getElementById('program-editor'));
  }

  function deleteTreeItem(pageId, idx) {
    if (!confirm('이 트리 항목을 삭제할까요?')) return;
    _draft.pages[pageId].ovCard.tree.splice(idx, 1);
    _renderOverviewEditor(document.getElementById('program-editor'));
  }

  function updateOverviewNotice(value) {
    _draft.overviewNotice = value;
  }

  function saveOverview() {
    Store.saveConfig(_draft);
    showMsg('✓ 전체 개요가 저장되었습니다.', true);
  }

  function saveProgram(pageId) {
    // 신규 프로그램은 저장 시점에 pageOrder에 등록 (addProgram에서 즉시 push하지 않음)
    if (!MK_CONFIG.pageOrder.includes(pageId)) MK_CONFIG.pageOrder.push(pageId);
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
    // pageOrder 등록은 saveProgram() 시점으로 이동 — 저장 취소 시 고아 ID 방지
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

    const sideHtml = _buildSideMenu(_draft, 'content', false);

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
    document.querySelectorAll('#tab-content .ct-side-item').forEach(item => {
      item.classList.remove('ct-side-active');
    });
    const activeItem = document.querySelector(`#tab-content .ct-side-item[onclick*="${pageId}"]`);
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

    const rows = list.map(s => {
      const safeId = s.key.replace(/[^a-zA-Z0-9]/g, '_');
      return `
        <tr style="cursor:pointer;" onclick="Admin.toggleStudentDetail('${safeId}')">
          <td><strong>${s.key}</strong></td>
          <td>${s.meta?.school || '—'}</td>
          <td>${s.meta?.goal   || '—'}</td>
          <td>${Store.formatDate(s.savedAt)}</td>
          <td onclick="event.stopPropagation()">
            <button class="admin-del-btn" onclick="Admin.deleteStudent('${s.key}')">
              <i class="ti ti-trash"></i> 삭제
            </button>
          </td>
        </tr>
        <tr id="stu-detail-${safeId}" style="display:none;">
          <td colspan="5" style="padding:0 0 4px 0;">
            <div style="background:var(--surface2);border-radius:var(--radius-sm);
              padding:16px 20px;border-top:2px solid var(--accent);">
              ${_buildStudentDetailHtml(s)}
            </div>
          </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:13px;color:var(--text-3);">총 ${list.length}명 — 행 클릭 시 상세 보기</span>
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

  function _buildStudentDetailHtml(s) {
    const config  = MK_CONFIG.resolve();
    const sel     = s._selections || {};
    const memo    = sel._memo || '';
    const safeId  = s.key.replace(/[^a-zA-Z0-9]/g, '_');
    const badges  = [];

    // 연간관리형 카드
    Object.keys(sel.ov || {}).forEach(pageId => {
      const page = config.pages[pageId];
      const amt  = sel.ov[pageId]?.amt;
      if (!page) return;
      const label = page.sbLabel.replace(/^[A-E]\. /, '');
      badges.push(`<span style="display:inline-block;background:var(--blue-bg);color:var(--blue-tx);
        border-radius:4px;padding:2px 8px;font-size:12px;margin:2px 2px 0 0;font-weight:600;">
        ${label} (연간형)${amt ? ' — ' + Math.round(amt / 10000) + '만원' : ''}</span>`);
    });

    // 상세 체크 항목
    Object.keys(sel.pages || {}).forEach(pageId => {
      const page    = config.pages[pageId];
      const idxList = sel.pages[pageId];
      if (!page || !idxList || !idxList.length) return;
      if (sel.ov && sel.ov[pageId]) return;  // ov 이미 표시된 페이지 건너뜀
      idxList.forEach(idx => {
        const price = (page.prices || [])[idx];
        if (!price) return;
        const label = page.sbLabel.replace(/^[A-E]\. /, '');
        badges.push(`<span style="display:inline-block;background:var(--surface);
          border:1px solid var(--border);border-radius:4px;
          padding:2px 8px;font-size:12px;margin:2px 2px 0 0;">
          ${label} — ${price.label}${price.amt ? ' (' + Math.round(price.amt / 10000) + '만원)' : ''}</span>`);
      });
    });

    // 1라인: 선택 프로그램 + DC
    const dc = sel.dc || {};
    const disc = config.discount || {};
    const dcParts = [];
    if (dc.roadmap)    dcParts.push(`로드맵 DC ${disc.roadmap || 0}%`);
    if (dc.individual) dcParts.push('개별 DC');
    const dcText = dcParts.length
      ? `<span style="display:inline-block;background:var(--amber-bg);color:var(--amber-tx);
           border-radius:4px;padding:1px 8px;font-size:12px;font-weight:600;white-space:nowrap;flex-shrink:0;">
           ${dcParts.join(' · ')} 적용</span>`
      : '';

    const badgesHtml = badges.length
      ? badges.join('')
      : `<span style="font-size:12px;color:var(--text-3);">선택된 프로그램 없음</span>`;

    return `
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        <span style="font-size:11px;font-weight:700;color:var(--text-3);letter-spacing:.08em;
          text-transform:uppercase;white-space:nowrap;padding-top:3px;flex-shrink:0;">프로그램</span>
        <div style="flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:2px;align-items:center;">
          ${badgesHtml}
        </div>
        ${dcText}
      </div>
      <div style="display:flex;align-items:flex-start;gap:8px;">
        <span style="font-size:11px;font-weight:700;color:var(--text-3);letter-spacing:.08em;
          text-transform:uppercase;white-space:nowrap;padding-top:6px;flex-shrink:0;">메모</span>
        <div style="flex:1;position:relative;">
          <textarea class="admin-input" id="memo-${safeId}" rows="1"
            style="resize:vertical;width:100%;font-size:13px;line-height:1.6;min-height:34px;"
            placeholder="상담 내용, 특이사항...">${memo}</textarea>
        </div>
        <button class="admin-add-btn" style="margin-top:0;flex-shrink:0;"
          onclick="Admin.saveMemo('${s.key}', '${safeId}')">
          <i class="ti ti-device-floppy"></i>
        </button>
      </div>`;
  }

  function toggleStudentDetail(safeId) {
    const row = document.getElementById('stu-detail-' + safeId);
    if (!row) return;
    row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
  }

  async function saveMemo(key, safeId) {
    const textarea = document.getElementById('memo-' + safeId);
    if (!textarea) return;
    const memo = textarea.value.trim();

    const data = await Store.loadStudent(key);
    if (!data) { showMsg('학생 데이터 로드 실패', false); return; }

    const updatedSel = Object.assign({}, data.selections, { _memo: memo });
    const ok = await Store.saveStudent(key, updatedSel, data.meta);
    if (ok) {
      Store.addLog('content', `메모 ${key}`, '—', memo.substring(0, 30));
      showMsg(`✓ ${key} 메모 저장 완료`, true);
    } else {
      showMsg('메모 저장 실패 — 네트워크 확인', false);
    }
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
   * 8-2. 탭 — 할인율 관리
   * ============================================================ */
  let _discountSection = 'roadmap'; // 현재 선택 섹션

  function renderDiscountTab() {
    const el   = document.getElementById('tab-discount');
    const disc = _draft.discount || {};

    const sideHtml = `
      <div class="ct-group-label">할인 구분</div>
      <div class="ct-side-item ${_discountSection === 'roadmap' ? 'ct-side-active' : ''}"
        onclick="Admin.loadDiscountSection('roadmap')">
        <i class="ti ti-map" style="font-size:14px;"></i> 로드맵 DC
      </div>
      <div class="ct-side-item ${_discountSection === 'individual' ? 'ct-side-active' : ''}"
        onclick="Admin.loadDiscountSection('individual')">
        <i class="ti ti-user-check" style="font-size:14px;"></i> 개별 DC
      </div>`;

    el.innerHTML = `
      <div style="display:flex;gap:0;min-height:500px;">
        <div class="ct-sidebar">${sideHtml}</div>
        <div class="ct-editor" id="discount-editor"></div>
      </div>`;

    loadDiscountSection(_discountSection);
  }

  function loadDiscountSection(section) {
    _discountSection = section;
    const el   = document.getElementById('discount-editor');
    const disc = _draft.discount || {};
    if (!el) return;

    // 사이드 active 갱신
    document.querySelectorAll('#tab-discount .ct-side-item').forEach(i => i.classList.remove('ct-side-active'));
    const sel = document.querySelector(`#tab-discount .ct-side-item[onclick*="${section}"]`);
    if (sel) sel.classList.add('ct-side-active');

    if (section === 'roadmap') {
      el.innerHTML = `
        <div class="admin-editor-title">
          <i class="ti ti-map"></i> 로드맵 DC 할인율
        </div>
        <div class="admin-field-group">
          <label class="admin-field-label">할인율 (%)</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <input class="admin-input" style="width:80px;text-align:right;"
              type="number" min="0" max="100"
              value="${disc.roadmap ?? 0}"
              oninput="Admin.updateDiscountField('roadmap', this.value)">
            <span style="font-size:13px;color:var(--text-2);">%</span>
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-top:6px;">
            로드맵 DC 버튼 클릭 시 전체 로드맵 합산에서 해당 % 할인
          </div>
        </div>
        <div style="margin-top:20px;">
          <button class="admin-add-btn" style="margin-top:0;" onclick="Admin.saveDiscountSection('roadmap')">
            <i class="ti ti-device-floppy"></i> 저장
          </button>
        </div>`;
      return;
    }

    // 개별 항목별 할인율
    const indDisc = (typeof disc.individual === 'object') ? disc.individual : {};
    const indPages = MK_CONFIG.pageOrder.filter(id => {
      const p = _draft.pages[id];
      return p && p.group === 'individual' && !p.isOverview;
    });

    const rows = indPages.map(id => {
      const p    = _draft.pages[id];
      const rate = indDisc[id] ?? 0;
      return `
        <div class="admin-price-row" style="gap:10px;">
          <span style="flex:1;font-size:13px;font-weight:600;color:var(--text-1);">
            <i class="ti ${p.sbIcon}" style="font-size:13px;color:var(--accent);"></i>
            ${p.sbLabel}
          </span>
          <div style="display:flex;align-items:center;gap:6px;">
            <input class="admin-input" style="width:70px;text-align:right;"
              type="number" min="0" max="100" value="${rate}"
              oninput="Admin.updateIndividualDiscount('${id}', this.value)">
            <span style="font-size:13px;color:var(--text-2);">%</span>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="admin-editor-title">
        <i class="ti ti-user-check"></i> 개별 항목별 DC 할인율
      </div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:12px;">
        0%이면 해당 항목 할인 없음. 모두 0이면 개별 DC 버튼 숨김.
      </div>
      <div>${rows}</div>
      <div style="margin-top:20px;">
        <button class="admin-add-btn" style="margin-top:0;" onclick="Admin.saveDiscountSection('individual')">
          <i class="ti ti-device-floppy"></i> 저장
        </button>
      </div>`;
  }

  function updateIndividualDiscount(pageId, value) {
    if (!_draft.discount) _draft.discount = {};
    if (typeof _draft.discount.individual !== 'object') _draft.discount.individual = {};
    _draft.discount.individual[pageId] = parseInt(value) || 0;
  }

  function saveDiscountSection(section) {
    if (!confirm(`${section === 'roadmap' ? '로드맵' : '개별'} DC 할인율을 저장하시겠습니까?`)) return;
    Store.saveConfig(_draft);
    showMsg(`✓ ${section === 'roadmap' ? '로드맵' : '개별'} DC 할인율이 저장되었습니다.`, true);
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

  function updateGroupLabel(key, value) {
    if (!_draft.groups) _draft.groups = {};
    if (!_draft.groups[key]) _draft.groups[key] = {};
    _draft.groups[key].label = value;
  }

  function saveGroupLabels() {
    Store.saveConfig(_draft);
    showMsg('✓ 그룹 헤더명이 저장되었습니다.', true);
    renderProgramTab();
  }

  return {
    checkPin, switchTab,
    // 프로그램 관리 (통합)
    renderProgramTab, loadProgramPage, saveProgram,
    updateGroupLabel, saveGroupLabels, loadGroupLabelEditor,
    addProgram, deleteProgram,
    _confirmWithPin, _pinConfirmSubmit,
    _toggleGroup,
    updateTreeField, addTreeItem, deleteTreeItem,
    updateOverviewNotice, saveOverview,
    // 가격 필드
    updatePriceField, addPriceItem, deletePriceItem,
    updateDiscountField, saveDcDiscount,
    renderDiscountTab, loadDiscountSection,
    updateIndividualDiscount, saveDiscountSection,
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
    toggleStudentDetail, saveMemo,
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
