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
  };


  /* ============================================================
   * 3. 학년 관리
   * ============================================================ */

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
    // 학년 바뀌면 연간관리형 카드 선택 초기화
    state.ov = {};
    _notifyChange();
    return state.grade;
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
      if (!page || page.group !== group || page.isOverview) return;

      // 연간관리형 카드 체크 금액 (rm-a/b/c)
      if (state.ov[pageId]) {
        sum += state.ov[pageId].amt;
      }

      // 상세 페이지 체크 금액
      const sel = state.pages[pageId];
      if (sel && sel.size > 0) {
        sel.forEach(idx => {
          const price = (page.prices || [])[idx];
          if (price) sum += price.amt;
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
        if (price) sum += price.amt;
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
    // 변경 구독
    onChange,
    // state 직접 참조 (읽기 전용)
    get state() { return state; },
  };

})();
