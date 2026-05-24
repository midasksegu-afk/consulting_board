/**
 * store.js — 마이더스K 저장소 통합 래퍼
 *
 * 저장소 분리:
 *  - 학생 데이터  → Google Sheets API (여러 기기 공유)
 *  - 관리자 설정  → localStorage (기기별 유지)
 *  - 세션/로그    → localStorage
 *
 * 로드 순서: config.js → store.js → calc.js → ui.js
 */

const Store = (() => {

  /* ============================================================
   * 1. 상수
   * ============================================================ */
  const SHEETS_API = 'https://script.google.com/macros/s/AKfycbxpiju5yZc08gQx0DI1skuVJ5lP_ZgucVJ8xDYFTl9zfvn7iDwKdEcStCaJThCJ6cG03w/exec';

  const KEYS = {
    CONFIG:  'mk_config',    // 관리자 변경값 (금액·메뉴명·콘텐츠·PIN)
    SESSION: 'mk_session',   // 현재 세션 임시 선택값
    LOG:     'mk_admin_log', // 관리자 변경 이력
    CACHE:   'mk_stu_cache', // 학생 목록 로컬 캐시 (오프라인 대비)
  };


  /* ============================================================
   * 2. localStorage 내부 유틸
   * ============================================================ */
  function _read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[Store] read error:', key, e);
      return null;
    }
  }

  function _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[Store] write error:', key, e);
      return false;
    }
  }

  function _remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }


  /* ============================================================
   * 3. Google Sheets API 호출 유틸
   * ============================================================ */
  async function _sheetsCall(params) {
    const url = SHEETS_API + '?' + new URLSearchParams(params).toString();
    const res  = await fetch(url);
    if (!res.ok) throw new Error('Sheets API 오류: ' + res.status);
    return await res.json();
  }


  /* ============================================================
   * 4. 관리자 설정값 — localStorage
   * ============================================================ */
  function saveConfig(data) { return _write(KEYS.CONFIG, data); }
  function loadConfig()     { return _read(KEYS.CONFIG); }
  function clearConfig()    { _remove(KEYS.CONFIG); }


  /* ============================================================
   * 5. 학생 프로필 — Google Sheets
   *
   *    키 형식: 이름_학교학년_진로목표
   *    예시:    김수진_대건고1_경영학
   * ============================================================ */

  /**
   * 학생 키 생성
   * 중복 확인은 listStudents() 캐시 기반
   */
  function buildStudentKey(name, school, goal) {
    const base  = `${name}_${school}_${goal}`;
    const cache = _read(KEYS.CACHE) || [];
    const keys  = cache.map(s => s.key);
    if (!keys.includes(base)) return base;
    let n = 2;
    while (keys.includes(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

  /**
   * 학생 저장 (비동기)
   * @returns Promise<boolean>
   */
  async function saveStudent(key, selections, meta) {
    const savedAt = new Date().toISOString();
    try {
      await _sheetsCall({
        action:     'save',
        key,
        name:       meta.name,
        school:     meta.school,
        goal:       meta.goal,
        grade:      meta.grade,
        selections: JSON.stringify(selections),
        savedAt,
      });
      // 캐시 업데이트
      const cache = _read(KEYS.CACHE) || [];
      const idx   = cache.findIndex(s => s.key === key);
      const entry = { key, meta, savedAt };
      if (idx >= 0) cache[idx] = entry;
      else cache.unshift(entry);
      _write(KEYS.CACHE, cache);
      return true;
    } catch (e) {
      console.error('[Store] saveStudent 실패:', e);
      return false;
    }
  }

  /**
   * 학생 목록 불러오기 (비동기)
   * @returns Promise<[{ key, meta, savedAt }]>
   */
  async function listStudents() {
    try {
      const data = await _sheetsCall({ action: 'list' });
      const list = (data.students || []).map(s => ({
        key:    s.key,
        meta:   { name: s.name, school: s.school, goal: s.goal, grade: s.grade },
        savedAt: s.savedAt,
        // selections는 필요할 때만 loadStudent()로 가져옴
        _selections: s.selections,
      }));
      // 최신순 정렬 후 캐시 저장
      list.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      _write(KEYS.CACHE, list);
      return list;
    } catch (e) {
      console.error('[Store] listStudents 실패 — 캐시 사용:', e);
      return _read(KEYS.CACHE) || [];
    }
  }

  /**
   * 특정 학생 선택값 로드 (비동기)
   * 캐시에 있으면 캐시 우선 사용
   */
  async function loadStudent(key) {
    const cache = _read(KEYS.CACHE) || [];
    const hit   = cache.find(s => s.key === key);
    if (hit && hit._selections) {
      return {
        meta:       hit.meta,
        selections: typeof hit._selections === 'string'
          ? JSON.parse(hit._selections)
          : hit._selections,
        savedAt: hit.savedAt,
      };
    }
    // 캐시 미스 → 전체 목록 재요청
    try {
      const data = await _sheetsCall({ action: 'list' });
      const found = (data.students || []).find(s => s.key === key);
      if (!found) return null;
      return {
        meta:       { name: found.name, school: found.school, goal: found.goal, grade: found.grade },
        selections: typeof found.selections === 'string'
          ? JSON.parse(found.selections)
          : found.selections,
        savedAt: found.savedAt,
      };
    } catch (e) {
      console.error('[Store] loadStudent 실패:', e);
      return null;
    }
  }

  /**
   * 학생 삭제 (비동기)
   */
  async function deleteStudent(key) {
    try {
      await _sheetsCall({ action: 'delete', key });
      // 캐시에서도 제거
      const cache = (_read(KEYS.CACHE) || []).filter(s => s.key !== key);
      _write(KEYS.CACHE, cache);
      return true;
    } catch (e) {
      console.error('[Store] deleteStudent 실패:', e);
      return false;
    }
  }

  /**
   * 전체 학생 캐시 초기화 (관리자용)
   */
  function clearStudentsCache() {
    _remove(KEYS.CACHE);
  }


  /* ============================================================
   * 6. 세션 임시 저장 — localStorage
   * ============================================================ */
  function saveSession(data) { return _write(KEYS.SESSION, data); }
  function loadSession()     { return _read(KEYS.SESSION); }
  function clearSession()    { _remove(KEYS.SESSION); }


  /* ============================================================
   * 7. 관리자 변경 이력 — localStorage
   * ============================================================ */
  function addLog(category, label, before, after) {
    const log = _read(KEYS.LOG) || [];
    log.unshift({ at: new Date().toISOString(), category, label, before, after });
    if (log.length > 200) log.splice(200);
    return _write(KEYS.LOG, log);
  }
  function getLog()   { return _read(KEYS.LOG) || []; }
  function clearLog() { _remove(KEYS.LOG); }


  /* ============================================================
   * 8. PIN — localStorage (mk_config 내 포함)
   * ============================================================ */
  function getPin() {
    const cfg = loadConfig();
    return (cfg && cfg.adminPin) ? cfg.adminPin : MK_CONFIG.app.adminPin;
  }
  function savePin(newPin) {
    const cfg = loadConfig() || {};
    cfg.adminPin = newPin;
    const ok = saveConfig(cfg);
    if (ok) addLog('pin', '관리자 PIN', '****', '****');
    return ok;
  }
  function verifyPin(input) { return input === getPin(); }


  /* ============================================================
   * 9. 날짜 포맷 유틸
   * ============================================================ */
  function formatDate(isoString) {
    if (!isoString) return '—';
    const d   = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} `
         + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }


  /* ============================================================
   * Public API
   * ============================================================ */
  return {
    // 관리자 설정
    saveConfig, loadConfig, clearConfig,
    // 학생 (비동기)
    buildStudentKey, saveStudent, loadStudent,
    listStudents, deleteStudent, clearStudentsCache,
    // 세션
    saveSession, loadSession, clearSession,
    // 로그
    addLog, getLog, clearLog,
    // PIN
    getPin, savePin, verifyPin,
    // 유틸
    formatDate,
  };

})();
