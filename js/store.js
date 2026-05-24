/**
 * store.js — 마이더스K 저장소 통합 래퍼
 *
 * 저장소 분리:
 *  - 학생 데이터  → Google Sheets API JSONP (CORS 우회, 여러 기기 공유)
 *  - 관리자 설정  → localStorage
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
    CONFIG:  'mk_config',
    SESSION: 'mk_session',
    LOG:     'mk_admin_log',
    CACHE:   'mk_stu_cache',
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
   * 3. Google Sheets API 호출 — JSONP 방식 (CORS 우회)
   * ============================================================ */
  function _sheetsCall(params) {
    return new Promise((resolve, reject) => {
      const cbName = '_mkCb_' + Math.random().toString(36).slice(2);

      const timer = setTimeout(() => {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('Sheets API 타임아웃'));
      }, 10000);

      window[cbName] = function(data) {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(data);
      };

      const script = document.createElement('script');
      const p = Object.assign({}, params, { callback: cbName });
      script.src = SHEETS_API + '?' + new URLSearchParams(p).toString();
      script.onerror = () => {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('Sheets API 로드 실패'));
      };
      document.head.appendChild(script);
    });
  }


  /* ============================================================
   * 4. 관리자 설정값 — localStorage
   * ============================================================ */
  function saveConfig(data) { return _write(KEYS.CONFIG, data); }
  function loadConfig()     { return _read(KEYS.CONFIG); }
  function clearConfig()    { _remove(KEYS.CONFIG); }


  /* ============================================================
   * 5. 학생 프로필 — Google Sheets JSONP
   * ============================================================ */
  function buildStudentKey(name, school, goal) {
    const base  = `${name}_${school}_${goal}`;
    const cache = _read(KEYS.CACHE) || [];
    const keys  = cache.map(s => s.key);
    if (!keys.includes(base)) return base;
    let n = 2;
    while (keys.includes(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

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

  async function listStudents() {
    try {
      const data = await _sheetsCall({ action: 'list' });
      const list = (data.students || []).map(s => ({
        key:    s.key,
        meta:   { name: s.name, school: s.school, goal: s.goal, grade: s.grade },
        savedAt: s.savedAt,
        _selections: s.selections,
      }));
      list.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      _write(KEYS.CACHE, list);
      return list;
    } catch (e) {
      console.error('[Store] listStudents 실패 — 캐시 사용:', e);
      return _read(KEYS.CACHE) || [];
    }
  }

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
    try {
      const data  = await _sheetsCall({ action: 'list' });
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

  async function deleteStudent(key) {
    try {
      await _sheetsCall({ action: 'delete', key });
      const cache = (_read(KEYS.CACHE) || []).filter(s => s.key !== key);
      _write(KEYS.CACHE, cache);
      return true;
    } catch (e) {
      console.error('[Store] deleteStudent 실패:', e);
      return false;
    }
  }

  function clearStudentsCache() { _remove(KEYS.CACHE); }


  /* ============================================================
   * 6. 세션 — localStorage
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
   * 8. PIN — localStorage
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
   * 9. 날짜 포맷
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
    saveConfig, loadConfig, clearConfig,
    buildStudentKey, saveStudent, loadStudent,
    listStudents, deleteStudent, clearStudentsCache,
    saveSession, loadSession, clearSession,
    addLog, getLog, clearLog,
    getPin, savePin, verifyPin,
    formatDate,
  };

})();
