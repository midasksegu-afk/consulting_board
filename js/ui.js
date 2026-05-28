/**
 * ui.js — 마이더스K DOM 렌더링 & 이벤트 전담
 *
 * 원칙:
 *  - Calc / Store / Config 는 DOM을 모름 → UI만 DOM 조작
 *  - 모든 렌더링은 config 기반 동적 생성 (하드코딩 없음)
 *  - 이벤트 → Calc 호출 → onChange 콜백 → UI 업데이트
 *
 * 로드 순서: config.js → store.js → calc.js → ui.js
 */

const UI = (() => {

  /* ============================================================
   * 내부 유틸
   * ============================================================ */
  function fmt(n) {
    if (n === 0) return '0원';
    const man = Math.round(n / 10000);
    return man > 0 ? `${man.toLocaleString('ko-KR')}만원` : `${n.toLocaleString('ko-KR')}원`;
  }

  function cfg() {
    return MK_CONFIG.resolve();
  }

  // 관리자 인증 상태 확인 (localStorage — 탭 간 공유)
  function _isAdminMode() {
    return localStorage.getItem('mk_admin_auth') === '1';
  }

  let _currentPageId = 'rm-overview';
  let _editDraft = null;
  let _currentStudentKey = null;  // 현재 불러온 학생 키 (덮어쓰기 저장용)

  // 관리자 인증 후 편집 버튼 + 자물쇠 아이콘 갱신
  function _refreshEditButtons() {
    const show = _isAdminMode();
    document.querySelectorAll('.edit-mode-btn').forEach(btn => {
      btn.style.display = show ? '' : 'none';
    });
    const icon = document.getElementById('admin-lock-icon');
    const btn  = document.getElementById('admin-lock-btn');
    if (icon) icon.className = show ? 'ti ti-lock-open' : 'ti ti-lock';
    if (btn)  btn.style.color = show ? 'var(--accent)' : '';
  }

  // 관리자 모드 토글 (로그인/로그아웃)
  function toggleAdminMode() {
    if (_isAdminMode()) {
      // 로그아웃
      localStorage.removeItem('mk_admin_auth');
      _refreshEditButtons();
      renderSidebar();
      renderPages();
      go(_currentPageId);
      showToast('관리자 모드 종료', 'warn');
    } else {
      // 로그인
      _showPinModal(() => {
        localStorage.setItem('mk_admin_auth', '1');
        _refreshEditButtons();
        renderSidebar();
        renderPages();
        go(_currentPageId);
        showToast('✓ 관리자 모드 활성화', 'success');
      });
    }
  }


  /* ============================================================
   * 1. 초기화 — DOMContentLoaded 에서 호출
   * ============================================================ */
  function init() {
    // Calc 변경 구독 → UI 갱신
    Calc.onChange((totals, state) => {
      _updateTotalBoxes(Calc.getAllTotalsDc());
      _updateLocalTotal(_currentPageId);
      _syncCheckboxes(state);
      _syncGradeButtons(state.grade);
      _syncOvCards(state);
    });

    // 렌더링
    renderSidebar();
    renderPages();
    renderStudentDropdown();

    // 세션 복원
    const session = Store.loadSession();
    if (session && session.grade && session.grade !== 0) Calc.fromSnapshot(session);

    // DC 버튼 초기화
    _updateDcButtons();

    // 자물쇠 초기 상태 반영
    _refreshEditButtons();

    // 초기 페이지
    go('rm-overview');
  }


  /* ============================================================
   * 2. 페이지 전환
   * ============================================================ */
  function go(pageId) {
    _currentPageId = pageId;

    // 페이지 표시
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pg = document.getElementById('pg-' + pageId);
    if (pg) pg.classList.add('active');

    // 사이드바 active
    document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('active'));
    const navEl = document.getElementById('nav-' + pageId);
    if (navEl) navEl.classList.add('active');

    // topbar title — 학생명 전용, 페이지 타이틀 표시 제거
    const page = cfg().pages[pageId];

    // autoCheck (rm-d / rm-e 첫 진입)
    if (page && page.autoCheck) {
      Calc.autoCheckPage(pageId);
    }

    // 로컬 합계 갱신
    _updateLocalTotal(pageId);

    // 개별/대입전략 페이지 진입 시 학년 버튼 비활성화 (로드맵만 학년 선택 가능)
    const isRoadmap = page && page.group === 'roadmap';
    document.querySelectorAll('.grade-btn').forEach(btn => {
      btn.disabled = !isRoadmap;
      btn.style.opacity = isRoadmap ? '' : '0.35';
      btn.style.cursor  = isRoadmap ? '' : 'not-allowed';
    });
  }


  /* ============================================================
   * 3. 학년 버튼 토글
   * ============================================================ */
  function toggleGrade(n) {
    const prev     = Calc.getGrade();
    const newGrade = Calc.setGrade(n);
    _updateOvCardPrices(newGrade);
    _autoCheckOvCards(newGrade);
    // 학년 버튼 disabled 상태 갱신 — go()의 grade-btn 처리 트리거
    go(_currentPageId);
    if (prev !== 0 && newGrade !== prev) {
      showToast('학년이 변경되어 선택이 초기화되었습니다', 'warn');
    }
  }

  // 카드 가격 표시 모드 판별
  //   'grade' : ovPrices 있음 → 학년 선택 시 해당 학년 금액 굵게 표시
  //   'fixed' : ovPrices 없음(무관) → 학년 무관 항상 금액 표시
  function _getOvPriceMode(page) {
    if (page.ovCard.ovPrices) return 'grade';
    return 'fixed';
  }

  // 무관(fixed) 카드 가격 HTML
  function _buildFixedPriceHtml(page) {
    if (page.prices && page.prices.length) {
      return page.prices.map(pr => {
        const man = pr.amt ? Math.round(pr.amt / 10000) + '만원' : '0원';
        return pr.label + ' ' + man + '<br>';
      }).join('');
    }
    return (page.ovCard.priceLabel || []).map(p => p + '<br>').join('');
  }

  // 학년 grade 기준 priceHtml 생성 — 렌더와 업데이트 로직 통일
  //   grade === 0 : 기본 모드 → 전 카드 동일하게 priceLabel (설명 문구)
  //   grade > 0  : 학년 모드 → A,B: 해당 학년 금액 굵게 / C,D,E: 무관 금액
  function _buildOvPriceHtml(page, grade) {
    if (grade === 0) {
      return (page.ovCard.priceLabel || []).map(p => p + '<br>').join('');
    }
    const mode = _getOvPriceMode(page);
    if (mode === 'fixed') return _buildFixedPriceHtml(page);
    const amt = (page.ovCard.ovPrices || {})[grade];
    return amt
      ? '<strong>고' + grade + ' ' + fmt(amt) + '</strong>'
      : (page.ovCard.priceLabel || []).map(p => p + '<br>').join('');
  }

  // 연간관리형 카드 금액 — 학년 모드 / 기본 모드 전환
  function _updateOvCardPrices(grade) {
    const config = cfg();
    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = config.pages[pageId];
      if (!page || !page.ovCard || page.isOverview) return;
      const descEl  = document.getElementById('ov-desc-display-' + pageId);
      const priceEl = document.getElementById('ov-price-' + pageId);
      if (!priceEl) return;
      if (grade === 0) {
        if (descEl) descEl.style.display = '';
        priceEl.style.display = descEl ? 'none' : '';
      } else {
        if (descEl) descEl.style.display = 'none';
        priceEl.style.display = '';
        priceEl.innerHTML = _buildOvPriceHtml(page, grade);
      }
    });
  }

  // 학년 선택 시 A/B 카드만 자동 체크 (noAutoCheck 플래그 있으면 제외)
  function _autoCheckOvCards(grade) {
    const config = cfg();
    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = config.pages[pageId];
      if (!page || !page.ovCard || page.ovCard.fixed || page.isOverview) return;
      if (page.ovCard.noAutoCheck) return; // rm-c 제외
      const cb   = document.getElementById('ovchk-' + pageId);
      const card = document.getElementById('ovcard-' + pageId);
      if (grade === 0) {
        if (cb) cb.checked = false;
        if (card) card.classList.remove('card-selected');
        Calc.selectOv(pageId, false);
      } else {
        if (cb) cb.checked = true;
        if (card) card.classList.add('card-selected');
        Calc.selectOv(pageId, true);
      }
    });
  }

  // overviewNotices 배열 보장 — 하위 호환 변환 헬퍼
  function _ensureNoticesArray(draft) {
    if (!draft.overviewNotices || !draft.overviewNotices.length) {
      draft.overviewNotices = draft.overviewNotice
        ? [{ text: draft.overviewNotice, icon: 'ti-alert-triangle', color: 'orange' }] : [];
    }
    return draft.overviewNotices;
  }

  function _syncGradeButtons(grade) {
    document.querySelectorAll('.grade-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.grade) === grade);
    });
    const aocSection = document.getElementById('aoc-section');
    if (aocSection) aocSection.style.display = grade === 3 ? 'block' : 'none';
    // 하단 global-notice 전체 — 고3 선택 시 숨김
    document.querySelectorAll('#pg-rm-overview .global-notice').forEach(el => {
      el.style.display = grade === 3 ? 'none' : 'flex';
    });
  }


  /* ============================================================
   * 4. topbar 합산 박스 업데이트
   * ============================================================ */
  function _updateTotalBoxes(totals) {
    const el = id => document.getElementById(id);
    if (el('total-roadmap'))    el('total-roadmap').textContent    = fmt(totals.roadmap);
    if (el('total-individual')) el('total-individual').textContent = fmt(totals.individual);
    if (el('total-strategy'))   el('total-strategy').textContent   = fmt(totals.strategy);
    if (el('total-sum'))        el('total-sum').textContent        = fmt((totals.roadmap||0) + (totals.individual||0) + (totals.strategy||0));
  }

  function _updateLocalTotal(pageId) {
    const el = document.getElementById('local-' + pageId);
    if (el) el.textContent = fmt(Calc.getPageTotal(pageId));
  }


  /* ============================================================
   * 5. 체크박스 DOM 동기화 (fromSnapshot 후)
   * ============================================================ */
  function _syncCheckboxes(state) {
    document.querySelectorAll('input[type=checkbox][data-item-idx]').forEach(cb => {
      const pageId = cb.closest('.page')?.id?.replace('pg-', '');
      if (!pageId) return;
      const idx = parseInt(cb.getAttribute('data-item-idx'));
      cb.checked = Calc.isItemSelected(pageId, idx);

      // ov 선택된 페이지 체크박스 비활성화
      if (Calc.isOvSelected(pageId)) {
        cb.disabled = true;
        cb.closest('label')?.classList.add('p-opt-disabled');
      } else {
        // grade 불일치 항목 비활성화
        const priceGrade = cb.getAttribute('data-grade');
        const curGrade   = Calc.getGrade();
        const gradeList  = priceGrade ? String(priceGrade).split(',').map(g => Number(g.trim())) : [];
        const gradeOff   = gradeList.length > 0 && curGrade !== 0 && !gradeList.includes(curGrade);
        cb.disabled = gradeOff;
        if (gradeOff) cb.closest('label')?.classList.add('p-opt-disabled');
        else          cb.closest('label')?.classList.remove('p-opt-disabled');
      }
    });

    // aoc 체크박스 동기화 — id="aoc-{pageId}-{idx}" 패턴, .page 안에 없어 위 루프에서 누락됨
    document.querySelectorAll('input[type=checkbox][id^="aoc-"]').forEach(cb => {
      const parts  = cb.id.split('-');          // ['aoc', 'sc', 'suisi', '0'] 등
      const idx    = parseInt(parts[parts.length - 1]);
      const pageId = parts.slice(1, -1).join('-'); // 'sc-suisi'
      cb.checked = Calc.isItemSelected(pageId, idx);
    });

    _updateLocalTotal(_currentPageId);
  }

  function _syncOvCards(state) {
    // 연간관리형 카드 체크박스 동기화
    Object.keys(cfg().pages).forEach(pageId => {
      const cb = document.getElementById('ovchk-' + pageId);
      if (!cb) return;
      const isSelected = Calc.isOvSelected(pageId);
      cb.checked = isSelected;
      const card = cb.closest('.ov-card');
      if (card) card.classList.toggle('card-selected', isSelected);
    });
  }


  /* ============================================================
   * 6. 사이드바 동적 렌더링 (아코디언)
   * ============================================================ */

  // 그룹별 접힘 상태 (기본: 모두 펼침)
  const _sbCollapsed = {};

  function renderSidebar() {
    const nav = document.getElementById('sb-nav');
    if (!nav) return;

    const config  = cfg();
    const groups  = config.groups;
    const pages   = config.pages;
    const order   = MK_CONFIG.pageOrder;

    // 그룹별로 페이지 묶기
    const grouped = {}; // { groupKey: [pageId, ...] }
    const groupOrder = [];

    order.forEach(pageId => {
      const page = pages[pageId];
      if (!page) return;
      const gk = page.group;
      if (!grouped[gk]) { grouped[gk] = []; groupOrder.push(gk); }
      grouped[gk].push(pageId);
    });

    let html = '';

    groupOrder.forEach((gk, gIdx) => {
      const group = groups[gk];
      if (!group?.sbSection) return;

      const isCollapsed = !!_sbCollapsed[gk];
      const arrowCls    = isCollapsed ? 'sb-arrow collapsed' : 'sb-arrow';
      const itemsCls    = isCollapsed ? 'sb-group-items collapsed' : 'sb-group-items';
      const borderTop   = gIdx > 0 ? 'sb-section-divider' : '';

      html += `
        <div class="sb-section ${borderTop}" onclick="UI.toggleSbGroup('${gk}')" data-group="${gk}">
          <span class="sb-section-label">${group.label}</span>
          <i class="ti ti-chevron-down ${arrowCls}"></i>
        </div>
        <div class="${itemsCls}" data-group-items="${gk}">`;

      grouped[gk].forEach(pageId => {
        const page = pages[pageId];
        html += `
          <div class="sb-item" id="nav-${pageId}" onclick="UI.go('${pageId}')">
            <i class="ti ${page.sbIcon}"></i> ${page.sbLabel}
          </div>`;
      });

      html += `</div>`;
    });

    nav.innerHTML = html;
  }

  function toggleSbGroup(gk) {
    _sbCollapsed[gk] = !_sbCollapsed[gk];

    const section   = document.querySelector(`.sb-section[data-group="${gk}"]`);
    const itemsEl   = document.querySelector(`[data-group-items="${gk}"]`);
    const arrow     = section?.querySelector('.sb-arrow');

    if (_sbCollapsed[gk]) {
      itemsEl?.classList.add('collapsed');
      arrow?.classList.add('collapsed');
    } else {
      itemsEl?.classList.remove('collapsed');
      arrow?.classList.remove('collapsed');
    }
  }


  /* ============================================================
   * 7. 전체 페이지 동적 렌더링
   * ============================================================ */
  function renderPages() {
    const container = document.getElementById('content');
    if (!container) return;

    const config = cfg();
    let html = '';

    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = config.pages[pageId];
      if (!page) return;

      if (page.isOverview) {
        html += _renderOverviewPage(config);
      } else {
        html += _renderDetailPage(pageId, page);
      }
    });

    container.innerHTML = html;
  }


  /* ── 연간관리형 개요 페이지 ── */
  function _renderOverviewPage(config) {
    const order = MK_CONFIG.pageOrder.filter(id => {
      const p = config.pages[id];
      return p && p.group === 'roadmap' && !p.isOverview;
    });

    const cards = order.map(pageId => {
      const page = config.pages[pageId];
      const ov   = page.ovCard;
      if (!ov) return '';

      const checkArea = ov.fixed
        ? `<div class="ov-check-area">
             <label class="ov-check-label fixed" title="기본 포함 항목"></label>
             <span class="ov-fixed-badge">기본 포함</span>
           </div>`
        : `<div class="ov-check-area">
             <div class="ov-check-wrap">
               <input type="checkbox" class="ov-checkbox" id="ovchk-${pageId}"
                 onchange="UI.handleOvCheck('${pageId}', this)">
               <label class="ov-check-label" for="ovchk-${pageId}"></label>
             </div>
           </div>`;

      const treeFontSize = ov.treeFontSize ? `font-size:${ov.treeFontSize}pt;` : '';
      const treeHtml = (ov.tree || []).map(t => `
        <div class="ov-tree-item">
          <div class="ov-tree-dot"></div>
          <div>
            <div class="ov-tree-label" style="${treeFontSize}">${t.label}</div>
            <div class="ov-tree-sub"  style="${treeFontSize}">${t.sub}</div>
          </div>
        </div>`).join('');

      // 초기 priceHtml — _buildOvPriceHtml로 생성 (업데이트 로직과 동일)
      const currentGrade = Calc.getGrade ? Calc.getGrade() : 0;
      const priceHtml = _buildOvPriceHtml(page, currentGrade);

      const ovEditBtn = _isAdminMode()
        ? `<button class="edit-mode-btn ov-edit-btn" onclick="event.stopPropagation();UI.openOvCardEdit('${pageId}')" title="카드 편집" style="position:absolute;bottom:8px;right:8px;"><i class="ti ti-pencil"></i> 편집</button>`
        : '';

      return `
        <div class="ov-card" id="ovcard-${pageId}" style="position:relative;">
          ${checkArea}
          <div class="ov-icon" style="background:${page.iconBg};color:${page.iconColor};">
            <i class="ti ${page.iconClass}"></i>
          </div>
          <div class="ov-badge">${ov.badge}</div>
          <div class="ov-name">${page.sbLabel.replace(/^[A-E]\. /, '')}</div>
          <div class="ov-desc" id="ov-desc-display-${pageId}" style="${ov.desc ? '' : 'display:none;'}">${ov.desc || ''}</div>
          <div class="ov-price" id="ov-price-${pageId}" style="${ov.desc ? 'display:none;' : ''}">${priceHtml}</div>
          <div style="flex:1;min-height:8px;"></div>
          <button class="ov-detail-btn" onclick="UI.go('${pageId}')">
            <i class="ti ti-arrow-right"></i> 자세히 보기
          </button>
          <div class="ov-tree">${treeHtml}</div>
          ${ovEditBtn}
        </div>`;
    }).join('');

    // 고3 추가 옵션 카드 — sc-suisi / sc-interview / sc-jeongsi
    const addOnPageIds = ['sc-suisi', 'sc-interview', 'sc-jeongsi'];
    const addOnCards = addOnPageIds.map(pageId => {
      const page = config.pages[pageId];
      if (!page) return '';
      const priceRows = (page.prices || []).map((pr, idx) => {
        const amtStr = pr.amt ? Math.round(pr.amt / 10000) + '만원' : '0원';
        const noteStr = pr.note ? `<span class="aoc-note">${pr.note}</span>` : '';
        return `
          <label class="aoc-price-row">
            <input type="checkbox" class="ov-checkbox" id="aoc-${pageId}-${idx}"
              onchange="UI.handleItemCheck('${pageId}', ${idx}, this)">
            <label class="ov-check-label" for="aoc-${pageId}-${idx}"></label>
            <span class="aoc-label">${pr.label}</span>
            <span class="aoc-amt">${amtStr}</span>
            ${noteStr}
          </label>`;
      }).join('');
      return `
        <div class="aoc-card" id="aoc-card-${pageId}">
          <div class="ov-check-area">
            <button class="aoc-link" onclick="UI.go('${pageId}')">
              <i class="ti ti-arrow-right"></i> 자세히
            </button>
          </div>
          <div class="ov-icon" style="background:${page.iconBg};color:${page.iconColor};">
            <i class="ti ${page.iconClass}"></i>
          </div>
          <div class="ov-name">${page.title}</div>
          <div class="aoc-prices">${priceRows}</div>
        </div>`;
    }).join('');

    const noticeCard = `
        <div class="aoc-notice-card">
          <i class="ti ti-alert-triangle"></i>
          <span>${config.overviewNotice}</span>
        </div>`;

    const notices = (config.overviewNotices && config.overviewNotices.length)
      ? config.overviewNotices
      : (config.overviewNotice
          ? [{ text: config.overviewNotice, icon: 'ti-alert-triangle', color: 'orange' }]
          : []);

    const noticesHtml = notices.map((n, idx) => {
      const icon  = n.icon  || 'ti-alert-triangle';
      const color = n.color || 'orange';
      const adminBtns = _isAdminMode() ? `
        <button class="edit-mode-btn" onclick="UI.openNoticeEdit(${idx})" style="margin-left:8px;flex-shrink:0;" title="공지 편집">
          <i class="ti ti-pencil"></i> 편집
        </button>
        <button class="edit-mode-btn" onclick="UI._deleteNotice(${idx})" style="margin-left:4px;flex-shrink:0;color:#c0392b;" title="공지 삭제">
          <i class="ti ti-trash"></i>
        </button>` : '';
      return `
      <div class="global-notice n-${color}" id="gnotice-${idx}">
        <i class="ti ${icon}"></i>
        <span style="flex:1;">${n.text}</span>
        ${adminBtns}
      </div>`;
    }).join('');

    const noticeAddBtn = _isAdminMode()
      ? `<div style="display:flex;justify-content:flex-end;padding:4px 0;">
           <button class="edit-mode-btn" onclick="UI.openNoticeEdit(-1)" title="공지 추가">
             <i class="ti ti-plus"></i> 공지 추가
           </button>
         </div>`
      : '';

    return `
      <div id="pg-rm-overview" class="page">
        <div class="ov-grid">${cards}</div>
        <div class="aoc-section" id="aoc-section" style="display:none;">
          <div class="aoc-header"><i class="ti ti-plus"></i> 고3 추가 선택 항목</div>
          <div class="aoc-grid">${addOnCards}${noticeCard}</div>
        </div>
        ${noticesHtml}
        ${noticeAddBtn}
      </div>`;
  }


  /* ── 상세 페이지 ── */
  function _renderDetailPage(pageId, page) {
    const programsHtml   = _renderPrograms(page.programs || []);
    const conditionsHtml = _renderConditions(page.conditions || []);
    const notesHtml      = _renderNotes(page.notes || []);
    const priceCardHtml  = _renderPriceCard(pageId, page);

    return `
      <div id="pg-${pageId}" class="page">
        <div class="detail-header">
          <div class="detail-icon" style="background:${page.iconBg};color:${page.iconColor};">
            <i class="ti ${page.iconClass}"></i>
          </div>
          <div style="flex:1;">
            <div class="detail-title">${page.title}</div>
            <div class="detail-sub">${page.subtitle || ''}</div>
          </div>
          ${_isAdminMode() ? `<button class="edit-mode-btn" onclick="UI.openPageEdit('${pageId}')" title="이 페이지 편집"><i class="ti ti-pencil"></i> 편집</button>` : ''}
        </div>
        <div class="detail-grid">
          <div>
            <div class="d-col-label">프로그램 구성</div>
            ${programsHtml}
          </div>
          <div>
            <div class="d-col-label">제공 조건 및 세부 내용</div>
            ${conditionsHtml}
            ${notesHtml}
          </div>
          <div>
            <div class="d-col-label">개별가 선택</div>
            ${priceCardHtml}
          </div>
        </div>
      </div>`;
  }

  function _renderPrograms(programs) {
    return programs.map(p => {
      const hasLink = p.title.includes('세특구원자');
      const titleHtml = hasLink
        ? `${p.title} <a href="https://naver.me/GfMeckyJ" target="_blank" rel="noopener"
            style="font-size:11px;font-weight:600;color:#B79CFF;text-decoration:none;
            border:1px solid rgba(183,156,255,0.4);border-radius:4px;padding:1px 7px;margin-left:6px;vertical-align:middle;">
            <i class="ti ti-external-link" style="font-size:11px;"></i> 바로가기</a>`
        : p.title;
      return `
      <div class="p-item">
        <div class="p-title">${titleHtml}</div>
        <div class="p-desc">
          <ul>${(p.items || []).map(i => `<li>${i}</li>`).join('')}</ul>
        </div>
      </div>`;
    }).join('');
  }

  function _renderConditions(conditions) {
    return conditions.map(c => {
      let body = '';
      if (c.type === 'tags+text') {
        const tags = (c.tags || []).map(t => `<span class="c-tag">${t}</span>`).join('');
        body = `${tags}<div style="margin-top:10px;">${c.text}</div>`;
      } else {
        // type: 'text' — 줄바꿈을 •로 표시
        body = c.text.split('\n').map(line => `• ${line}`).join('<br>');
      }
      return `
        <div class="c-box">
          <div class="c-title">${c.title}</div>
          <div class="c-txt">${body}</div>
        </div>`;
    }).join('');
  }

  function _renderNotes(notes) {
    const colorMap = {
      blue:  { cls: 'n-blue',  icon: 'ti-info-circle' },
      amber: { cls: 'n-amber', icon: 'ti-alert-triangle' },
      red:   { cls: 'n-red',   icon: 'ti-ban' },
      green: { cls: 'n-green', icon: 'ti-circle-check' },
    };
    return notes.map(n => {
      const cm = colorMap[n.color] || colorMap.blue;
      const icon = n.icon || cm.icon;
      return `
        <div class="notice ${cm.cls}">
          <i class="ti ${icon}"></i>
          <span>${n.text}</span>
        </div>`;
    }).join('');
  }

  function _renderPriceCard(pageId, page) {
    const prices = page.prices || [];

    // rm-c 전용 — 할인 구독 카드
    if (page.priceRef) {
      return _renderPriceCardRmc(pageId, page);
    }

    const hasGrade = prices.some(p => p.grade);
    const label = hasGrade ? '학년 선택' : '항목 선택';

    const currentGrade = Calc.getGrade();
    const opts = prices.map((price, idx) => {
      const gradeAttr = price.grade ? ` data-grade="${price.grade}"` : '';
      const noteHtml  = price.note ? `<div class="p-opt-note">${price.note}</div>` : '';
      const badgeHtml = price.badge
        ? ` <span style="font-size:11px;background:linear-gradient(135deg,#6c5ff5,#9b4dfc);color:#fff;padding:1px 7px;border-radius:8px;font-weight:600;vertical-align:middle;">${price.badge}</span>`
        : '';

      // grade 있는 항목 — 현재 학년과 불일치 시 disabled
      const gradeList     = price.grade ? String(price.grade).split(',').map(g => Number(g.trim())) : [];
      const gradeDisabled = gradeList.length > 0 && currentGrade !== 0 && !gradeList.includes(currentGrade);
      const disabledAttr  = gradeDisabled ? ' disabled' : '';
      const disabledCls   = gradeDisabled ? ' p-opt-disabled' : '';

      return `
        <label class="p-opt${disabledCls}">
          <input type="checkbox"
            data-amt="${price.amt}"
            data-item-idx="${idx}"
            ${gradeAttr}${disabledAttr}
            onchange="UI.handleItemCheck('${pageId}', ${idx}, this)">
          <div class="p-opt-lbl">
            <div class="p-opt-grade">${price.label}${badgeHtml}</div>
            ${noteHtml}
          </div>
          <span class="p-opt-amt">${fmt(price.amt)}</span>
        </label>`;
    }).join('');

    return `
      <div class="price-card">
        <div class="pc-title">${label}</div>
        ${opts}
        <div class="pc-divider"></div>
        <div class="pc-total">
          <span class="pc-total-lbl">페이지 선택 합계</span>
          <span class="pc-total-amt" id="local-${pageId}">0원</span>
        </div>
      </div>`;
  }

  // rm-c 전용 가격 카드 — 원가 취소선 + 할인가 + 절약금액
  function _renderPriceCardRmc(pageId, page) {
    const prices = page.prices || [];
    const refs   = page.priceRef || [];

    const opts = prices.map((price, idx) => `
      <label class="p-opt p-opt-discount">
        <input type="checkbox"
          data-amt="${price.amt}"
          data-item-idx="${idx}"
          onchange="UI.handleItemCheck('${pageId}', ${idx}, this)">
        <div class="p-opt-lbl">
          <div class="p-opt-grade">${price.label}</div>
          <div class="p-opt-note">${price.note}</div>
          <div class="p-opt-origin">
            원가 <s>${price.origAmt.toLocaleString('ko-KR')}원</s>
            → <strong style="color:#5b35c4;">${price.amt.toLocaleString('ko-KR')}원</strong>
          </div>
          <div class="p-opt-save">💰 ${price.saveAmt.toLocaleString('ko-KR')}원 절약 (${price.discountRate}% 할인)</div>
        </div>
      </label>`).join('');

    const refHtml = refs.map(r => `
      <div class="p-ref-row">
        <span class="p-ref-label">${r.label}</span>
        <span class="p-ref-val">${r.ref}</span>
      </div>`).join('');

    return `
      <div class="price-card">
        <div class="pc-title">구독 선택</div>
        ${opts}
        <div class="pc-divider"></div>
        <div class="p-ref-section">
          <div class="p-ref-title">참고 (개별 이용)</div>
          ${refHtml}
        </div>
        <div class="pc-divider"></div>
        <div class="pc-total">
          <span class="pc-total-lbl">페이지 선택 합계</span>
          <span class="pc-total-amt" id="local-${pageId}">0원</span>
        </div>
      </div>`;
  }


  /* ============================================================
   * 8. 이벤트 핸들러 — HTML에서 직접 호출
   * ============================================================ */

  /** 연간관리형 카드 체크 */
  function handleOvCheck(pageId, cb) {
    const ok = Calc.selectOv(pageId, cb.checked);
    if (!ok) {
      cb.checked = false;
      showToast('학년을 먼저 선택해 주세요', 'warn');
      return;
    }
    const card = document.getElementById('ovcard-' + pageId);
    if (card) card.classList.toggle('card-selected', cb.checked);
  }

  /** 상세 페이지 체크박스 */
  function handleItemCheck(pageId, idx, cb) {
    if (Calc.isOvSelected(pageId)) {
      cb.checked = false;
      showToast('연간관리형으로 이미 포함된 항목입니다', 'warn');
      return;
    }
    Calc.selectItem(pageId, idx, cb.checked);
    _updateLocalTotal(pageId);
  }


  /* ============================================================
   * 9-0. 선택 프로그램 요약 텍스트 생성
   * ============================================================ */
  function _buildSelectionSummary(selections) {
    if (!selections) return '';
    const config = MK_CONFIG.resolve();
    const parts  = [];
    Object.keys(selections.ov || {}).forEach(pageId => {
      const page = config.pages[pageId];
      if (page) parts.push(page.sbLabel.replace(/^[A-E]\. /, '') + ' (연간형)');
    });
    Object.keys(selections.pages || {}).forEach(pageId => {
      const page    = config.pages[pageId];
      const idxList = selections.pages[pageId];
      if (!page || !idxList || !idxList.length) return;
      if (selections.ov && selections.ov[pageId]) return;
      parts.push(page.sbLabel.replace(/^[A-E]\. /, '') + ' ' + idxList.length + '항목');
    });
    return parts.length ? parts.join(' · ') : '';
  }

  /* ============================================================
   * 9. 학생 저장 모달
   * ============================================================ */
  function openSaveStudentModal() {
    const existing = document.getElementById('student-modal');
    if (existing) existing.remove();

    const isUpdate  = !!_currentStudentKey;
    const titleText = isUpdate ? '학생 업데이트 저장' : '학생 저장';
    const btnText   = isUpdate ? '<i class="ti ti-refresh"></i> 업데이트 저장' : '<i class="ti ti-device-floppy"></i> 저장';
    const snap      = Calc.toSnapshot();
    const summary   = _buildSelectionSummary ? _buildSelectionSummary(snap) : '';
    const summaryHtml = summary
      ? `<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:8px 12px;font-size:12px;color:var(--blue-tx);border:1px solid rgba(91,53,196,0.15);"><div style="font-size:11px;color:var(--text-3);margin-bottom:4px;">선택된 프로그램</div>${summary}</div>`
      : '';
    let prefillName = '', prefillSchool = '', prefillGrade = '', prefillGoal = '';
    if (isUpdate) {
      const p = _currentStudentKey.split('_');
      prefillName   = p[0] || '';
      prefillSchool = p[1] || '';
      prefillGoal   = p.slice(2).join('_') || '';
      prefillGrade  = String(Calc.getGrade() || '');
    }

    const gradeOptions = ['', '1', '2', '3', 'mid'].map(v => {
      const label = v === '' ? '선택' : v === 'mid' ? '중학생' : `고${v}`;
      const sel   = prefillGrade === v ? 'selected' : '';
      return `<option value="${v}" ${sel}>${label}</option>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'student-modal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-box" style="width:400px;">
        <div class="modal-header">
          <span><i class="ti ti-user-plus"></i> ${titleText}</span>
          <button class="modal-close" onclick="document.getElementById('student-modal').remove()">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:14px;">
          <div>
            <label class="modal-label">학생명 *</label>
            <input class="admin-input" id="st-name" placeholder="예) 김수진" maxlength="10" value="${prefillName}">
          </div>
          <div>
            <label class="modal-label">학교 *</label>
            <input class="admin-input" id="st-school" placeholder="예) 대건고" maxlength="15" value="${prefillSchool}">
          </div>
          <div>
            <label class="modal-label">학년 *</label>
            <select class="admin-input" id="st-grade">${gradeOptions}</select>
          </div>
          <div>
            <label class="modal-label">진로 목표 *</label>
            <input class="admin-input" id="st-goal" placeholder="예) 경영학" maxlength="20" value="${prefillGoal}">
          </div>
          ${summaryHtml}
          <div id="st-preview" style="font-size:12px;color:var(--text-3);padding:6px 0;">
            저장 키: ${isUpdate ? _currentStudentKey : '—'}
          </div>
        </div>
        <div class="modal-footer">
          <button class="admin-cancel-btn"
            onclick="document.getElementById('student-modal').remove()">취소</button>
          <button class="admin-save-btn" onclick="UI.confirmSaveStudent()">
            ${btnText}
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    if (!isUpdate) {
      ['st-name','st-school','st-grade','st-goal'].forEach(id => {
        document.getElementById(id).addEventListener('input', _updateStudentKeyPreview);
      });
    }

    document.getElementById('st-name').focus();
  }

  function _updateStudentKeyPreview() {
    const name   = document.getElementById('st-name').value.trim();
    const school = document.getElementById('st-school').value.trim();
    const goal   = document.getElementById('st-goal').value.trim();
    const preview = document.getElementById('st-preview');
    if (preview) {
      const key = (name && school && goal)
        ? Store.buildStudentKey(name, school, goal)
        : '—';
      preview.textContent = `저장 키: ${key}`;
    }
  }

  async function confirmSaveStudent() {
    const name     = document.getElementById('st-name')?.value.trim();
    const school   = document.getElementById('st-school')?.value.trim();
    const gradeVal = document.getElementById('st-grade')?.value;
    const goal     = document.getElementById('st-goal')?.value.trim();

    if (!name || !school || !gradeVal || !goal) {
      showToast('모든 항목을 입력해 주세요', 'warn');
      return;
    }

    const gradeNum = gradeVal === 'mid' ? 0 : parseInt(gradeVal) || 0;
    const isUpdate = !!_currentStudentKey;
    const newKey   = Store.buildStudentKey(name, school, goal);
    const snap     = Calc.toSnapshot();
    const meta     = { name, school, goal, grade: gradeNum };

    showToast('저장 중...', 'success');

    if (isUpdate && newKey !== _currentStudentKey) {
      // 키가 바뀐 경우 — 새 키 저장 후 기존 키 삭제
      const ok = await Store.saveStudent(newKey, snap, meta);
      if (!ok) { showToast('저장 실패 — 네트워크 확인', 'error'); return; }
      await Store.deleteStudent(_currentStudentKey);
      _currentStudentKey = newKey;
    } else {
      // 신규 저장 또는 키 동일 업데이트
      const key = isUpdate ? _currentStudentKey : newKey;
      const ok  = await Store.saveStudent(key, snap, meta);
      if (!ok) { showToast('저장 실패 — 네트워크 확인', 'error'); return; }
      if (!isUpdate) _currentStudentKey = null;
    }

    document.getElementById('student-modal')?.remove();
    await renderStudentDropdown();
    showToast(`✓ ${isUpdate ? '업데이트' : '저장'} 완료`, 'success');
  }


  /* ============================================================
   * 10. 학생 드롭다운 렌더링 / 로드 (비동기)
   * ============================================================ */
  async function renderStudentDropdown() {
    // 모달 방식으로 전환 — noop
  }

  async function openStudentSelectModal() {
    const existing = document.getElementById('student-select-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'student-select-modal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-box" style="width:420px;">
        <div class="modal-header">
          <span><i class="ti ti-users"></i> 학생 불러오기</span>
          <button class="modal-close" onclick="document.getElementById('student-select-modal').remove()">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div style="padding:12px 20px 0;">
          <input class="admin-input" id="student-search" placeholder="이름 검색..."
            oninput="UI._filterStudentList(this.value)" style="width:100%;">
        </div>
        <div class="modal-body" style="padding:12px 20px 20px;max-height:360px;overflow-y:auto;">
          <div id="student-modal-list" style="display:flex;flex-direction:column;gap:8px;">
            <div style="color:var(--text-3);font-size:13px;">불러오는 중...</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('student-select-modal').remove()">닫기</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    try {
      const list = await Store.listStudents();
      _studentListCache = list || [];
      const listEl = document.getElementById('student-modal-list');
      if (!listEl) return;
      if (_studentListCache.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-3);font-size:13px;">저장된 학생이 없습니다.</div>';
        return;
      }
      _renderStudentItems(_studentListCache);
      document.getElementById('student-search')?.focus();
    } catch (e) {
      const listEl = document.getElementById('student-modal-list');
      if (listEl) listEl.innerHTML = '<div style="color:var(--text-3);font-size:13px;">목록 로드 실패</div>';
      showToast('학생 목록 로드 실패 — 네트워크 확인', 'error');
    }
  }

  let _studentListCache = [];

  function _renderStudentItems(list) {
    const listEl = document.getElementById('student-modal-list');
    if (!listEl) return;
    if (!list || list.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-3);font-size:13px;">검색 결과가 없습니다.</div>';
      return;
    }
    listEl.innerHTML = list.map((s, i) => {
      const date      = Store.formatDate(s.savedAt).split(' ')[0];
      const gradeNum  = s.meta?.grade;
      const gradeStr  = gradeNum === 0 ? '중학생' : gradeNum ? `고${gradeNum}` : '';
      return `<div onclick="UI.loadStudentByKey('${s.key}')"
        style="display:flex;align-items:center;gap:10px;
        padding:8px 14px;border-bottom:1px solid var(--border);cursor:pointer;"
        onmouseover="this.style.background='var(--surface2)'"
        onmouseout="this.style.background=''">
        <span style="flex-shrink:0;width:22px;height:22px;border-radius:50%;
          background:var(--surface2);border:1px solid var(--border);
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:700;color:var(--text-3);">${i + 1}</span>
        <span style="flex:1;font-size:13px;font-weight:600;color:var(--text-1);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.key}</span>
        ${gradeStr ? `<span style="font-size:11px;font-weight:600;color:var(--blue-tx);background:var(--blue-bg);border-radius:4px;padding:1px 7px;flex-shrink:0;">${gradeStr}</span>` : ''}
        <span style="font-size:12px;color:var(--text-3);flex-shrink:0;">${date}</span>
        <button onclick="event.stopPropagation();UI._editStudentFromModal('${s.key}')"
          style="flex-shrink:0;background:none;border:none;cursor:pointer;padding:2px 4px;color:var(--text-3);"
          title="수정" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-3)'">
          <i class="ti ti-pencil" style="font-size:14px;"></i>
        </button>
        <button onclick="event.stopPropagation();UI._deleteStudentFromModal('${s.key}')"
          style="flex-shrink:0;background:none;border:none;cursor:pointer;padding:2px 4px;color:var(--text-3);"
          title="삭제" onmouseover="this.style.color='var(--red-tx)'" onmouseout="this.style.color='var(--text-3)'">
          <i class="ti ti-trash" style="font-size:14px;"></i>
        </button>
      </div>`;
    }).join('');
  }

  function _filterStudentList(query) {
    const q = query.trim().toLowerCase();
    const filtered = q ? _studentListCache.filter(s => s.key.toLowerCase().includes(q)) : _studentListCache;
    _renderStudentItems(filtered);
  }

  async function _editStudentFromModal(key) {
    // 해당 학생 데이터 로드 후 수정 모달 열기
    const data = await Store.loadStudent(key);
    if (!data) { showToast('학생 데이터를 찾을 수 없습니다', 'error'); return; }

    const existing = document.getElementById('student-edit-modal');
    if (existing) existing.remove();

    const meta = data.meta || {};
    const gradeVal = meta.grade === 0 ? 'mid' : meta.grade ? String(meta.grade) : '';
    const gradeOptions = ['', '1', '2', '3', 'mid'].map(v => {
      const label = v === '' ? '선택' : v === 'mid' ? '중학생' : `고${v}`;
      const sel   = gradeVal === v ? 'selected' : '';
      return `<option value="${v}" ${sel}>${label}</option>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'student-edit-modal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-box" style="width:400px;">
        <div class="modal-header">
          <span><i class="ti ti-pencil"></i> 학생 정보 수정</span>
          <button class="modal-close" onclick="document.getElementById('student-edit-modal').remove()">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:14px;">
          <div style="font-size:12px;color:var(--text-3);padding:4px 0;">
            현재 키: <strong>${key}</strong>
          </div>
          <div>
            <label class="modal-label">학생명 *</label>
            <input class="admin-input" id="ed-name" placeholder="예) 김수진" maxlength="10" value="${meta.name || ''}">
          </div>
          <div>
            <label class="modal-label">학교 *</label>
            <input class="admin-input" id="ed-school" placeholder="예) 대건고" maxlength="15" value="${meta.school || ''}">
          </div>
          <div>
            <label class="modal-label">학년 *</label>
            <select class="admin-input" id="ed-grade">${gradeOptions}</select>
          </div>
          <div>
            <label class="modal-label">진로 목표 *</label>
            <input class="admin-input" id="ed-goal" placeholder="예) 경영학" maxlength="20" value="${meta.goal || ''}">
          </div>
        </div>
        <div class="modal-footer">
          <button class="admin-cancel-btn"
            onclick="document.getElementById('student-edit-modal').remove()">취소</button>
          <button class="admin-save-btn" onclick="UI._confirmEditStudent('${key}')">
            <i class="ti ti-device-floppy"></i> 저장
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('ed-name').focus();
  }

  async function _confirmEditStudent(oldKey) {
    const name     = document.getElementById('ed-name')?.value.trim();
    const school   = document.getElementById('ed-school')?.value.trim();
    const gradeVal = document.getElementById('ed-grade')?.value;
    const goal     = document.getElementById('ed-goal')?.value.trim();

    if (!name || !school || !gradeVal || !goal) {
      showToast('모든 항목을 입력해 주세요', 'warn');
      return;
    }

    const gradeNum = gradeVal === 'mid' ? 0 : parseInt(gradeVal) || 0;
    const newKey   = Store.buildStudentKey(name, school, goal);
    const meta     = { name, school, goal, grade: gradeNum };

    // 기존 데이터 로드 (selections 유지)
    const data = await Store.loadStudent(oldKey);
    if (!data) { showToast('데이터를 찾을 수 없습니다', 'error'); return; }

    showToast('수정 중...', 'success');

    // 키가 바뀐 경우: 새 키로 저장 후 기존 키 삭제
    if (newKey !== oldKey) {
      const ok = await Store.saveStudent(newKey, data.selections, meta);
      if (!ok) { showToast('저장 실패 — 네트워크 확인', 'error'); return; }
      await Store.deleteStudent(oldKey);
      if (_currentStudentKey === oldKey) _currentStudentKey = newKey;
    } else {
      // 키 동일 (학년만 변경 등): 덮어쓰기
      const ok = await Store.saveStudent(oldKey, data.selections, meta);
      if (!ok) { showToast('저장 실패 — 네트워크 확인', 'error'); return; }
    }

    document.getElementById('student-edit-modal')?.remove();
    // 목록 갱신
    _studentListCache = await Store.listStudents();
    _renderStudentItems(_studentListCache);
    showToast(`✓ 수정 완료`, 'success');
  }

  async function _deleteStudentFromModal(key) {
    if (!confirm(`"${key}" 데이터를 삭제할까요?`)) return;
    showToast('삭제 중...', 'success');
    const ok = await Store.deleteStudent(key);
    if (ok) {
      _studentListCache = _studentListCache.filter(s => s.key !== key);
      if (_currentStudentKey === key) {
        _currentStudentKey = null;
        const tbTitle = document.getElementById('tb-title');
        if (tbTitle) { tbTitle.textContent = '학생을 선택하세요.'; tbTitle.style.color = 'var(--text-3)'; }
      }
      _renderStudentItems(_studentListCache);
      showToast(`✓ ${key} 삭제 완료`, 'success');
    } else {
      showToast('삭제 실패 — 네트워크 확인', 'error');
    }
  }

  async function loadStudentByKey(key) {
    document.getElementById('student-select-modal')?.remove();
    showToast('불러오는 중...', 'success');
    const data = await Store.loadStudent(key);
    if (!data) { showToast('학생 데이터를 찾을 수 없습니다', 'error'); return; }
    Calc.reset();
    Calc.fromSnapshot(data.selections);
    renderPages();                              // DOM 먼저 생성
    _syncGradeButtons(Calc.state.grade);        // aoc-section show/hide
    _syncOvCards(Calc.state);                   // ov 카드 체크 복원 (세특·수행 등)
    _syncCheckboxes(Calc.state);               // aoc 체크박스 복원 (수시·면접·정시 등)
    _updateOvCardPrices(Calc.state.grade);
    _updateDcButtons();
    _updateTotalBoxes(Calc.getAllTotalsDc());
    go(_currentPageId);
    _currentStudentKey = key;
    const labelEl = document.getElementById('student-select-label');
    if (labelEl) labelEl.textContent = data.meta?.name || key;
    const tbTitle = document.getElementById('tb-title');
    if (tbTitle && data.meta) {
      const gradeStr = data.meta.grade === 0 ? '중학생' : data.meta.grade ? `고${data.meta.grade}` : '';
      tbTitle.textContent = [data.meta.name, data.meta.school, gradeStr, data.meta.goal]
        .filter(Boolean).join(' · ');
      tbTitle.style.color = 'var(--text-1)';
    }
    showToast(`✓ ${key} 불러오기 완료`, 'success');
  }

  async function loadSelectedStudent() {
    // 모달 방식으로 전환 — 하위 호환 유지
  }

  function newSession() {
    const sel = document.getElementById('student-select');
    if (sel) sel.value = '';
    const tbTitle = document.getElementById('tb-title');
    if (tbTitle) { tbTitle.textContent = '학생을 선택하세요.'; tbTitle.style.color = 'var(--text-3)'; }
    const labelEl = document.getElementById('student-select-label');
    if (labelEl) labelEl.textContent = '학생 선택';
    _currentStudentKey = null;
    Calc.reset();
    renderPages();
    go('rm-overview');
    showToast('새 상담을 시작합니다', 'success');
  }


  /* ============================================================
   * 11. 패키지 DC (기본 틀 — 추후 실계산 로직 추가)
   * ============================================================ */
  function applyPackage(num) {
    const group = num === 1 ? 'roadmap' : 'individual';
    const config = cfg();
    const rate = (config.discount || {})[group] || 0;

    // 개별 DC — 모든 항목 할인율이 0이면 동작 안함
    if (group === 'individual') {
      const indDisc = (config.discount || {}).individual || {};
      const hasRate = typeof indDisc === 'object'
        ? Object.values(indDisc).some(v => v > 0)
        : indDisc > 0;
      if (!hasRate) {
        showToast('개별 DC 할인율이 설정되지 않았습니다', 'warn');
        return;
      }
    }

    const isOn = Calc.toggleDc(group);
    _updateDcButtons();
    _updateTotalBoxes(Calc.getAllTotalsDc());

    const label = group === 'roadmap' ? '로드맵' : '개별';
    if (isOn) {
      showToast(`${label} DC 할인이 적용되었습니다`, 'success');
    } else {
      showToast(`${label} DC 할인이 해제되었습니다`, 'warn');
    }
  }

  // DC 버튼 텍스트 + 활성 상태 업데이트
  function _updateDcButtons() {
    const config = cfg();
    const disc   = config.discount || {};

    const btn1 = document.querySelector('.pkg-btn-1');
    const btn2 = document.querySelector('.pkg-btn-2');

    if (btn1) {
      const rate = disc.roadmap || 0;
      const isOn = Calc.isDcActive('roadmap');
      btn1.textContent = `로드맵 DC (${rate}%)`;
      btn1.classList.toggle('pkg-btn-active', isOn);
    }
    if (btn2) {
      const indDisc = disc.individual || {};
      const hasRate = typeof indDisc === 'object'
        ? Object.values(indDisc).some(v => v > 0)
        : indDisc > 0;
      if (!hasRate) {
        btn2.style.display = 'none';
      } else {
        btn2.style.display = '';
        const isOn = Calc.isDcActive('individual');
        btn2.textContent = `개별 DC`;
        btn2.classList.toggle('pkg-btn-active', isOn);
      }
    }
  }


  /* ============================================================
   * 12. 페이지 인라인 편집
   * ============================================================ */

  function openOvCardEdit(pageId) {
    if (_isAdminMode()) {
      _openOvCardModal(pageId);
    } else {
      _showPinModal(() => {
        localStorage.setItem('mk_admin_auth', '1');
        _refreshEditButtons();
        _openOvCardModal(pageId);
      });
    }
  }

  function _openOvCardModal(pageId) {
    const config = MK_CONFIG.resolve();
    const page   = config.pages[pageId];
    if (!page) return;

    const existing = document.getElementById('ovcard-edit-modal');
    if (existing) existing.remove();

    _editDraft = JSON.parse(JSON.stringify(config));
    window.mkEditDraft = _editDraft;

    const ov = window.mkEditDraft.pages[pageId]?.ovCard || {};
    const treeRows = _buildOvTreeRows(pageId);

    const modal = document.createElement('div');
    modal.id = 'ovcard-edit-modal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-box" style="width:700px;max-height:90vh;">
        <div class="modal-header">
          <span><i class="ti ti-layout-grid"></i> ${page.sbLabel} 카드 편집</span>
          <button class="modal-close" onclick="document.getElementById('ovcard-edit-modal').remove()">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;">

          <div style="display:flex;gap:12px;">
            <div style="flex:2;">
              <div class="d-col-label" style="margin-bottom:6px;">프로그램명 (사이드바)</div>
              <input class="admin-input" style="width:100%;" value="${page.sbLabel || ''}"
                oninput="window.mkEditDraft.pages['${pageId}'].sbLabel=this.value"
                placeholder="사이드바 메뉴명">
            </div>
            <div style="flex:1;">
              <div class="d-col-label" style="margin-bottom:6px;">뱃지</div>
              <input class="admin-input" style="width:100%;" value="${ov.badge || ''}"
                oninput="window.mkEditDraft.pages['${pageId}'].ovCard.badge=this.value"
                placeholder="예: 프로그램 A">
            </div>
          </div>

          <div>
            <div class="d-col-label" style="margin-bottom:6px;">🟢 프로그램 설명</div>
            ${_richToolbar('ov-desc-' + pageId)}
            <div id="ov-desc-${pageId}" class="admin-input rich-editor"
              contenteditable="true"
              style="border-radius:0 0 var(--radius-sm) var(--radius-sm);min-height:80px;padding:8px;"
              oninput="window.mkEditDraft.pages['${pageId}'].ovCard.desc=this.innerHTML"
            >${ov.desc || ''}</div>
          </div>

          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div class="d-col-label">🩷 구성 요약 트리</div>
              <div style="display:flex;align-items:center;gap:8px;">
                <select class="rich-select" title="트리 전체 글자 크기"
                  onchange="UI._setTreeFontSize('${pageId}',this.value)">
                  <option value="">글자 크기</option>
                  <option value="0">기본</option>
                  <option value="8">8pt</option>
                  <option value="9">9pt</option>
                  <option value="10">10pt</option>
                  <option value="11">11pt</option>
                  <option value="12">12pt</option>
                  <option value="13">13pt</option>
                  <option value="14">14pt</option>
                  <option value="16">16pt</option>
                  <option value="18">18pt</option>
                </select>
                <button type="button" class="btn btn-sm btn-primary" onclick="UI._addOvTree('${pageId}')">
                  <i class="ti ti-plus"></i> 항목 추가
                </button>
              </div>
            </div>
            <div id="ovtree-rows-${pageId}">${treeRows}</div>
          </div>

        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('ovcard-edit-modal').remove()">취소</button>
          <button class="btn btn-primary" onclick="UI._saveOvCardEdit('${pageId}')">
            <i class="ti ti-device-floppy"></i> 저장 및 반영
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  function _buildOvTreeRows(pageId) {
    const ov = window.mkEditDraft.pages[pageId]?.ovCard || {};
    return (ov.tree || []).map((t, idx) => `
      <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
        <input class="admin-input" style="flex:1;" value="${(t.label || '').replace(/"/g,'&quot;')}"
          oninput="window.mkEditDraft.pages['${pageId}'].ovCard.tree[${idx}].label=this.value"
          placeholder="트리 제목">
        <input class="admin-input" style="flex:1;" value="${(t.sub || '').replace(/"/g,'&quot;')}"
          oninput="window.mkEditDraft.pages['${pageId}'].ovCard.tree[${idx}].sub=this.value"
          placeholder="트리 부제">
        <button type="button" class="btn btn-sm" style="color:var(--red-tx);flex-shrink:0;"
          onclick="UI._removeOvTree('${pageId}',${idx})"><i class="ti ti-trash"></i></button>
      </div>`).join('');
  }

  function _refreshOvTreeRows(pageId) {
    const el = document.getElementById(`ovtree-rows-${pageId}`);
    if (el) el.innerHTML = _buildOvTreeRows(pageId);
  }

  function _addOvTree(pageId) {
    if (!window.mkEditDraft.pages[pageId].ovCard) window.mkEditDraft.pages[pageId].ovCard = {};
    if (!window.mkEditDraft.pages[pageId].ovCard.tree) window.mkEditDraft.pages[pageId].ovCard.tree = [];
    window.mkEditDraft.pages[pageId].ovCard.tree.push({ label: '', sub: '' });
    _refreshOvTreeRows(pageId);
  }

  function _removeOvTree(pageId, idx) {
    window.mkEditDraft.pages[pageId].ovCard.tree.splice(idx, 1);
    _refreshOvTreeRows(pageId);
  }

  // 트리 전체 공용 글자 크기 설정 — draft에 treeFontSize 저장
  function _setTreeFontSize(pageId, val) {
    if (!window.mkEditDraft.pages[pageId].ovCard) return;
    // val === '0' or '' → 기본(CSS) 복원, 그 외 pt 숫자 문자열
    window.mkEditDraft.pages[pageId].ovCard.treeFontSize = (val === '0' || val === '') ? '' : val;
  }

  function _saveOvCardEdit(pageId) {
    _editDraft = window.mkEditDraft;
    // tree label/sub: 이전 버전에서 innerHTML로 저장된 HTML 태그 strip
    const tree = _editDraft.pages?.[pageId]?.ovCard?.tree;
    if (Array.isArray(tree)) {
      const _strip = str => {
        const d = document.createElement('div');
        d.innerHTML = str || '';
        return d.innerText;
      };
      tree.forEach(t => {
        t.label = _strip(t.label);
        t.sub   = _strip(t.sub);
      });
    }
    Store.saveConfig(_editDraft);
    document.getElementById('ovcard-edit-modal')?.remove();
    // localStorage 갱신 후 즉시 렌더 (타이밍 보장)
    setTimeout(() => {
      renderPages();
      go(_currentPageId);
    }, 0);
    showToast('✓ 카드가 저장되었습니다', 'success');
  }

  function openPageEdit(pageId) {
    if (_isAdminMode()) {
      _openEditModal(pageId);
    } else {
      _showPinModal(() => {
        localStorage.setItem('mk_admin_auth', '1');
        _refreshEditButtons();
        _openEditModal(pageId);
      });
    }
  }

  function _showPinModal(callback) {
    const existing = document.getElementById('edit-pin-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'edit-pin-modal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-box" style="width:320px;">
        <div class="modal-header">
          <span><i class="ti ti-shield-lock"></i> 관리자 PIN 확인</span>
          <button class="modal-close" onclick="document.getElementById('edit-pin-modal').remove()">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;align-items:center;gap:14px;">
          <input class="admin-input" id="edit-pin-input" type="password" maxlength="6"
            style="text-align:center;font-size:22px;letter-spacing:.3em;width:160px;"
            placeholder="••••">
          <div id="edit-pin-err" style="font-size:12px;color:var(--red-tx);min-height:16px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('edit-pin-modal').remove()">취소</button>
          <button class="btn btn-primary" id="edit-pin-confirm">확인</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const input   = document.getElementById('edit-pin-input');
    const confirm = document.getElementById('edit-pin-confirm');
    const err     = document.getElementById('edit-pin-err');

    const submit = () => {
      if (Store.verifyPin(input.value)) {
        modal.remove();
        callback();
      } else {
        err.textContent = 'PIN이 올바르지 않습니다.';
        input.value = '';
        input.focus();
      }
    };

    confirm.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    input.focus();
  }

  // 툴바형 서식 편집기 HTML 생성
  function _richToolbar(targetId) {
    const specialChars = [
      { group: '도형', chars: ['●','○','■','□','◆','◇','▶','▷','▼','▽','▲','△','◀','◁','▣','▢','◈','◉','◎','◌'] },
      { group: '기호', chars: ['※','★','☆','✓','✔','✦','✧','✪','✿','❖','•','·'] },
      { group: '화살표', chars: ['→','←','↑','↓','⇒','｜','┃','❘','❙','❚'] },
      { group: '괄호', chars: ['〈','〉','【','】','《','》','『','』','「','」','〔','〕','〖','〗'] },
      { group: '원문자', chars: ['❶','❷','❸','❹','❺','❻','❼','❽','❾','❿'] },
    ];
    const popupId = 'sc-popup-' + targetId;
    const groupsHtml = specialChars.map(g => `
      <div style="margin-bottom:8px;">
        <div style="font-size:10px;color:var(--text-3);margin-bottom:4px;font-weight:600;">${g.group}</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;">
          ${g.chars.map(c => `<button type="button" class="rich-btn" style="min-width:24px;height:24px;font-size:14px;"
            onclick="UI._insertText('${c}','${targetId}')">${c}</button>`).join('')}
        </div>
      </div>`).join('');

    return `
      <div class="rich-toolbar" style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px;background:var(--surface2);border:1px solid var(--border);border-bottom:none;border-radius:var(--radius-sm) var(--radius-sm) 0 0;position:relative;">
        <button type="button" class="rich-btn" title="굵게" onclick="UI._richCmd('bold','${targetId}')"><b>B</b></button>
        <button type="button" class="rich-btn" title="기울임" onclick="UI._richCmd('italic','${targetId}')"><i>I</i></button>
        <button type="button" class="rich-btn" title="밑줄" onclick="UI._richCmd('underline','${targetId}')"><u>U</u></button>
        <span class="rich-sep">|</span>
        <select class="rich-select" title="글자 크기"
          onmousedown="UI._saveSelection()"
          onchange="UI._richCmd('fontSize',this.value,'${targetId}');this.value=''">
          <option value="">크기</option>
          <option value="0">기본</option>
          <option value="8">8pt</option>
          <option value="9">9pt</option>
          <option value="10">10pt</option>
          <option value="11">11pt</option>
          <option value="12">12pt</option>
          <option value="13">13pt</option>
          <option value="14">14pt</option>
          <option value="16">16pt</option>
          <option value="18">18pt</option>
        </select>
        <span class="rich-sep">|</span>
        ${[
          ['#000000','⚫','기본'],
          ['#e03131','🔴','빨강'],
          ['#e8590c','🟠','주황'],
          ['#f08c00','🟡','노랑'],
          ['#2f9e44','🟢','초록'],
          ['#1971c2','🔵','파랑'],
          ['#7048e8','🟣','보라'],
          ['#c2255c','🩷','분홍'],
          ['#868e96','⚪','회색'],
          ['#ffffff','◻','흰색'],
        ].map(([color, icon, label]) =>
          `<button type="button" class="rich-btn rich-color-btn"
            title="${label}"
            style="background:${color};border-color:${color};min-width:22px;height:22px;border-radius:50%;padding:0;"
            onclick="UI._richCmd('foreColor','${color}','${targetId}')"></button>`
        ).join('')}
        <span class="rich-sep">|</span>
        <div style="position:relative;display:inline-block;">
          <button type="button" class="rich-btn" title="특수문자"
            onclick="UI._toggleScPopup('${popupId}')">특수문자 ▾</button>
          <div id="${popupId}" style="display:none;position:absolute;top:30px;left:0;z-index:9999;
            background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-md);
            padding:10px;box-shadow:0 8px 24px rgba(0,0,0,0.15);min-width:280px;">
            ${groupsHtml}
          </div>
        </div>
      </div>`;
  }

  function _toggleScPopup(popupId) {
    const el = document.getElementById(popupId);
    if (!el) return;
    const isOpen = el.style.display !== 'none';
    // 다른 팝업 모두 닫기
    document.querySelectorAll('[id^="sc-popup-"]').forEach(p => p.style.display = 'none');
    el.style.display = isOpen ? 'none' : 'block';
  }

  // contenteditable 명령 실행
  function _richCmd(cmd, val, targetId) {
    if (typeof val === 'string' && val.startsWith('#')) {
      // 색상 명령
      document.getElementById(targetId)?.focus();
      document.execCommand('foreColor', false, val);
    } else if (cmd === 'fontSize') {
      const el = document.getElementById(targetId);
      if (!el) return;
      // select 클릭으로 포커스 잃었으므로 저장된 selection 복원 후 적용
      el.focus();
      _restoreSelection();
      if (val === '0' || val === '') {
        _unwrapFontSize(el);
      } else {
        _applyFontSize(el, val + 'pt');
      }
    } else {
      document.getElementById(targetId)?.focus();
      document.execCommand(cmd, false, null);
    }
  }

  // selection 저장 — select onmousedown 에서 호출 (포커스 이탈 직전)
  let _savedRange = null;
  function _saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      _savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  // selection 복원 — _richCmd fontSize 분기에서 호출
  function _restoreSelection() {
    if (!_savedRange) return;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(_savedRange);
    }
  }

  // 선택 범위를 <span style="font-size:Npt">로 래핑
  function _applyFontSize(el, ptVal) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    const span = document.createElement('span');
    span.style.fontSize = ptVal;
    try {
      range.surroundContents(span);
    } catch (e) {
      // surroundContents 실패(부분 태그 교차) → extractContents 후 삽입
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    // 커서를 span 뒤로 이동
    const newRange = document.createRange();
    newRange.setStartAfter(span);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    _savedRange = null;
    // oninput 트리거로 draft 동기화
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // font-size 인라인 스타일 span을 자식 노드로 교체(unwrap) — CSS 기본값 복원
  function _unwrapFontSize(el) {
    if (!el) return;
    // font-size style을 가진 span 전체 대상 (역순으로 중첩 안전 처리)
    Array.from(el.querySelectorAll('span[style*="font-size"]')).reverse().forEach(s => {
      // font-size 외 다른 인라인 스타일이 있으면 font-size만 제거
      s.style.fontSize = '';
      // 스타일이 완전히 비었으면 span 태그 자체를 unwrap
      if (!s.getAttribute('style') || s.getAttribute('style').trim() === '') {
        const parent = s.parentNode;
        if (!parent) return;
        while (s.firstChild) parent.insertBefore(s.firstChild, s);
        parent.removeChild(s);
      }
    });
    // 기존 <font size> 태그도 혹시 남아있으면 함께 정리
    Array.from(el.querySelectorAll('font[size]')).reverse().forEach(f => {
      const parent = f.parentNode;
      if (!parent) return;
      while (f.firstChild) parent.insertBefore(f.firstChild, f);
      parent.removeChild(f);
    });
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 특수문자 삽입
  function _insertText(char, targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.focus();
    document.execCommand('insertText', false, char);
  }

  function _openEditModal(pageId) {
    const config = MK_CONFIG.resolve();
    if (!config.pages[pageId]) return;

    // draft 보존 처리 후 page는 mkEditDraft에서 참조
    const page = window.mkEditDraft ? window.mkEditDraft.pages[pageId] : config.pages[pageId];
    if (!page) return;

    const existing = document.getElementById('page-edit-modal');
    if (existing) existing.remove();

    // 최초 열기 시 draft 초기화
    _editDraft = JSON.parse(JSON.stringify(config));
    window.mkEditDraft = _editDraft;

    // rows는 독립 함수로 생성 (항목 추가/삭제 시 DOM 부분 업데이트에도 재사용)
    const programRows = _buildProgramRows(pageId);
    const condRows    = _buildCondRows(pageId);
    const noteRows    = _buildNoteRows(pageId);

    const modal = document.createElement('div');
    modal.id = 'page-edit-modal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-box" style="width:860px;max-height:90vh;">
        <div class="modal-header">
          <span><i class="ti ti-pencil"></i> ${page.title} 편집</span>
          <button class="modal-close" onclick="document.getElementById('page-edit-modal').remove()">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:20px;overflow-y:auto;">

          <div style="display:flex;gap:12px;">
            <div style="flex:1;">
              <div class="d-col-label" style="margin-bottom:6px;">페이지 제목</div>
              <input class="admin-input" style="width:100%;" value="${page.title || ''}"
                oninput="window.mkEditDraft.pages['${pageId}'].title=this.value"
                placeholder="페이지 제목">
            </div>
            <div style="flex:2;">
              <div class="d-col-label" style="margin-bottom:6px;">부제목</div>
              <input class="admin-input" style="width:100%;" value="${page.subtitle || ''}"
                oninput="window.mkEditDraft.pages['${pageId}'].subtitle=this.value"
                placeholder="페이지 부제목">
            </div>
          </div>

          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div class="d-col-label">프로그램 구성</div>
              <button type="button" class="btn btn-sm btn-primary" onclick="UI._addProgram('${pageId}')">
                <i class="ti ti-plus"></i> 항목 추가
              </button>
            </div>
            <div id="prog-rows-${pageId}">${programRows}</div>
          </div>

          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div class="d-col-label">제공 조건</div>
              <button type="button" class="btn btn-sm btn-primary" onclick="UI._addCond('${pageId}')">
                <i class="ti ti-plus"></i> 항목 추가
              </button>
            </div>
            <div id="cond-rows-${pageId}">${condRows}</div>
          </div>

          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div class="d-col-label">참고 노트</div>
              <button type="button" class="btn btn-sm btn-primary" onclick="UI._addNote('${pageId}')">
                <i class="ti ti-plus"></i> 항목 추가
              </button>
            </div>
            <div id="note-rows-${pageId}">${noteRows}</div>
          </div>

        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('page-edit-modal').remove()">취소</button>
          <button class="btn btn-primary" onclick="UI._savePageEdit('${pageId}')">
            <i class="ti ti-device-floppy"></i> 저장 및 반영
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);
  }

  /* ============================================================
   * rows 생성 독립 함수 — draft 기반, 모달/DOM 부분 업데이트 공용
   * ============================================================ */
  function _buildProgramRows(pageId) {
    return (window.mkEditDraft.pages[pageId].programs || []).map((p, idx) => {
      const tid = `prog-items-${pageId}-${idx}`;
      return `
      <div class="edit-program-row" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px;">
        <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
          <div class="p-num" style="flex-shrink:0;width:28px;text-align:center;font-weight:700;color:var(--accent);">${idx+1}</div>
          <input class="admin-input" style="flex:1;" value="${p.title || ''}"
            oninput="window.mkEditDraft.pages['${pageId}'].programs[${idx}].title=this.value"
            placeholder="제목">
          <button type="button" class="btn btn-sm" style="color:var(--red-tx);flex-shrink:0;"
            onclick="UI._removeProgram('${pageId}',${idx})"><i class="ti ti-trash"></i></button>
        </div>
        ${_richToolbar(tid)}
        <div id="${tid}" class="admin-input rich-editor"
          contenteditable="true"
          style="border-radius:0 0 var(--radius-sm) var(--radius-sm);min-height:60px;padding:8px;"
          oninput="window.mkEditDraft.pages['${pageId}'].programs[${idx}].items=Array.from(this.querySelectorAll('div,p')).map(e=>e.innerHTML.trim()).filter(Boolean).length?Array.from(this.querySelectorAll('div,p')).map(e=>e.innerHTML.trim()).filter(Boolean):[this.innerHTML.trim()]"
        >${(p.items || []).map(i => `<div>${i}</div>`).join('')}</div>
      </div>`;
    }).join('');
  }

  function _buildCondRows(pageId) {
    return (window.mkEditDraft.pages[pageId].conditions || []).map((c, idx) => {
      const tid = `cond-text-${pageId}-${idx}`;
      return `
      <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px;">
        <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
          <input class="admin-input" style="flex:1;" value="${c.title || ''}"
            oninput="window.mkEditDraft.pages['${pageId}'].conditions[${idx}].title=this.value"
            placeholder="조건 제목">
          <button type="button" class="btn btn-sm" style="color:var(--red-tx);flex-shrink:0;"
            onclick="UI._removeCond('${pageId}',${idx})"><i class="ti ti-trash"></i></button>
        </div>
        ${_richToolbar(tid)}
        <div id="${tid}" class="admin-input rich-editor"
          contenteditable="true"
          style="border-radius:0 0 var(--radius-sm) var(--radius-sm);min-height:50px;padding:8px;"
          oninput="window.mkEditDraft.pages['${pageId}'].conditions[${idx}].text=this.innerText"
        >${(c.text || '').replace(/\n/g,'<br>')}</div>
      </div>`;
    }).join('');
  }

  function _buildNoteRows(pageId) {
    return (window.mkEditDraft.pages[pageId].notes || []).map((n, idx) => `
      <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
        <select class="admin-input" style="width:90px;flex-shrink:0;"
          onchange="window.mkEditDraft.pages['${pageId}'].notes[${idx}].color=this.value">
          ${['blue','amber','red','green'].map(c =>
            `<option value="${c}" ${n.color===c?'selected':''}>${c}</option>`).join('')}
        </select>
        <input class="admin-input" style="flex:1;" value="${n.text || ''}"
          oninput="window.mkEditDraft.pages['${pageId}'].notes[${idx}].text=this.value"
          placeholder="노트 내용">
        <button type="button" class="btn btn-sm" style="color:var(--red-tx);flex-shrink:0;"
          onclick="UI._removeNote('${pageId}',${idx})"><i class="ti ti-trash"></i></button>
      </div>`).join('');
  }

  // DOM 부분 업데이트 헬퍼
  function _refreshRows(pageId) {
    const pr = document.getElementById(`prog-rows-${pageId}`);
    const cr = document.getElementById(`cond-rows-${pageId}`);
    const nr = document.getElementById(`note-rows-${pageId}`);
    if (pr) pr.innerHTML = _buildProgramRows(pageId);
    if (cr) cr.innerHTML = _buildCondRows(pageId);
    if (nr) nr.innerHTML = _buildNoteRows(pageId);
  }

  // 프로그램 항목 추가/삭제
  function _addProgram(pageId) {
    if (!window.mkEditDraft.pages[pageId].programs) window.mkEditDraft.pages[pageId].programs = [];
    window.mkEditDraft.pages[pageId].programs.push({ num: '', title: '새 항목', items: [] });
    _refreshRows(pageId);
  }
  function _removeProgram(pageId, idx) {
    window.mkEditDraft.pages[pageId].programs.splice(idx, 1);
    _refreshRows(pageId);
  }

  // 조건 항목 추가/삭제
  function _addCond(pageId) {
    if (!window.mkEditDraft.pages[pageId].conditions) window.mkEditDraft.pages[pageId].conditions = [];
    window.mkEditDraft.pages[pageId].conditions.push({ title: '새 조건', type: 'text', text: '' });
    _refreshRows(pageId);
  }
  function _removeCond(pageId, idx) {
    window.mkEditDraft.pages[pageId].conditions.splice(idx, 1);
    _refreshRows(pageId);
  }

  // 노트 추가/삭제
  function _addNote(pageId) {
    if (!window.mkEditDraft.pages[pageId].notes) window.mkEditDraft.pages[pageId].notes = [];
    window.mkEditDraft.pages[pageId].notes.push({ color: 'blue', icon: 'ti-info-circle', text: '' });
    _refreshRows(pageId);
  }
  function _removeNote(pageId, idx) {
    window.mkEditDraft.pages[pageId].notes.splice(idx, 1);
    _refreshRows(pageId);
  }

  const _NOTICE_ICONS = [
    { cls: 'ti-alert-triangle', label: '⚠ 경고'    },
    { cls: 'ti-info-circle',    label: 'ℹ 정보'     },
    { cls: 'ti-bell',           label: '🔔 알림'    },
    { cls: 'ti-star',           label: '★ 별'      },
    { cls: 'ti-check',          label: '✔ 확인'    },
    { cls: 'ti-clock',          label: '⏰ 시간'    },
    { cls: 'ti-flag',           label: '🚩 플래그'  },
    { cls: 'ti-bulb',           label: '💡 아이디어' },
    { cls: 'ti-pin',            label: '📌 핀'      },
    { cls: 'ti-message',        label: '💬 메시지'  },
  ];

  // idx >= 0: 편집 / idx === -1: 추가
  function openNoticeEdit(idx) {
    const config = MK_CONFIG.resolve();
    const existing = document.getElementById('notice-edit-modal');
    if (existing) existing.remove();

    _editDraft = JSON.parse(JSON.stringify(config));
    _ensureNoticesArray(_editDraft);
    window.mkEditDraft = _editDraft;

    const isNew   = (idx === -1);
    const current = isNew
      ? { text: '', icon: 'ti-alert-triangle', color: 'orange' }
      : (_editDraft.overviewNotices[idx] || { text: '', icon: 'ti-alert-triangle', color: 'orange' });
    const title = isNew ? '공지 추가' : '공지 편집';

    const colorOpts = ['orange','blue','red','green'].map(c =>
      `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="radio" name="notice-color" value="${c}" ${current.color===c?'checked':''}>
        <span class="global-notice n-${c}" style="padding:3px 10px;margin:0;font-size:12px;border-radius:4px;">${c}</span>
      </label>`
    ).join('');

    const iconOpts = _NOTICE_ICONS.map(ic =>
      `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);">
        <input type="radio" name="notice-icon" value="${ic.cls}" ${current.icon===ic.cls?'checked':''}>
        <i class="ti ${ic.cls}" style="font-size:15px;"></i>
        <span style="font-size:12px;">${ic.label}</span>
      </label>`
    ).join('');

    const modal = document.createElement('div');
    modal.id = 'notice-edit-modal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-box" style="width:620px;">
        <div class="modal-header">
          <span><i class="ti ti-bell"></i> ${title}</span>
          <button class="modal-close" onclick="document.getElementById('notice-edit-modal').remove()">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:16px;">
          <div>
            <div class="d-col-label" style="margin-bottom:8px;">공지 내용</div>
            <textarea class="admin-input" id="notice-edit-textarea" rows="3"
              style="width:100%;resize:vertical;"
              placeholder="공지 배너 내용">${current.text}</textarea>
          </div>
          <div>
            <div class="d-col-label" style="margin-bottom:8px;">색상</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">${colorOpts}</div>
          </div>
          <div>
            <div class="d-col-label" style="margin-bottom:8px;">아이콘</div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">${iconOpts}</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('notice-edit-modal').remove()">취소</button>
          <button class="btn btn-primary" onclick="UI._saveNoticeEdit(${idx})">
            <i class="ti ti-device-floppy"></i> 저장 및 반영
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  function _saveNoticeEdit(idx) {
    const text  = document.getElementById('notice-edit-textarea')?.value || '';
    const icon  = document.querySelector('input[name="notice-icon"]:checked')?.value  || 'ti-alert-triangle';
    const color = document.querySelector('input[name="notice-color"]:checked')?.value || 'orange';
    _editDraft = window.mkEditDraft;
    _ensureNoticesArray(_editDraft);
    if (idx === -1) {
      _editDraft.overviewNotices.push({ text, icon, color });
    } else {
      _editDraft.overviewNotices[idx] = { text, icon, color };
    }
    Store.saveConfig(_editDraft);
    document.getElementById('notice-edit-modal')?.remove();
    renderPages();
    go(_currentPageId);
    showToast(idx === -1 ? '✓ 공지가 추가되었습니다' : '✓ 공지가 저장되었습니다', 'success');
  }

  function _deleteNotice(idx) {
    if (!confirm('이 공지를 삭제할까요?')) return;
    const config = MK_CONFIG.resolve();
    _editDraft = JSON.parse(JSON.stringify(config));
    _ensureNoticesArray(_editDraft);
    _editDraft.overviewNotices.splice(idx, 1);
    Store.saveConfig(_editDraft);
    renderPages();
    go(_currentPageId);
    showToast('✓ 공지가 삭제되었습니다', 'success');
  }

  function _savePageEdit(pageId) {
    if (!confirm('수정사항을 반영하시겠습니까?')) return;
    _editDraft = window.mkEditDraft;
    Store.saveConfig(_editDraft);
    document.getElementById('page-edit-modal')?.remove();
    setTimeout(() => {
      renderPages();
      go(pageId);
    }, 0);
    showToast('✓ 수정사항이 반영되었습니다', 'success');
  }

  /* ============================================================
   * 13. 토스트 알림
   * ============================================================ */
  function showToast(msg, type = 'success') {
    let toast = document.getElementById('mk-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mk-toast';
      document.body.appendChild(toast);
    }

    const colorMap = {
      success: { bg: '#1a1d2e', color: '#fff',     border: 'transparent' },
      warn:    { bg: '#fff',    color: '#15151A',  border: '#FFB89A' },
      error:   { bg: '#FFD3E1',color: '#8b1c3a',  border: '#FF8FB1' },
    };
    const c = colorMap[type] || colorMap.success;

    toast.style.cssText = `
      position:fixed; bottom:36px; left:50%; transform:translateX(-50%);
      background:${c.bg}; color:${c.color};
      padding:12px 28px; border-radius:12px;
      font-size:14px; font-weight:600;
      box-shadow:0 8px 32px rgba(0,0,0,0.15);
      z-index:9999; border:1.5px solid ${c.border};
      display:flex; align-items:center; gap:10px;
      opacity:1; transition:opacity 0.3s;
      white-space:nowrap;`;

    const iconMap = { success: 'ti-circle-check', warn: 'ti-alert-circle', error: 'ti-x' };
    const iconColor = type === 'warn' ? '#FF8FB1' : (type === 'error' ? '#8b1c3a' : '#B79CFF');
    toast.innerHTML = `<i class="ti ${iconMap[type] || 'ti-info-circle'}" style="font-size:18px;color:${iconColor};"></i> ${msg}`;

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }


  /* ============================================================
   * Public API
   * ============================================================ */
  return {
    init,
    go,
    toggleGrade,
    handleOvCheck,
    handleItemCheck,
    renderSidebar,
    toggleSbGroup,
    renderPages,
    renderStudentDropdown,
    openSaveStudentModal,
    confirmSaveStudent,
    loadSelectedStudent,
    openStudentSelectModal,
    loadStudentByKey,
    _deleteStudentFromModal,
    _editStudentFromModal,
    _confirmEditStudent,
    _filterStudentList,
    newSession,
    applyPackage,
    showToast,
    toggleAdminMode,
    openPageEdit,
    _savePageEdit,
    openOvCardEdit,
    _saveOvCardEdit,
    _buildOvTreeRows, _refreshOvTreeRows,
    _addOvTree, _removeOvTree, _setTreeFontSize,
    openNoticeEdit,
    _saveNoticeEdit,
    _deleteNotice,
    getCurrentPageId: () => _currentPageId,
    _richCmd,
    _saveSelection, _restoreSelection,
    _insertText,
    _toggleScPopup,
    _buildProgramRows, _buildCondRows, _buildNoteRows, _refreshRows,
    _addProgram, _removeProgram,
    _addCond, _removeCond,
    _addNote, _removeNote,
  };

})();


/* ============================================================
 * DOMContentLoaded 진입점
 * ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  UI.init();
  // 서버 최신 설정 동기화 후 UI 갱신
  Store.syncConfigFromServer().then(updated => {
    if (updated) {
      UI.renderSidebar();
      UI.renderPages();
      UI.go('rm-overview');
    }
  });

  // 다른 탭(관리자)에서 설정 변경 시 자동 갱신
  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel('mk_config_sync');
    ch.onmessage = () => {
      // 관리자가 Supabase 저장 완료 후 신호를 보내므로 최신값 보장
      Store.syncConfigFromServer().then(updated => {
        if (updated) {
          UI.renderSidebar();
          UI.renderPages();
          UI.go(UI.getCurrentPageId());
        }
      });
    };
  }
});
