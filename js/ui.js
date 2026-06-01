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
      _updateTotalBoxes(Calc.isSelectDcActive() ? Calc.getAllTotalsDcWithSelect() : Calc.getAllTotalsDc());
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
      _updateDcButtons();
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
        return pr.label + ' ' + man + (pr.note ? ' <span style="font-size:11px;color:var(--text-3);">(' + pr.note + ')</span>' : '') + '<br>';
      }).join('');
    }
    return (page.ovCard.priceLabel || []).map(p => p + '<br>').join('');
  }

  // 학년 grade 기준 priceHtml 생성 — 렌더와 업데이트 로직 통일
  //   grade === 0 : 기본 모드 → 전 카드 동일하게 priceLabel (설명 문구)
  //   grade > 0  : 학년 모드 → A,B: 해당 학년 금액 굵게 / C,D,E: 무관 금액
  function _buildOvPriceHtml(page, grade) {
    if (grade === 0) {
      if (page.prices && page.prices.length) {
        return page.prices.map(pr => {
          const man = pr.amt ? Math.round(pr.amt / 10000) + '만원' : '0원';
          return pr.label + ' ' + man + (pr.note ? ' <span style="font-size:11px;color:var(--text-3);">(' + pr.note + ')</span>' : '') + '<br>';
        }).join('');
      }
      return (page.ovCard.priceLabel || []).map(p => p + '<br>').join('');
    }
    const mode = _getOvPriceMode(page);
    if (mode === 'fixed') return _buildFixedPriceHtml(page);
    const gradeItems = (page.prices || []).filter(p =>
      p.grade && String(p.grade).split(',').map(Number).includes(grade)
    );
    if (!gradeItems.length) {
      return (page.ovCard.priceLabel || []).map(p => p + '<br>').join('');
    }
    // prices[] 기반 해당 학년 항목 전체 출력
    let priceHtmlStr = gradeItems.map(p => '<strong>' + p.label + ' ' + fmt(p.amt) + '</strong>' + (p.note ? ' <span style="font-size:11px;color:var(--text-3);">(' + p.note + ')</span>' : '')).join('<br>');
    // 2학기 금액 — 관리자 설정값 (합산 제외, 표시 전용)
    // pageId는 _updateOvCardPrices에서 순회 시 알고 있으므로 pageId 기반으로 직접 접근
    const _semData = ((cfg().discount || {}).semesterAmt || {});
    const _pageId  = Object.keys(cfg().pages).find(id => cfg().pages[id] === page);
    if (_pageId) {
      const _semEntry = _semData[_pageId];
      // 학년별 객체 구조 { 1:{note,amt}, 2:{note,amt}, 3:{note,amt} }
      if (_semEntry && typeof _semEntry === 'object' && !Array.isArray(_semEntry)) {
        const _gradeData = _semEntry[grade];
        if (_gradeData && _gradeData.amt > 0) {
          const _noteStr = _gradeData.note ? ' (' + _gradeData.note + ')' : '';
          priceHtmlStr += '<br><span style="font-size:12px;color:var(--text-3);">2학기' + _noteStr + ' ' + fmt(_gradeData.amt) + '</span>';
        }
      }
    }
    return priceHtmlStr;
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
    if (el('total-sum'))        el('total-sum').textContent        = fmt(totals.grand !== undefined ? totals.grand : (totals.roadmap||0) + (totals.individual||0) + (totals.strategy||0));
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
      const treeHtml = (ov.tree || []).map(t => {
        const labelStyle = [
          t.labelSize ? `font-size:${t.labelSize}pt;` : treeFontSize,
          t.labelColor ? `color:${t.labelColor};` : ''
        ].join('');
        const subStyle = [
          t.subSize ? `font-size:${t.subSize}pt;` : treeFontSize,
          t.subColor ? `color:${t.subColor};` : ''
        ].join('');
        return `
        <div class="ov-tree-item">
          <div class="ov-tree-dot"></div>
          <div>
            <div class="ov-tree-label" style="${labelStyle}">${t.label}</div>
            <div class="ov-tree-sub"  style="${subStyle}">${t.sub}</div>
          </div>
        </div>`;
      }).join('');

      // 초기 priceHtml — _buildOvPriceHtml로 생성 (업데이트 로직과 동일)
      const currentGrade = Calc.getGrade ? Calc.getGrade() : 0;
      const priceHtml = _buildOvPriceHtml(page, currentGrade);

      const ovEditBtn = _isAdminMode()
        ? `<button class="edit-mode-btn ov-edit-btn" onclick="event.stopPropagation();UI.openOvCardEdit('${pageId}')" title="카드 편집" style="position:absolute;bottom:8px;right:8px;"><i class="ti ti-pencil"></i> 편집</button>`
        : '';

      return `
        <div class="ov-card" id="ovcard-${pageId}" style="position:relative;">
          ${checkArea}
          <div class="ov-header">
            <div class="ov-icon" style="background:${page.iconBg};color:${page.iconColor};">
              <i class="ti ${page.iconClass}"></i>
            </div>
            <div>
              <div class="ov-badge">${ov.badge}</div>
              <div class="ov-name">${ov.name || page.sbLabel.replace(/^[A-E]\. /, '')}</div>
            </div>
          </div>
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
          <div style="flex:1;">
            <div class="detail-title">
              <span class="detail-section-badge">SECTION</span>
              ${page.title}
            </div>
            <div class="detail-sub">${page.subtitle || ''}</div>
          </div>
          ${_isAdminMode() ? `<button class="edit-mode-btn" onclick="UI.openPageEdit('${pageId}')" title="이 페이지 편집"><i class="ti ti-pencil"></i> 편집</button>` : ''}
        </div>
        <div class="detail-grid">
          <div>
            <div class="d-col-label"><span class="d-col-num">01</span>프로그램 구성</div>
            ${programsHtml}
          </div>
          <div>
            <div class="d-col-label"><span class="d-col-num">02</span>제공 조건 및 세부 내용</div>
            ${conditionsHtml}
            ${notesHtml}
          </div>
          <div>
            <div class="d-col-label"><span class="d-col-num">03</span>개별가 선택</div>
            ${priceCardHtml}
          </div>
        </div>
      </div>`;
  }

  function _renderPrograms(programs) {
    return programs.map((p, idx) => {
      // 번호: idx+1 기반 자동 부여 — 항목 추가/삭제 시 항상 재정렬
      const numStr = String(idx + 1).padStart(2, '0');
      const hasLink = p.title.includes('세특구원자');
      const titleHtml = hasLink
        ? `${p.title} <a href="https://naver.me/GfMeckyJ" target="_blank" rel="noopener"
            style="font-size:11px;font-weight:600;color:#B79CFF;text-decoration:none;
            border:1px solid rgba(183,156,255,0.4);border-radius:4px;padding:1px 7px;margin-left:6px;vertical-align:middle;">
            <i class="ti ti-external-link" style="font-size:11px;"></i> 바로가기</a>`
        : p.title;
      return `
      <div class="p-item">
        <div class="p-header">
          <span class="p-num-badge">PROGRAM · ${numStr}</span>
          <span class="p-title">${titleHtml}</span>
        </div>
        <div class="p-desc">
          ${(p.items || []).map(i => `<div class="p-item-line">${i}</div>`).join('')}
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
        // type: 'text' — innerHTML 직접 출력 (서식·색상 보존)
        body = c.text || '';
      }
      return `
        <div class="c-box">
          <div class="c-title"><div class="c-peg"></div><span class="c-title-text">${c.title}</span></div>
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
    const result = Calc.selectOv(pageId, cb.checked);
    if (!result) {
      cb.checked = false;
      showToast('학년을 먼저 선택해 주세요', 'warn');
      return;
    }
    if (result === 'switched') {
      showToast('프로그램 전환되어 금액이 초기화됩니다', 'warn');
    }
    // 세특/수행 체크 해제 시 로드맵DC 켜져 있으면 자동 해제 + 합계 리셋
    if (!cb.checked && (pageId === 'rm-a' || pageId === 'rm-b') && Calc.isDcActive('roadmap')) {
      Calc.toggleDc('roadmap');
      _updateDcButtons();
      _updateTotalBoxes(Calc.getAllTotalsDc());
      showToast('로드맵 DC가 해제되었습니다. 다시 선택해 주세요', 'warn');
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
    const result = Calc.selectItem(pageId, idx, cb.checked);
    if (result === 'switched') {
      showToast('프로그램 전환되어 금액이 초기화됩니다', 'warn');
      // 반대 그룹 체크박스 UI 즉시 동기화
      _syncCheckboxes(Calc.state);
      _syncOvCards(Calc.state);
    }
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
    _updateDcButtons();
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

    // 개별가 DC — 체크된 항목 중 할인율 있는 것 없으면 토스트
    if (group === 'individual') {
      const indDisc = (config.discount || {}).individual || {};
      const hasCheckedRate = MK_CONFIG.pageOrder.some(pid => {
        const page = config.pages[pid];
        if (!page || (page.calcGroup || page.group) !== 'individual' || page.isOverview) return false;
        const rate  = indDisc[pid] || 0;
        const hasOv = !!Calc.state.ov[pid];
        const hasPg = Calc.state.pages[pid] && Calc.state.pages[pid].size > 0;
        return rate > 0 && (hasOv || hasPg);
      });
      if (!hasCheckedRate) {
        showToast('현재 할인율이 0% 입니다', 'warn');
        return;
      }
    }

    // 로드맵DC — 세특/수행 선택 상태 확인
    if (group === 'roadmap') {
      const rmAOn = Calc.isOvSelected('rm-a');
      const rmBOn = Calc.isOvSelected('rm-b');
      // 둘 다 미선택
      if (!rmAOn && !rmBOn) {
        showToast('세특 또는 수행 관리 중 하나를 먼저 선택해 주세요', 'warn');
        return;
      }
      // 1개만 선택
      if ((rmAOn || rmBOn) && !(rmAOn && rmBOn)) {
        showToast('선택가 DC만 가능합니다', 'warn');
        return;
      }
    }

    // 로드맵DC 활성 시 선택DC 상호 배타 — 선택DC 자동 해제
    let mutualMsg = '';
    if (group === 'roadmap' && Calc.isSelectDcActive()) {
      Calc.toggleSelectDc(); // 선택DC OFF
      mutualMsg = '선택가 DC가 해제되었습니다. 1개만 적용 가능합니다';
    }

    const isOn = Calc.toggleDc(group);
    // 로드맵DC 해제 시 2학기DC 자동 해제
    if (group === 'roadmap' && !isOn && Calc.isSemesterDcActive()) {
      Calc.toggleSemesterDc();
    }
    _updateDcButtons();
    _updateTotalBoxes(Calc.getAllTotalsDc());

    const label = group === 'roadmap' ? '로드맵' : '개별';
    if (mutualMsg) {
      showToast(mutualMsg, 'warn');
    } else if (isOn) {
      showToast(`${label} DC 할인이 적용되었습니다`, 'success');
    } else {
      showToast(`${label} DC 할인이 해제되었습니다`, 'warn');
    }
  }

  // DC 버튼 텍스트 + 활성 상태 업데이트
  function _updateDcButtons() {
    const config = cfg();
    const disc   = config.discount || {};

    const btn1      = document.querySelector('.pkg-btn-1');
    const btn2      = document.querySelector('.pkg-btn-2');
    const btnSelect = document.querySelector('.pkg-btn-select');

    if (btn1) {
      const rate = disc.roadmap || 0;
      const isOn = Calc.isDcActive('roadmap');
      btn1.textContent = `로드맵 DC (${rate}%)`;
      btn1.classList.toggle('pkg-btn-active', isOn);
    }
    if (btnSelect) {
      const rate = disc.selectDc || 0;
      const isOn = Calc.isSelectDcActive();
      btnSelect.textContent = `선택가 DC (${rate}%)`;
      btnSelect.classList.toggle('pkg-btn-active', isOn);
    }
    if (btn2) {
      const indDisc = disc.individual || {};
      const config2 = cfg();
      const checkedRates = [];
      MK_CONFIG.pageOrder.forEach(pid => {
        const page = config2.pages[pid];
        if (!page || (page.calcGroup || page.group) !== 'individual' || page.isOverview) return;
        const rate  = indDisc[pid] || 0;
        if (rate <= 0) return;
        const hasOv = !!Calc.state.ov[pid];
        const hasPg = Calc.state.pages[pid] && Calc.state.pages[pid].size > 0;
        if (hasOv || hasPg) checkedRates.push(rate);
      });
      btn2.style.display = '';
      const isOn2      = Calc.isDcActive('individual');
      const rateValues = [...new Set(checkedRates)];
      const rateLabel  = rateValues.length === 0 ? '0%'
        : rateValues.length === 1 ? `${rateValues[0]}%`
        : `${Math.min(...rateValues)}~${Math.max(...rateValues)}%`;
      btn2.textContent = `개별가 DC (${rateLabel})`;
      btn2.classList.toggle('pkg-btn-active', isOn2);
    }

    // 2학기 DC 버튼 — 항상 표시, 미활성 시 0만원
    const btnSem = document.querySelector('.pkg-btn-semester');
    if (btnSem) {
      const semOn     = Calc.isSemesterDcActive();
      const isRoadmap = Calc.isDcActive('roadmap');
      const isSelect  = Calc.isSelectDcActive();
      const semDisc   = cfg().discount;
      const amt = (!isRoadmap && !isSelect) ? 0
        : isRoadmap ? (semDisc.semesterDcAmt || 0)
        : (semDisc.semesterDcAmtSingle || 0);
      btnSem.style.display = '';
      btnSem.classList.toggle('pkg-btn-active', semOn);
      const semAmtEl = btnSem.querySelector('.sem-amt');
      if (semAmtEl) semAmtEl.textContent = `-${amt}만원`;
    }
  }

  // 선택가 DC 토글
  function applySelectDc() {
    const config = cfg();
    const rate   = (config.discount || {}).selectDc || 0;
    if (!rate) {
      showToast('선택가 DC 할인율이 설정되지 않았습니다', 'warn');
      return;
    }

    // 세특(rm-a) / 수행(rm-b) 선택 상태 확인
    const rmAOn = Calc.isOvSelected('rm-a');
    const rmBOn = Calc.isOvSelected('rm-b');

    // 케이스1: 둘 다 미선택
    if (!rmAOn && !rmBOn) {
      showToast('세특 또는 수행 관리 중 1개를 먼저 선택해 주세요', 'warn');
      return;
    }

    // 케이스2: 둘 다 선택 → 로드맵DC 안내
    if (rmAOn && rmBOn) {
      showToast('두 프로그램 모두 선택 시 로드맵 DC를 이용해 주세요', 'warn');
      return;
    }

    // 케이스3: 1개만 선택 → 정상 적용
    // 로드맵DC 상호 배타 — 로드맵DC 자동 해제
    if (Calc.isDcActive('roadmap')) {
      Calc.toggleDc('roadmap');
    }

    const isOn = Calc.toggleSelectDc();
    // 선택가DC 해제 시 2학기DC 자동 해제
    if (!isOn && Calc.isSemesterDcActive()) {
      Calc.toggleSemesterDc();
    }
    _updateDcButtons();
    _updateTotalBoxes(Calc.isSelectDcActive() ? Calc.getAllTotalsDcWithSelect() : Calc.getAllTotalsDc());
    if (isOn) {
      showToast(`선택가 DC (${rate}%) 할인이 적용되었습니다`, 'success');
    } else {
      showToast('선택가 DC 할인이 해제되었습니다', 'warn');
    }
  }


  // 2학기 DC 토글
  function applySemesterDc() {
    const isRoadmap = Calc.isDcActive('roadmap');
    const isSelect  = Calc.isSelectDcActive();
    if (!isRoadmap && !isSelect) {
      showToast('학년 로드맵 결정 후 사용가능합니다', 'warn');
      return;
    }
    const isOn = Calc.toggleSemesterDc();
    const disc = MK_CONFIG.resolve().discount;
    const amt  = isRoadmap
      ? (disc.semesterDcAmt       || 0)
      : (disc.semesterDcAmtSingle || 0);
    _updateDcButtons();
    _updateTotalBoxes(Calc.isSelectDcActive() ? Calc.getAllTotalsDcWithSelect() : Calc.getAllTotalsDc());
    if (isOn) {
      showToast(`2학기 DC (-${amt}만원) 적용되었습니다`, 'success');
    } else {
      showToast('2학기 DC가 해제되었습니다', 'warn');
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

          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div>
              <div class="d-col-label" style="margin-bottom:6px;">아이콘</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;max-width:280px;">
                ${['ti-pencil','ti-layout-list','ti-bulb','ti-users','ti-settings',
                   'ti-star','ti-heart','ti-bolt','ti-book','ti-school',
                   'ti-target','ti-trophy','ti-chart-bar','ti-trending-up',
                   'ti-calendar','ti-brain','ti-atom','ti-message','ti-home','ti-shield-check',
                   'ti-circle','ti-flag','ti-bookmark','ti-edit','ti-writing',
                   'ti-file-text','ti-clipboard','ti-books','ti-notebook','ti-certificate',
                   'ti-user','ti-user-check','ti-user-star','ti-medal','ti-crown',
                   'ti-chart-line','ti-chart-pie','ti-map-pin','ti-compass','ti-clock'
                  ].map(cls => `
                  <button type="button" data-icon="${cls}"
                    style="width:32px;height:32px;border-radius:6px;border:2px solid ${page.iconClass===cls?'var(--accent)':'var(--border)'};background:${page.iconBg};display:flex;align-items:center;justify-content:center;cursor:pointer;"
                    onclick="window.mkEditDraft.pages['${pageId}'].iconClass='${cls}';UI._syncOvIconBtns('${pageId}')">
                    <i class='ti ${cls}' style='font-size:15px;color:${page.iconColor};'></i>
                  </button>`).join('')}
              </div>
            </div>
            <div>
              <div class="d-col-label" style="margin-bottom:6px;">배경색</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;max-width:220px;">
                ${[
                  ['#FFE3D4','#C45000'],['#FFD3E1','#8b1c3a'],['#E1D6FF','#5b35c4'],
                  ['#D4ECFF','#0a4a8a'],['#D4F5E3','#1a6b3c'],['#FFF3D4','#8b6200'],
                  ['#F0F0F0','#333333'],['#1a1d2e','#ffffff'],['#FDE8FF','#7b1fa2'],
                  ['#E8F5E9','#2e7d32'],['#E3F2FD','#1565c0'],['#FFF8E1','#f57f17'],
                  ['#FCE4EC','#880e4f'],['#E8EAF6','#283593'],['#E0F7FA','#00695c'],
                  ['#FBE9E7','#bf360c'],['#F3E5F5','#6a1b9a'],['#E0F2F1','#004d40'],
                  ['#ECEFF1','#455a64'],['#FAFAFA','#212121']
                ].map(([bg, color]) => `
                  <button type="button" data-bg="${bg}"
                    style="width:28px;height:28px;border-radius:50%;background:${bg};border:3px solid ${page.iconBg===bg?'var(--accent)':'transparent'};cursor:pointer;"
                    onclick="window.mkEditDraft.pages['${pageId}'].iconBg='${bg}';window.mkEditDraft.pages['${pageId}'].iconColor='${color}';UI._syncOvIconBtns('${pageId}')">
                  </button>`).join('')}
              </div>
            </div>
          </div>

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
            <div class="d-col-label" style="margin-bottom:6px;">📌 카드 타이틀 (서식 적용)</div>
            ${_richToolbar('ov-name-' + pageId)}
            <div id="ov-name-${pageId}" class="admin-input rich-editor"
              contenteditable="true"
              style="border-radius:0 0 var(--radius-sm) var(--radius-sm);min-height:42px;padding:8px;"
              onclick="UI._syncSizeBtn('ov-name-${pageId}');UI._syncColorBtn('ov-name-${pageId}')"
              onkeyup="UI._syncSizeBtn('ov-name-${pageId}');UI._syncColorBtn('ov-name-${pageId}')"
              oninput="window.mkEditDraft.pages['${pageId}'].ovCard.name=this.innerHTML"
            >${ov.name || page.sbLabel.replace(/^[A-E]\. /, '')}</div>
          </div>

          <div>
            <div class="d-col-label" style="margin-bottom:6px;">🟢 프로그램 설명</div>
            ${_richToolbar('ov-desc-' + pageId)}
            <div id="ov-desc-${pageId}" class="admin-input rich-editor"
              contenteditable="true"
              style="border-radius:0 0 var(--radius-sm) var(--radius-sm);min-height:80px;padding:8px;"
              onclick="UI._syncSizeBtn('ov-desc-${pageId}');UI._syncColorBtn('ov-desc-${pageId}')"
              onkeyup="UI._syncSizeBtn('ov-desc-${pageId}');UI._syncColorBtn('ov-desc-${pageId}')"
              oninput="window.mkEditDraft.pages['${pageId}'].ovCard.desc=this.innerHTML"
            >${ov.desc || ''}</div>
          </div>

          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div class="d-col-label">🩷 구성 요약 트리</div>
              <button type="button" class="btn btn-sm btn-primary" onclick="UI._addOvTree('${pageId}')">
                <i class="ti ti-plus"></i> 항목 추가
              </button>
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
    setTimeout(() => {
      modal.querySelectorAll('.rich-editor').forEach(el => {
        if (el.id) UI._syncSizeBtn(el.id);
        if (el.id) UI._syncColorBtn(el.id);
      });
    }, 0);
  }

  function _buildOvTreeRows(pageId) {
    const ov = window.mkEditDraft.pages[pageId]?.ovCard || {};
    const sizes = [['0','기본'],['10','10'],['12','12'],['14','14'],['16','16'],['18','18'],['20','20']];
    const colors = ['#000000','#e03131','#e8590c','#f08c00','#2f9e44','#1971c2','#7048e8','#c2255c','#868e96'];

    // 현재 적용값 (첫 번째 트리 항목 기준)
    const first = (ov.tree || [])[0] || {};
    const curLabelSize  = first.labelSize  || '0';
    const curLabelColor = first.labelColor || '';
    const curSubSize    = first.subSize    || '0';
    const curSubColor   = first.subColor   || '';

    // 전체 항목에 일괄 적용하는 함수 호출
    const _allSizeSet = (field, val) =>
      `UI._setOvTreeAll('${pageId}','${field}','${val}')`;
    const _allColorSet = (field, val) =>
      `UI._setOvTreeAll('${pageId}','${field}','${val}')`;

    const _sizeBtns = (field, curVal) => sizes.map(([v,l]) => {
      const active = (v === '0' ? '' : v) === (curVal === '0' ? '' : curVal) ? 'size-active' : '';
      return `<button type="button" class="rich-btn size-btn ${active}" style="font-size:10px;padding:1px 4px;"
        onclick="${_allSizeSet(field, v === '0' ? '' : v)}">${l}</button>`;
    }).join('');

    const _colorBtns = (field, curVal) => colors.map(c => {
      const active = curVal === c ? 'outline:2px solid var(--accent);' : '';
      return `<button type="button" style="width:14px;height:14px;border-radius:50%;background:${c};border:1px solid ${c};cursor:pointer;padding:0;${active}"
        onclick="${_allColorSet(field, c)}"></button>`;
    }).join('');

    const headerHtml = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;padding:8px;background:var(--surface2);border-radius:var(--radius-sm);">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="font-size:10px;color:var(--text-3);font-weight:600;">A존 (제목) 크기 · 색상</div>
          <div style="display:flex;gap:2px;">${_sizeBtns('labelSize', curLabelSize)}</div>
          <div style="display:flex;gap:2px;">${_colorBtns('labelColor', curLabelColor)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="font-size:10px;color:var(--text-3);font-weight:600;">B존 (부제) 크기 · 색상</div>
          <div style="display:flex;gap:2px;">${_sizeBtns('subSize', curSubSize)}</div>
          <div style="display:flex;gap:2px;">${_colorBtns('subColor', curSubColor)}</div>
        </div>
      </div>`;

    const rowsHtml = (ov.tree || []).map((t, idx) => `
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

    return headerHtml + rowsHtml;
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

  // 트리 전체 항목에 labelSize/labelColor/subSize/subColor 일괄 적용
  function _setOvTreeAll(pageId, field, val) {
    const tree = window.mkEditDraft.pages[pageId]?.ovCard?.tree;
    if (!Array.isArray(tree)) return;
    tree.forEach(t => { t[field] = val; });
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
        ${[['0','기본'],['10','10'],['12','12'],['14','14'],['16','16'],['18','18'],['20','20']].map(([v,l]) =>
          `<button type="button" class="rich-btn size-btn" data-size="${v}" style="font-size:11px;padding:2px 6px;"
            onclick="UI._richCmd('fontSize','${v}','${targetId}')">${l}</button>`
        ).join('')}
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
          `<button type="button" class="rich-btn rich-color-btn color-btn"
            title="${label}"
            data-color="${color}"
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
      _syncColorBtn(targetId, val);
    } else if (cmd === 'fontSize') {
      const el = document.getElementById(targetId);
      if (!el) return;
      el.focus();
      if (val === '0' || val === '') {
        // 기본값 복원 — font-size span 전체 제거
        el.querySelectorAll('span[style*="font-size"]').forEach(s => {
          s.style.fontSize = '';
          if (!s.getAttribute('style') || s.getAttribute('style').trim() === '') {
            const p = s.parentNode;
            while (s.firstChild) p.insertBefore(s.firstChild, s);
            p.removeChild(s);
          }
        });
        el.dispatchEvent(new Event('input', { bubbles: true }));
        _syncSizeBtn(targetId);
      } else {
        // execCommand fontSize: 1~7 단계값 — 7 고정 후 font태그→span 변환
        document.execCommand('fontSize', false, '7');
        el.querySelectorAll('font[size="7"]').forEach(f => {
          const span = document.createElement('span');
          span.style.fontSize = val + 'pt';
          // font 태그의 다른 속성(color 등) 보존
          if (f.style.color) span.style.color = f.style.color;
          while (f.firstChild) span.appendChild(f.firstChild);
          f.parentNode.replaceChild(span, f);
        });
        el.dispatchEvent(new Event('input', { bubbles: true }));
        _syncSizeBtn(targetId);
      }
    } else {
      document.getElementById(targetId)?.focus();
      document.execCommand(cmd, false, null);
    }
  }


  // 특수문자 삽입
  function _insertText(char, targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.focus();
    document.execCommand('insertText', false, char);
  }

  // 크기 버튼 활성화 — 커서 위치 또는 첫 텍스트 노드 폰트 크기 읽어 반영
  function _syncSizeBtn(targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const toolbar = el.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('rich-toolbar')) return;
    // 커서 위치 노드 또는 첫 자식 노드에서 font-size 읽기
    const sel = window.getSelection();
    let node = null;
    if (sel && sel.rangeCount > 0) {
      const n = sel.getRangeAt(0).startContainer;
      node = n.nodeType === 3 ? n.parentElement : n;
    }
    if (!node || !el.contains(node)) {
      // 커서 없으면 첫 텍스트 노드 사용
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      node = first ? first.parentElement : el;
    }
    const pxVal = node ? window.getComputedStyle(node).fontSize : '';
    const ptVal = pxVal ? Math.round(parseFloat(pxVal) * 0.75) : 0;
    // 버튼 활성화
    toolbar.querySelectorAll('.rich-btn.size-btn').forEach(btn => {
      btn.classList.toggle('size-active', String(btn.dataset.size) === String(ptVal));
    });
  }

  // 색상 버튼 활성화 — 커서 위치 색상 읽어 반영
  function _syncColorBtn(targetId, hexColor) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const toolbar = el.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('rich-toolbar')) return;
    // hex 없으면 커서 위치 색상 읽기
    let activeHex = hexColor || '';
    if (!activeHex) {
      const sel = window.getSelection();
      let node = null;
      if (sel && sel.rangeCount > 0) {
        const n = sel.getRangeAt(0).startContainer;
        node = n.nodeType === 3 ? n.parentElement : n;
      }
      if (node && el.contains(node)) {
        const rgb = window.getComputedStyle(node).color;
        // rgb(r,g,b) → #rrggbb 변환
        const m = rgb.match(/\d+/g);
        if (m) activeHex = '#' + m.slice(0,3).map(x => parseInt(x).toString(16).padStart(2,'0')).join('');
      }
    }
    toolbar.querySelectorAll('.color-btn').forEach(btn => {
      const isActive = btn.dataset.color === activeHex;
      btn.style.outline = isActive ? '2px solid var(--accent)' : '';
      btn.style.outlineOffset = isActive ? '2px' : '';
    });
  }

  // 아이콘/배경색 버튼 활성화 DOM 갱신 — 모달 재오픈 없이 테두리만 업데이트
  function _syncOvIconBtns(pageId) {
    const draft = window.mkEditDraft?.pages[pageId];
    if (!draft) return;
    const modal = document.getElementById('ovcard-edit-modal');
    if (!modal) return;
    // 아이콘 버튼 테두리 갱신
    modal.querySelectorAll('[data-icon]').forEach(btn => {
      btn.style.border = `2px solid ${btn.dataset.icon === draft.iconClass ? 'var(--accent)' : 'var(--border)'}`;
      btn.style.background = draft.iconBg;
      const icon = btn.querySelector('i');
      if (icon) icon.style.color = draft.iconColor;
    });
    // 배경색 버튼 테두리 갱신
    modal.querySelectorAll('[data-bg]').forEach(btn => {
      btn.style.border = `3px solid ${btn.dataset.bg === draft.iconBg ? 'var(--accent)' : 'transparent'}`;
    });
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
              ${_richToolbar('title-' + pageId)}
              <div id="title-${pageId}" class="admin-input rich-editor"
                contenteditable="true"
                style="border-radius:0 0 var(--radius-sm) var(--radius-sm);min-height:38px;padding:8px;"
                onclick="UI._syncSizeBtn('title-${pageId}');UI._syncColorBtn('title-${pageId}')"
                onkeyup="UI._syncSizeBtn('title-${pageId}');UI._syncColorBtn('title-${pageId}')"
                oninput="window.mkEditDraft.pages['${pageId}'].title=this.innerHTML"
              >${page.title || ''}</div>
            </div>
            <div style="flex:2;">
              <div class="d-col-label" style="margin-bottom:6px;">부제목</div>
              ${_richToolbar('subtitle-' + pageId)}
              <div id="subtitle-${pageId}" class="admin-input rich-editor"
                contenteditable="true"
                style="border-radius:0 0 var(--radius-sm) var(--radius-sm);min-height:38px;padding:8px;"
                onclick="UI._syncSizeBtn('subtitle-${pageId}');UI._syncColorBtn('subtitle-${pageId}')"
                onkeyup="UI._syncSizeBtn('subtitle-${pageId}');UI._syncColorBtn('subtitle-${pageId}')"
                oninput="window.mkEditDraft.pages['${pageId}'].subtitle=this.innerHTML"
              >${page.subtitle || ''}</div>
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
    // 편집기 열자마자 폰트 크기 버튼 활성화
    setTimeout(() => {
      modal.querySelectorAll('.rich-editor').forEach(el => {
        if (el.id) UI._syncSizeBtn(el.id);
        if (el.id) UI._syncColorBtn(el.id);
      });
    }, 0);
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
          onclick="UI._syncSizeBtn('${tid}');UI._syncColorBtn('${tid}')"
          onkeyup="UI._syncSizeBtn('${tid}');UI._syncColorBtn('${tid}')"
          oninput="window.mkEditDraft.pages['${pageId}'].programs[${idx}].items=Array.from(this.querySelectorAll('div,p')).map(e=>e.innerHTML.trim()).filter(Boolean).length?Array.from(this.querySelectorAll('div,p')).map(e=>e.innerHTML.trim()).filter(Boolean):[this.innerHTML.trim()]"
        >${(p.items || []).map(i => `<div>${i}</div>`).join('')}</div>
      </div>`;
    }).join('');
  }

  function _buildCondRows(pageId) {
    return (window.mkEditDraft.pages[pageId].conditions || []).map((c, idx) => {
      const tid = `cond-text-${pageId}-${idx}`;
      const isTagsType = c.type === 'tags+text';
      const tagsRow = isTagsType ? `
        <div style="margin-bottom:6px;">
          <div style="font-size:11px;color:var(--text-3);margin-bottom:4px;font-weight:600;">태그 (콤마로 구분)</div>
          <input class="admin-input" style="width:100%;"
            value="${(c.tags || []).join(', ')}"
            oninput="window.mkEditDraft.pages['${pageId}'].conditions[${idx}].tags=this.value.split(',').map(s=>s.trim()).filter(Boolean)"
            placeholder="국어, 수학, 영어 ...">
        </div>` : '';
      return `
      <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px;">
        <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
          <input class="admin-input" style="flex:1;" value="${c.title || ''}"
            oninput="window.mkEditDraft.pages['${pageId}'].conditions[${idx}].title=this.value"
            placeholder="조건 제목">
          <button type="button" class="btn btn-sm" style="color:var(--red-tx);flex-shrink:0;"
            onclick="UI._removeCond('${pageId}',${idx})"><i class="ti ti-trash"></i></button>
        </div>
        ${tagsRow}
        ${_richToolbar(tid)}
        <div id="${tid}" class="admin-input rich-editor"
          contenteditable="true"
          style="border-radius:0 0 var(--radius-sm) var(--radius-sm);min-height:50px;padding:8px;"
          onclick="UI._syncSizeBtn('${tid}');UI._syncColorBtn('${tid}')"
          onkeyup="UI._syncSizeBtn('${tid}');UI._syncColorBtn('${tid}')"
          oninput="window.mkEditDraft.pages['${pageId}'].conditions[${idx}].text=this.innerHTML"
        >${c.text || ''}</div>
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
    applySelectDc,
    applySemesterDc,
    showToast,
    toggleAdminMode,
    openPageEdit,
    _savePageEdit,
    openOvCardEdit,
    _saveOvCardEdit,
    _buildOvTreeRows, _refreshOvTreeRows,
    _addOvTree, _removeOvTree, _setTreeFontSize, _setOvTreeAll,
    openNoticeEdit,
    _saveNoticeEdit,
    _deleteNotice,
    getCurrentPageId: () => _currentPageId,
    _richCmd,
    _syncSizeBtn, _syncColorBtn, _syncOvIconBtns,
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
      // localStorage에 이미 최신값 저장됨 → 직접 읽어 즉시 렌더
      UI.renderSidebar();
      UI.renderPages();
      UI.go(UI.getCurrentPageId());
    };
  }
});
