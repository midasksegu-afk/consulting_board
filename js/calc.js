/**
 * calc.js — 마이더스K 합산 엔진
 *
 * v7 제거 대상:
 *   - checked{} uid 객체 → Calc.state.pages / Calc.state.ov 로 대체
 *   - recalcAll() DOM 스캔 방식 → state 기반 순수 계산으로 대체
 *   - initDefaults() → 없음 (초기 합산 없음)
 *   - toggleGrade 재정의 래핑 → Calc.setGrade() 단일 함수
 *   - ovChkChange() → Calc.selectOv() 로 대체
 *
 * 로드 순서: config.js → store.js → calc.js → ui.js
 */

const Calc = (() => {

  /* ============================================================
   * 1. 런타임 Config 참조
   *    store에 저장된 관리자 변경값이 있으면 merge된 값 사용
   * ============================================================ */
  function cfg() {
    return MK_CONFIG.resolve();
  }


  /* ============================================================
   * 2. 단일 State
   * ============================================================ */
  const state = {
    grade:       0,   // 현재 선택 학년 (0 = 미선택)
    ov:          {},  // 연간관리형 카드 선택 { 'rm-a': { amt:2300000 }, ... }
    pages:       {},  // 상세 페이지 체크 { 'rm-a': Set([0,1,...]), 'rm-d': Set([0,1]) }
    pageVisited: {},  // 첫 진입 여부 { 'rm-d': true }
    dc:          { roadmap: false, individual: false }, // DC 토글 상태
  };


  /* ============================================================
   * 3. 학년 관리
   * ============================================================ */

  /**
   * price.grade 와 현재 state.grade 가 맞는지 확인
   * grade 없는 항목(학년 무관)은 항상 true
   * grade 있는 항목은 현재 학년과 일치할 때만 true
   */
  function _gradeMatch(price) {
    if (!price.grade) return true;               // grade 없음 → 학년 무관, 항상 포함
    if (state.grade === 0) return true;          // 학년 미선택 → 전체 포함
    // '1,2,3' 복수값 처리 — 쉼표 구분 배열로 분리 후 포함 여부 확인
    const grades = String(price.grade).split(',').map(g => Number(g.trim()));
    return grades.includes(state.grade);
  }

  /**
   * 학년 토글 (같은 학년 재클릭 → 해제)
   * @returns {number} 변경 후 grade
   */
  function setGrade(n) {
    if (state.grade === n) {
      state.grade = 0;
    } else {
      state.grade = n;
    }

    // 학년 무관 페이지 선택값 보존 — prices 전체에 grade 속성이 없는 페이지
    // (학년 변경과 무관한 상품이므로 초기화 대상에서 제외)
    const config = cfg();
    const gradeAgnosticPages = {};
    const gradeAgnosticOv    = {};
    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = config.pages[pageId];
      if (!page) return;
      const prices = page.prices || [];
      const isGradeAgnostic = prices.length > 0 && prices.every(p => !p.grade);
      if (!isGradeAgnostic) return;
      if (state.pages[pageId]) gradeAgnosticPages[pageId] = state.pages[pageId];
      if (state.ov[pageId])    gradeAgnosticOv[pageId]    = state.ov[pageId];
    });

    // 학년 바뀌면 전체 선택 초기화
    state.ov          = {};
    state.pages       = {};
    state.pageVisited = {};

    // 학년 무관 페이지 선택값 복원
    Object.assign(state.pages, gradeAgnosticPages);
    Object.assign(state.ov,    gradeAgnosticOv);

    // 학년 선택 시 rm-d/e isDefault 항목 즉시 자동 체크
    if (state.grade !== 0) {
      _autoCheckDefaults();
    }

    _notifyChange();
    return state.grade;
  }

  /**
   * autoCheck 페이지의 isDefault 항목을 즉시 체크 (페이지 진입 불필요)
   */
  function _autoCheckDefaults() {
    const config = cfg();
    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = config.pages[pageId];
      if (!page || !page.autoCheck) return;
      state.pageVisited[pageId] = true;
      if (!state.pages[pageId]) state.pages[pageId] = new Set();
      (page.prices || []).forEach((price, idx) => {
        if (price.isDefault) state.pages[pageId].add(idx);
      });
    });
  }

  function getGrade() {
    return state.grade;
  }


  /* ============================================================
   * 4. 연간관리형 카드 체크 (rm-a / rm-b / rm-c)
   * ============================================================ */

  /**
   * @param {string}  pageId   'rm-a' | 'rm-b' | 'rm-c'
   * @param {boolean} checked
   * @returns {boolean} 성공 여부 (학년 미선택 시 false)
   */
  function selectOv(pageId, checked) {
    if (state.grade === 0) return false; // 학년 미선택

    const page = cfg().pages[pageId];
    if (!page || !page.ovCard || page.ovCard.fixed) return false;

    if (checked) {
      const amt = (page.ovCard.ovPrices || {})[state.grade] || 0;
      state.ov[pageId] = { amt };
    } else {
      delete state.ov[pageId];
    }

    _notifyChange();
    return true;
  }

  function isOvSelected(pageId) {
    return !!state.ov[pageId];
  }


  /* ============================================================
   * 5. 상세 페이지 체크박스
   * ============================================================ */

  /**
   * @param {string}  pageId
   * @param {number}  itemIdx  prices[] 배열 인덱스
   * @param {boolean} checked
   */
  function selectItem(pageId, itemIdx, checked) {
    if (!state.pages[pageId]) {
      state.pages[pageId] = new Set();
    }
    if (checked) {
      state.pages[pageId].add(itemIdx);
    } else {
      state.pages[pageId].delete(itemIdx);
    }
    // 세션 자동 저장
    Store.saveSession(toSnapshot());
    _notifyChange();
  }

  function isItemSelected(pageId, itemIdx) {
    return !!(state.pages[pageId] && state.pages[pageId].has(itemIdx));
  }


  /* ============================================================
   * 6. 자동 체크 (rm-d / rm-e 첫 진입 시)
   * ============================================================ */

  /**
   * autoCheck 플래그가 있는 페이지의 isDefault 항목을 자동 체크
   * pageVisited 플래그로 중복 방지
   */
  function autoCheckPage(pageId) {
    if (state.pageVisited[pageId]) return; // 이미 진입했음
    state.pageVisited[pageId] = true;

    const page = cfg().pages[pageId];
    if (!page || !page.autoCheck) return;

    if (!state.pages[pageId]) state.pages[pageId] = new Set();

    (page.prices || []).forEach((price, idx) => {
      if (price.isDefault) {
        state.pages[pageId].add(idx);
      }
    });

    Store.saveSession(toSnapshot());
    _notifyChange();
  }


  /* ============================================================
   * 7. 합계 계산
   * ============================================================ */

  /**
   * 특정 그룹의 합계 반환
   * @param {'roadmap'|'individual'|'strategy'} group
   */
  function getGroupTotal(group) {
    const config = cfg();
    let sum = 0;

    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = config.pages[pageId];
      if (!page || page.isOverview) return;

      // calcGroup 플래그 있으면 해당 값으로 버킷 판단, 없으면 group 사용
      const effectiveGroup = page.calcGroup || page.group;
      if (effectiveGroup !== group) return;

      // 연간관리형 카드 체크 금액
      if (state.ov[pageId]) {
        sum += state.ov[pageId].amt;
        return;
      }

      // ov 미선택 시만 상세 페이지 체크 금액 합산
      const sel = state.pages[pageId];
      if (sel && sel.size > 0) {
        sel.forEach(idx => {
          const price = (page.prices || [])[idx];
          if (price && _gradeMatch(price)) sum += price.amt;
        });
      }
    });

    return sum;
  }

  /**
   * 3개 그룹 합계 동시 반환
   * @returns {{ roadmap, individual, strategy, grand }}
   */
  function getAllTotals() {
    const roadmap    = getGroupTotal('roadmap');
    const individual = getGroupTotal('individual');
    const strategy   = getGroupTotal('strategy');
    return {
      roadmap,
      individual,
      strategy,
      grand: roadmap + individual + strategy,
    };
  }

  /**
   * 특정 페이지의 로컬 합계 (상세 페이지 하단 표시용)
   */
  function getPageTotal(pageId) {
    const config = cfg();
    const page   = config.pages[pageId];
    if (!page) return 0;

    let sum = 0;

    // ov 카드 금액 포함 (rm-a/b/c)
    if (state.ov[pageId]) sum += state.ov[pageId].amt;

    // 상세 체크 금액
    const sel = state.pages[pageId];
    if (sel) {
      sel.forEach(idx => {
        const price = (page.prices || [])[idx];
        if (price && _gradeMatch(price)) sum += price.amt;
      });
    }

    return sum;
  }


  /* ============================================================
   * 8. 스냅샷 — 학생 저장 / 세션 복원
   * ============================================================ */

  /**
   * 현재 state를 직렬화 (Set → Array 변환)
   */
  function toSnapshot() {
    const pagesSerial = {};
    Object.keys(state.pages).forEach(pid => {
      pagesSerial[pid] = Array.from(state.pages[pid]);
    });
    return {
      grade:       state.grade,
      ov:          { ...state.ov },
      pages:       pagesSerial,
      pageVisited: { ...state.pageVisited },
      dc:          { ...state.dc },
    };
  }

  /**
   * 스냅샷으로 state 복원 후 UI 갱신 트리거
   */
  function fromSnapshot(snapshot) {
    if (!snapshot) return;

    state.grade = snapshot.grade || 0;
    state.ov    = snapshot.ov    || {};

    state.pages = {};
    const pagesData = snapshot.pages || {};
    Object.keys(pagesData).forEach(pid => {
      state.pages[pid] = new Set(pagesData[pid]);
    });

    state.pageVisited = snapshot.pageVisited || {};
    if (snapshot.dc) {
      state.dc = { roadmap: !!snapshot.dc.roadmap, individual: !!snapshot.dc.individual };
    }

    _notifyChange();
  }


  /* ============================================================
   * 9. 전체 초기화
   * ============================================================ */
  function reset() {
    state.grade       = 0;
    state.ov          = {};
    state.pages       = {};
    state.pageVisited = {};
    state.dc          = { roadmap: false, individual: false };
    Store.clearSession();
    _notifyChange();
  }


  /* ============================================================
   * 10. 변경 알림 — ui.js 가 구독
   *     UI 레이어와 완전 분리: Calc는 DOM을 모름
   * ============================================================ */
  const _listeners = [];

  function onChange(fn) {
    _listeners.push(fn);
  }

  function _notifyChange() {
    const totals = getAllTotals();
    _listeners.forEach(fn => fn(totals, state));
  }


  /* ============================================================
   * DC 할인 토글
   * ============================================================ */

  /**
   * DC 토글 — 같은 그룹 재클릭 시 해제
   * @param {'roadmap'|'individual'} group
   */
  function toggleDc(group) {
    state.dc[group] = !state.dc[group];
    _notifyChange();
    return state.dc[group];
  }

  function isDcActive(group) {
    return !!state.dc[group];
  }

  /**
   * DC 적용된 그룹 합계 반환
   * calcGroup 플래그 있는 페이지는 어떤 DC도 적용하지 않음
   */
  function getDcTotal(group) {
    if (!state.dc[group]) return getGroupTotal(group);
    const disc   = (cfg().discount || {})[group];
    const config = cfg();

    // 로드맵 DC: calcGroup 없는 순수 roadmap 페이지에만 할인율 적용
    if (group === 'roadmap') {
      const rate = typeof disc === 'number' ? disc : 0;
      let dcSum = 0;

      MK_CONFIG.pageOrder.forEach(pageId => {
        const page = config.pages[pageId];
        // calcGroup 있는 페이지(rm-c 등)는 roadmap DC 계산에서 완전 제외
        if (!page || page.group !== 'roadmap' || page.isOverview || page.calcGroup) return;

        let pageAmt = 0;
        if (state.ov[pageId]) {
          pageAmt = state.ov[pageId].amt;
        } else {
          const sel = state.pages[pageId];
          if (sel) sel.forEach(idx => {
            const price = (page.prices || [])[idx];
            if (price && _gradeMatch(price)) pageAmt += price.amt;
          });
        }
        dcSum += pageAmt;
      });

      // calcGroup 페이지 금액은 DC 없이 그대로 getGroupTotal('individual')에 포함됨
      return Math.round(dcSum * (1 - rate / 100));
    }

    // 개별 DC: calcGroup='individual' 페이지는 DC 제외 (이미 자체 할인된 금액)
    if (group === 'individual' && typeof disc === 'object') {
      let sum = 0;
      MK_CONFIG.pageOrder.forEach(pageId => {
        const page = config.pages[pageId];
        const effectiveGroup = page?.calcGroup || page?.group;
        if (!page || effectiveGroup !== 'individual' || page.isOverview) return;

        // calcGroup 플래그 페이지는 DC 적용 제외 — 자체 할인 내장 상품
        if (page.calcGroup) {
          let pageAmt = 0;
          if (state.ov[pageId]) pageAmt = state.ov[pageId].amt;
          else {
            const sel = state.pages[pageId];
            if (sel) sel.forEach(idx => {
              const price = (page.prices || [])[idx];
              if (price && _gradeMatch(price)) pageAmt += price.amt;
            });
          }
          sum += pageAmt; // DC 없이 원금 그대로
          return;
        }

        // 순수 individual 페이지 — 항목별 할인율 적용
        let pageSum = 0;
        if (state.ov[pageId]) pageSum += state.ov[pageId].amt;
        else {
          const sel = state.pages[pageId];
          if (sel) sel.forEach(idx => {
            const price = (page.prices || [])[idx];
            if (price && _gradeMatch(price)) pageSum += price.amt;
          });
        }
        const rate = disc[pageId] || 0;
        sum += Math.round(pageSum * (1 - rate / 100));
      });
      return sum;
    }

    return getGroupTotal(group);
  }

  /**
   * DC 적용된 전체 합계
   */
  function getAllTotalsDc() {
    const roadmap    = getDcTotal('roadmap');
    const individual = getDcTotal('individual');
    const strategy   = getGroupTotal('strategy');
    return {
      roadmap,
      individual,
      strategy,
      grand: roadmap + individual + strategy,
    };
  }

  /* ============================================================
   * Public API
   * ============================================================ */
  return {
    // 학년
    setGrade, getGrade,
    // 연간관리형 카드
    selectOv, isOvSelected,
    // 상세 페이지 체크
    selectItem, isItemSelected,
    // 자동 체크
    autoCheckPage,
    // 합계
    getGroupTotal, getAllTotals, getPageTotal,
    // 스냅샷
    toSnapshot, fromSnapshot,
    // 초기화
    reset,
    // DC 할인
    toggleDc, isDcActive, getDcTotal, getAllTotalsDc,
    // 변경 구독
    onChange,
    // state 직접 참조 (읽기 전용)
    get state() { return state; },
  };

})();
