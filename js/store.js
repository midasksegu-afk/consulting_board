/**
 * store.js — 마이더스K 저장소 통합 래퍼
 *
 * 저장소 분리:
 *  - 학생 데이터  → Supabase REST API (students 테이블)
 *  - 관리자 설정  → Supabase REST API (app_config 테이블) + localStorage 캐시
 *  - 세션/로그    → localStorage
 *
 * 로드 순서: config.js → store.js → calc.js → ui.js
 */

const Store = (() => {

  /* ============================================================
   * 1. Supabase 설정
   * ============================================================ */
  const SUPABASE_URL = 'https://rigdvsxjqzaojwhvucpr.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_FcoQJ-2-LU5ctB-JVzFfEQ_4DvLWt9n';
  const TABLE        = 'students';
  const CONFIG_TABLE   = 'app_config';
  const _configChannel = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel('mk_config_sync') : null;

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
   * 3. Supabase REST API 공통 호출
   * ============================================================ */
  function _headers(extra = {}) {
    return {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...extra,
    };
  }

  async function _sbGet(query = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}${query}`, {
      method:  'GET',
      headers: _headers({ 'Accept': 'application/json' }),
    });
    if (!res.ok) throw new Error(`Supabase GET 실패: ${res.status}`);
    return res.json();
  }

  async function _sbUpsert(row) {
    // key 기준 존재 확인 후 PATCH(update) or POST(insert)
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(row.key)}&select=key&limit=1`,
      { method: 'GET', headers: _headers({ 'Accept': 'application/json' }) }
    );
    if (!checkRes.ok) throw new Error(`Supabase CHECK 실패: ${checkRes.status}`);
    const existing = await checkRes.json();

    if (existing && existing.length > 0) {
      // 이미 존재 → PATCH
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(row.key)}`,
        {
          method:  'PATCH',
          headers: _headers({ 'Prefer': 'return=minimal' }),
          body:    JSON.stringify(row),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase PATCH 실패: ${res.status} ${err}`);
      }
    } else {
      // 없음 → POST
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
        method:  'POST',
        headers: _headers({ 'Prefer': 'return=minimal' }),
        body:    JSON.stringify(row),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase INSERT 실패: ${res.status} ${err}`);
      }
    }
    return true;
  }

  async function _sbDelete(key) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}`,
      { method: 'DELETE', headers: _headers() }
    );
    if (!res.ok) throw new Error(`Supabase DELETE 실패: ${res.status}`);
    return true;
  }


  /* ============================================================
   * 4. 관리자 설정값 — Supabase app_config + localStorage 캐시
   *
   *  saveConfig           : localStorage 즉시 + Supabase 백그라운드 저장
   *  loadConfig           : localStorage 캐시 반환 (동기 — 기존 호출부 무변경)
   *  syncConfigFromServer : Supabase → localStorage 동기화 (초기화 시 1회 호출)
   * ============================================================ */
  async function saveConfig(data) {
    // Supabase 먼저 저장 (Primary) — 완료 확인 후 localStorage 캐시
    try {
      const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/${CONFIG_TABLE}?key=eq.settings`, {
        method: 'GET',
        headers: _headers({ 'Accept': 'application/json' }),
      });
      if (!checkRes.ok) throw new Error(`status ${checkRes.status}`);
      const rows   = await checkRes.json();
      const method = (rows && rows.length > 0) ? 'PATCH' : 'POST';
      const url    = method === 'PATCH'
        ? `${SUPABASE_URL}/rest/v1/${CONFIG_TABLE}?key=eq.settings`
        : `${SUPABASE_URL}/rest/v1/${CONFIG_TABLE}`;
      const saveRes = await fetch(url, {
        method,
        headers: _headers({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ key: 'settings', data, updated_at: new Date().toISOString() }),
      });
      if (!saveRes.ok) throw new Error(`status ${saveRes.status}`);
    } catch (e) {
      console.warn('[Store] saveConfig → Supabase 실패:', e);
      throw e; // 호출부에서 실패 처리
    }
    // Supabase 저장 완료 후 localStorage 캐시
    _write(KEYS.CONFIG, data);
    _configChannel?.postMessage({ type: 'config_updated' });
    return true;
  }

  function loadConfig() {
    return _read(KEYS.CONFIG);
  }

  function clearConfig() {
    _remove(KEYS.CONFIG);
    fetch(`${SUPABASE_URL}/rest/v1/${CONFIG_TABLE}?key=eq.settings`, {
      method: 'DELETE', headers: _headers(),
    }).catch(() => {});
  }

  async function syncConfigFromServer() {
    try {
      const res  = await fetch(
        `${SUPABASE_URL}/rest/v1/${CONFIG_TABLE}?key=eq.settings&select=data&limit=1`,
        { method: 'GET', headers: _headers({ 'Accept': 'application/json' }) }
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const rows = await res.json();
      if (rows && rows.length > 0 && rows[0].data) {
        const data = rows[0].data;
        _write(KEYS.CONFIG, data);
        // 저장된 pageOrder가 있으면 런타임에 반영
        if (data._pageOrder && Array.isArray(data._pageOrder) && typeof MK_CONFIG !== 'undefined') {
          MK_CONFIG.pageOrder = data._pageOrder;
        }
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[Store] syncConfigFromServer 실패 (로컬 캐시 유지):', e);
      return false;
    }
  }


  /* ============================================================
   * 5. 학생 프로필 — Supabase
   * ============================================================ */
  function buildStudentKey(name, school, goal) {
    const base  = `${name}_${school}_${goal}`;  // 학년은 meta.grade로만 저장
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
      await _sbUpsert({
        key,
        name:       meta.name,
        school:     meta.school,
        goal:       meta.goal,
        grade:      meta.grade,
        selections: selections,   // jsonb — 객체 그대로 전달
        saved_at:   savedAt,
      });

      // 로컬 캐시 갱신
      const cache = _read(KEYS.CACHE) || [];
      const idx   = cache.findIndex(s => s.key === key);
      const entry = { key, meta, savedAt, _selections: selections };
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
      const rows = await _sbGet('?select=*&order=saved_at.desc');
      const list = rows.map(r => ({
        key:         r.key,
        meta:        { name: r.name, school: r.school, goal: r.goal, grade: r.grade },
        savedAt:     r.saved_at,
        _selections: r.selections,
      }));
      _write(KEYS.CACHE, list);
      return list;
    } catch (e) {
      console.error('[Store] listStudents 실패 — 캐시 사용:', e);
      return _read(KEYS.CACHE) || [];
    }
  }

  async function loadStudent(key) {
    // 1) 캐시 우선
    const cache = _read(KEYS.CACHE) || [];
    const hit   = cache.find(s => s.key === key);
    if (hit && hit._selections) {
      return {
        meta:       hit.meta,
        selections: hit._selections,
        savedAt:    hit.savedAt,
      };
    }

    // 2) Supabase 직접 조회
    try {
      const rows = await _sbGet(
        `?key=eq.${encodeURIComponent(key)}&select=*&limit=1`
      );
      if (!rows || rows.length === 0) return null;
      const r = rows[0];
      return {
        meta:       { name: r.name, school: r.school, goal: r.goal, grade: r.grade },
        selections: r.selections,
        savedAt:    r.saved_at,
      };
    } catch (e) {
      console.error('[Store] loadStudent 실패:', e);
      return null;
    }
  }

  async function deleteStudent(key) {
    try {
      await _sbDelete(key);
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
    // app.adminPin 우선, 그 다음 adminPin, 없으면 기본값
    if (cfg && cfg.app && cfg.app.adminPin) return cfg.app.adminPin;
    if (cfg && cfg.adminPin) return cfg.adminPin;
    return MK_CONFIG.app.adminPin;
  }
  function savePin(newPin) {
    const cfg = loadConfig() || {};
    cfg.adminPin = newPin;
    if (!cfg.app) cfg.app = {};
    cfg.app.adminPin = newPin;   // getPin()의 우선 참조 경로와 일치
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
    saveConfig, loadConfig, clearConfig, syncConfigFromServer,
    buildStudentKey, saveStudent, loadStudent,
    listStudents, deleteStudent, clearStudentsCache,
    saveSession, loadSession, clearSession,
    addLog, getLog, clearLog,
    getPin, savePin, verifyPin,
    formatDate,
  };

})();
