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

  let _currentPageId = 'rm-overview';
  let _editDraft = null;


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
    if (session) Calc.fromSnapshot(session);

    // DC 버튼 초기화
    _updateDcButtons();

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

    // topbar breadcrumb / title
    const page = cfg().pages[pageId];
    if (page) {
      const groupLabel = cfg().groups[page.group]?.label || '';
      document.getElementById('tb-section').textContent = groupLabel;
      document.getElementById('tb-title').textContent   = page.title;
    }

    // autoCheck (rm-d / rm-e 첫 진입)
    if (page && page.autoCheck) {
      Calc.autoCheckPage(pageId);
    }

    // 로컬 합계 갱신
    _updateLocalTotal(pageId);
  }


  /* ============================================================
   * 3. 학년 버튼 토글
   * ============================================================ */
  function toggleGrade(n) {
    const prev     = Calc.getGrade();
    const newGrade = Calc.setGrade(n);
    _updateOvCardPrices(newGrade);
    _autoCheckOvCards(newGrade);
    if (prev !== 0 && newGrade !== prev) {
      showToast('학년이 변경되어 선택이 초기화되었습니다', 'warn');
    }
  }

  // 연간관리형 카드 금액 — 선택된 학년만 표시
  function _updateOvCardPrices(grade) {
    const config = cfg();
    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = config.pages[pageId];
      if (!page || !page.ovCard || page.isOverview) return;
      const priceEl = document.getElementById('ov-price-' + pageId);
      if (!priceEl) return;
      if (grade === 0) {
        priceEl.innerHTML = (page.ovCard.priceLabel || []).map(p => p + '<br>').join('');
      } else {
        const amt = (page.ovCard.ovPrices || {})[grade];
        if (amt) {
          priceEl.innerHTML = '<strong>고' + grade + ' ' + fmt(amt) + '</strong>';
        } else {
          priceEl.innerHTML = (page.ovCard.priceLabel || []).map(p => p + '<br>').join('');
        }
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

  function _syncGradeButtons(grade) {
    document.querySelectorAll('.grade-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.grade) === grade);
    });
    // 고3 추가 옵션 섹션 show/hide
    const aocSection = document.getElementById('aoc-section');
    if (aocSection) aocSection.style.display = grade === 3 ? 'block' : 'none';
  }


  /* ============================================================
   * 4. topbar 합산 박스 업데이트
   * ============================================================ */
  function _updateTotalBoxes(totals) {
    const el = id => document.getElementById(id);
    if (el('total-roadmap'))    el('total-roadmap').textContent    = fmt(totals.roadmap);
    if (el('total-individual')) el('total-individual').textContent = fmt(totals.individual);
    if (el('total-strategy'))   el('total-strategy').textContent   = fmt(totals.strategy);
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
        cb.disabled = false;
        cb.closest('label')?.classList.remove('p-opt-disabled');
      }
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

      const treeHtml = (ov.tree || []).map(t => `
        <div class="ov-tree-item">
          <div class="ov-tree-dot"></div>
          <div>
            <div class="ov-tree-label">${t.label}</div>
            <div class="ov-tree-sub">${t.sub}</div>
          </div>
        </div>`).join('');

      // prices[]에서 자동 생성 (없으면 priceLabel 폴백)
      let priceHtml = '';
      if (page.prices && page.prices.length) {
        priceHtml = page.prices.map(pr => {
          const man = pr.amt ? Math.round(pr.amt / 10000) + '만원' : '0원';
          const gradeStr = pr.grade && pr.grade !== '1,2,3' ? `고${pr.grade} ` : '';
          return gradeStr + man + '<br>';
        }).join('');
      } else {
        priceHtml = (ov.priceLabel || []).map(p => p + '<br>').join('');
      }

      return `
        <div class="ov-card" id="ovcard-${pageId}">
          ${checkArea}
          <div class="ov-icon" style="background:${page.iconBg};color:${page.iconColor};">
            <i class="ti ${page.iconClass}"></i>
          </div>
          <div class="ov-badge">${ov.badge}</div>
          <div class="ov-name">${page.sbLabel.replace(/^[A-E]\. /, '')}</div>
          <div class="ov-price" id="ov-price-${pageId}">${priceHtml}</div>
          <div style="flex:1;min-height:8px;"></div>
          <button class="ov-detail-btn" onclick="UI.go('${pageId}')">
            <i class="ti ti-arrow-right"></i> 자세히 보기
          </button>
          <div class="ov-tree">${treeHtml}</div>
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

    return `
      <div id="pg-rm-overview" class="page">
        <div class="ov-grid">${cards}</div>
        <div class="aoc-section" id="aoc-section" style="display:none;">
          <div class="aoc-header"><i class="ti ti-plus"></i> 고3 추가 선택 항목</div>
          <div class="aoc-grid">${addOnCards}${noticeCard}</div>
        </div>
        <div class="global-notice">
          <i class="ti ti-alert-triangle"></i>
          <span>${config.overviewNotice}</span>
        </div>
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
          <button class="edit-mode-btn" onclick="UI.openPageEdit('${pageId}')" title="이 페이지 편집">
            <i class="ti ti-pencil"></i> 편집
          </button>
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
    return programs.map(p => `
      <div class="p-item">
        <div class="p-title">${p.title}</div>
        <div class="p-desc">
          <ul>${(p.items || []).map(i => `<li>${i}</li>`).join('')}</ul>
        </div>
      </div>`).join('');
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

    const opts = prices.map((price, idx) => {
      const gradeAttr = price.grade ? ` data-grade="${price.grade}"` : '';
      const noteHtml  = price.note ? `<div class="p-opt-note">${price.note}</div>` : '';
      const badgeHtml = price.badge
        ? ` <span style="font-size:11px;background:linear-gradient(135deg,#6c5ff5,#9b4dfc);color:#fff;padding:1px 7px;border-radius:8px;font-weight:600;vertical-align:middle;">${price.badge}</span>`
        : '';

      return `
        <label class="p-opt">
          <input type="checkbox"
            data-amt="${price.amt}"
            data-item-idx="${idx}"
            ${gradeAttr}
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
   * 9. 학생 저장 모달
   * ============================================================ */
  function openSaveStudentModal() {
    const existing = document.getElementById('student-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'student-modal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-box" style="width:400px;">
        <div class="modal-header">
          <span><i class="ti ti-user-plus"></i> 학생 저장</span>
          <button class="modal-close" onclick="document.getElementById('student-modal').remove()">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:14px;">
          <div>
            <label class="modal-label">학생명 *</label>
            <input class="admin-input" id="st-name" placeholder="예) 김수진" maxlength="10">
          </div>
          <div>
            <label class="modal-label">학교 + 학년 *</label>
            <input class="admin-input" id="st-school" placeholder="예) 대건고1" maxlength="15">
          </div>
          <div>
            <label class="modal-label">진로 목표 *</label>
            <input class="admin-input" id="st-goal" placeholder="예) 경영학" maxlength="20">
          </div>
          <div id="st-preview" style="font-size:12px;color:var(--text-3);padding:6px 0;">
            저장 키: —
          </div>
        </div>
        <div class="modal-footer">
          <button class="admin-cancel-btn"
            onclick="document.getElementById('student-modal').remove()">취소</button>
          <button class="admin-save-btn" onclick="UI.confirmSaveStudent()">
            <i class="ti ti-device-floppy"></i> 저장
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    // 실시간 키 미리보기
    ['st-name','st-school','st-goal'].forEach(id => {
      document.getElementById(id).addEventListener('input', _updateStudentKeyPreview);
    });

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
    const name   = document.getElementById('st-name')?.value.trim();
    const school = document.getElementById('st-school')?.value.trim();
    const goal   = document.getElementById('st-goal')?.value.trim();

    if (!name || !school || !goal) {
      showToast('모든 항목을 입력해 주세요', 'warn');
      return;
    }

    const key  = Store.buildStudentKey(name, school, goal);
    const snap = Calc.toSnapshot();
    const meta = { name, school, goal, grade: Calc.getGrade() };

    showToast('저장 중...', 'success');
    const ok = await Store.saveStudent(key, snap, meta);
    document.getElementById('student-modal')?.remove();

    if (ok) {
      await renderStudentDropdown();
      showToast(`✓ ${key} 저장 완료`, 'success');
    } else {
      showToast('저장 실패 — 네트워크 확인', 'error');
    }
  }


  /* ============================================================
   * 10. 학생 드롭다운 렌더링 / 로드 (비동기)
   * ============================================================ */
  async function renderStudentDropdown() {
    const sel = document.getElementById('student-select');
    if (!sel) return;

    sel.innerHTML = '<option value="">불러오는 중...</option>';
    try {
      const list = await Store.listStudents();
      let html = '<option value="">학생 선택...</option>';
      list.forEach(s => {
        const date = Store.formatDate(s.savedAt).split(' ')[0];
        html += `<option value="${s.key}">${s.key} (${date})</option>`;
      });
      sel.innerHTML = html;
    } catch (e) {
      sel.innerHTML = '<option value="">불러오기 실패</option>';
      showToast('학생 목록 로드 실패 — 네트워크 확인', 'error');
    }
  }

  async function loadSelectedStudent() {
    const sel = document.getElementById('student-select');
    if (!sel || !sel.value) return;

    showToast('불러오는 중...', 'success');
    const data = await Store.loadStudent(sel.value);
    if (!data) { showToast('학생 데이터를 찾을 수 없습니다', 'error'); return; }

    Calc.reset();
    Calc.fromSnapshot(data.selections);
    _syncGradeButtons(Calc.state.grade);
    renderPages();
    go(_currentPageId);
    showToast(`✓ ${sel.value} 불러오기 완료`, 'success');
  }

  function newSession() {
    const sel = document.getElementById('student-select');
    if (sel) sel.value = '';
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

  function openPageEdit(pageId) {
    // PIN 확인 후 편집 모달 열기
    _showPinModal(() => _openEditModal(pageId));
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

  function _openEditModal(pageId) {
    const config = MK_CONFIG.resolve();
    const page   = config.pages[pageId];
    if (!page) return;

    const existing = document.getElementById('page-edit-modal');
    if (existing) existing.remove();

    // programs 편집 행
    const programRows = (page.programs || []).map((p, idx) => `
      <div class="edit-program-row" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px;">
        <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
          <div class="p-num" style="flex-shrink:0;">${idx + 1}</div>
          <input class="admin-input" style="flex:1;" value="${p.title || ''}"
            oninput="window.mkEditDraft.pages['${pageId}'].programs[${idx}].title=this.value"
            placeholder="제목">
        </div>
        <textarea class="admin-input" rows="3" style="resize:vertical;"
          oninput="window.mkEditDraft.pages['${pageId}'].programs[${idx}].items=this.value.split('\\n').filter(Boolean)"
          placeholder="내용 (줄바꿈으로 항목 구분)">${(p.items || []).join('&#10;')}</textarea>
      </div>`).join('');

    // notes 편집 행
    const noteRows = (page.notes || []).map((n, idx) => `
      <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
        <select class="admin-input" style="width:80px;"
          onchange="window.mkEditDraft.pages['${pageId}'].notes[${idx}].color=this.value">
          ${['blue','amber','red','green'].map(c =>
            `<option value="${c}" ${n.color===c?'selected':''}>${c}</option>`).join('')}
        </select>
        <input class="admin-input" style="flex:1;" value="${n.text || ''}"
          oninput="window.mkEditDraft.pages['${pageId}'].notes[${idx}].text=this.value"
          placeholder="노트 내용">
      </div>`).join('');

    const modal = document.createElement('div');
    modal.id = 'page-edit-modal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-box" style="width:640px;max-height:85vh;">
        <div class="modal-header">
          <span><i class="ti ti-pencil"></i> ${page.title} 편집</span>
          <button class="modal-close" onclick="document.getElementById('page-edit-modal').remove()">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:16px;">
          <div>
            <div class="d-col-label" style="margin-bottom:8px;">프로그램 구성</div>
            ${programRows}
          </div>
          <div>
            <div class="d-col-label" style="margin-bottom:8px;">참고 노트</div>
            ${noteRows}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('page-edit-modal').remove()">취소</button>
          <button class="btn btn-primary" onclick="UI._savePageEdit('${pageId}')">
            <i class="ti ti-device-floppy"></i> 저장 및 반영
          </button>
        </div>
      </div>`;

    // _editDraft 초기화 — 전역 노출 (oninput에서 접근)
    _editDraft = JSON.parse(JSON.stringify(config));
    window.mkEditDraft = _editDraft;
    document.body.appendChild(modal);
  }

  function _savePageEdit(pageId) {
    if (!confirm('수정사항을 반영하시겠습니까?')) return;
    _editDraft = window.mkEditDraft;
    Store.saveConfig(_editDraft);
    document.getElementById('page-edit-modal')?.remove();
    renderPages();
    go(pageId);
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
    newSession,
    applyPackage,
    showToast,
    openPageEdit,
    _savePageEdit,
  };

})();


/* ============================================================
 * DOMContentLoaded 진입점
 * ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  UI.init();
});
