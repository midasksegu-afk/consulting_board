/**
 * portfolio.js — 컨설팅 포트폴리오 출력 / 인쇄
 *
 * 로드 순서: config.js → store.js → calc.js → ui.js → portfolio.js
 */

const Portfolio = (() => {

  function fmt(n) {
    if (n === 0) return '0원';
    const man = Math.round(n / 10000);
    return man > 0 ? `${man.toLocaleString('ko-KR')}만원` : `${n.toLocaleString('ko-KR')}원`;
  }

  function today() {
    const d = new Date();
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`;
  }


  /* ============================================================
   * 1. 선택 항목 수집
   * ============================================================ */
  function _collectItems() {
    const config  = MK_CONFIG.resolve();
    const state   = Calc.state;
    const result  = { roadmap: [], individual: [], strategy: [] };

    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = config.pages[pageId];
      if (!page || page.isOverview) return;

      // calcGroup 플래그 있으면 해당 버킷, 없으면 group 사용
      const effectiveGroup = page.calcGroup || page.group;
      const bucket = result[effectiveGroup];
      if (!bucket) return;

      // 연간관리형 카드 선택 (rm-a/b/c)
      if (state.ov[pageId]) {
        bucket.push({
          pageTitle: page.sbLabel,
          label:     `${page.sbLabel} (연간관리형)`,
          amt:       state.ov[pageId].amt,
          isOv:      true,
        });
      }

      // 상세 페이지 체크 항목
      const sel = state.pages[pageId];
      if (sel && sel.size > 0) {
        sel.forEach(idx => {
          const price = (page.prices || [])[idx];
          if (!price) return;
          bucket.push({
            pageTitle: page.sbLabel,
            label:     `${page.sbLabel} — ${price.label}`,
            amt:       price.amt,
            isOv:      false,
          });
        });
      }
    });

    // 선택된 pageId 목록 (순서 유지, 중복 제거)
    const selectedPageIds = [];
    MK_CONFIG.pageOrder.forEach(pageId => {
      const page = config.pages[pageId];
      if (!page || page.isOverview) return;
      const hasOv  = !!state.ov[pageId];
      const hasSel = state.pages[pageId] && state.pages[pageId].size > 0;
      if ((hasOv || hasSel) && !selectedPageIds.includes(pageId)) {
        selectedPageIds.push(pageId);
      }
    });
    result.selectedPageIds = selectedPageIds;

    return result;
  }


  /* ============================================================
   * 2. 출력물 HTML 생성
   * ============================================================ */
  function _buildHTML(items, studentKey) {
    const config   = MK_CONFIG.resolve();
    const totals   = Calc.getAllTotals();
    const totalsDc = Calc.isSelectDcActive()
      ? Calc.getAllTotalsDcWithSelect()
      : Calc.getAllTotalsDc();
    // 2학기DC 차감액
    const semDisc  = totalsDc.semDisc || 0;
    // 개별가DC 차감액
    const indDiscAmt = totals.individual - totalsDc.individual;

    // 학생 정보 파싱 (tb-title: 이름 · 학교 · 학년 · 진로목표)
    const parts     = (studentKey || '').split(' · ');
    const stuName   = parts[0]?.trim() || '';
    const stuSchool = parts[1]?.trim() || '';
    const gradeStr  = parts[2]?.trim() || '학년 미선택';  // tb-title에서 직접 취득
    const stuGoal   = parts[3]?.trim() || '';

    const hasItems = Object.values(items).some(arr => arr.length > 0);

    if (!hasItems) {
      return `
        <div style="text-align:center;padding:60px 20px;color:#86868B;">
          <i class="ti ti-clipboard-off" style="font-size:48px;display:block;margin-bottom:16px;"></i>
          선택된 프로그램이 없습니다.<br>
          <span style="font-size:13px;">프로그램을 선택한 후 다시 시도해 주세요.</span>
        </div>`;
    }

    // DC 적용값은 getAllTotalsDc()로 일괄 처리 — isDcActive 별도 판단 불필요

    const sectionHtml = (groupKey, arr, rawTotal, dcTotal) => {
      if (!arr.length) return '';
      const label = config.groups?.[groupKey]?.label || groupKey;
      const hasDc = dcTotal !== rawTotal;
      const rows = arr.map(item => `
        <tr>
          <td>${item.label}</td>
          <td>${fmt(item.amt)}</td>
        </tr>`).join('');

      const subtotalHtml = hasDc
        ? `<div class="pf-subtotal">원가: <span style="text-decoration:line-through;opacity:.6;">${fmt(rawTotal)}</span> → 할인 후: ${fmt(dcTotal)}</div>`
        : `<div class="pf-subtotal">소계: ${fmt(dcTotal)}</div>`;

      // 섹션별 추가할인 행
      let extraDcHtml = '';
      if (groupKey === 'roadmap' && semDisc > 0) {
        extraDcHtml = `<div class="pf-extra-dc">추가할인 : 2학기DC &nbsp;-${fmt(semDisc)}</div>`;
      }
      if (groupKey === 'individual' && indDiscAmt > 0) {
        extraDcHtml = `<div class="pf-extra-dc">추가할인 : 개별가DC &nbsp;-${fmt(indDiscAmt)}</div>`;
      }

      return `
        <div class="pf-section">
          <div class="pf-section-header"><div class="pf-section-bar"></div><span class="pf-section-label">${label}</span></div>
          <table><tbody>${rows}</tbody></table>
          ${subtotalHtml}
          ${extraDcHtml}
        </div>`;
    };

    // 합계: DC 적용된 최종값 기준
    const grandRaw = totals.roadmap + totals.individual + totals.strategy;
    const grandDc  = totalsDc.grand;
    const hasDcAny = grandDc !== grandRaw;

    const totalHtml = hasDcAny ? `
      <div class="pf-total-box">
        <span class="pf-total-label">합계금액</span>
        <div class="pf-total-right">
          <div class="pf-total-raw">원가 ${fmt(grandRaw)}</div>
          <div class="pf-total-amt">${fmt(grandDc)}</div>
        </div>
      </div>` : `
      <div class="pf-total-box">
        <span class="pf-total-label">합계금액</span>
        <div class="pf-total-amt">${fmt(grandDc)}</div>
      </div>`;

    return `
      <div class="pf-doc">
        <div class="pf-header">
          <div class="pf-header-top">
            <span class="pf-brand">마이더스K교육컨설팅</span>
            <span class="pf-teachers-box">티처스 컨설턴트</span>
          </div>
          <div class="pf-main-title">학생부 관리 컨설팅 포트폴리오</div>
        </div>

        <div class="pf-info-card">
          <div class="pf-info-row">
            <div class="pf-info-item"><span class="pf-info-label">학년</span><span class="pf-info-value">${gradeStr}</span></div>
            ${stuName   ? `<div class="pf-info-item"><span class="pf-info-label">학생명</span><span class="pf-info-value">${stuName}</span></div>` : ''}
            ${stuSchool ? `<div class="pf-info-item"><span class="pf-info-label">학교</span><span class="pf-info-value">${stuSchool}</span></div>` : ''}
            ${stuGoal   ? `<div class="pf-info-item"><span class="pf-info-label">진로목표</span><span class="pf-info-value">${stuGoal}</span></div>` : ''}
            <div class="pf-info-item"><span class="pf-info-label">작성일</span><span class="pf-info-value">${today()}</span></div>
          </div>
        </div>

        <div class="pf-programs">
          <div class="pf-programs-title">선택 프로그램</div>
          ${sectionHtml('roadmap',    items.roadmap,    totals.roadmap,    totalsDc.roadmap)}
          ${sectionHtml('individual', items.individual, totals.individual, totalsDc.individual)}
          ${sectionHtml('strategy',   items.strategy,   totals.strategy,   totalsDc.strategy)}
        </div>

        ${totalHtml}

        <div class="pf-special-box">
          <span class="pf-special-label">특약사항 :</span>
        </div>

        <div class="pf-footer">
          <div class="pf-footer-left">
            <div class="pf-footer-brand">티처스 컨설턴트의 학생부 관리 컨설팅</div>
            <div class="pf-footer-contact">
              <span class="pf-footer-ci">☎ 053-782-0331</span>
              <span class="pf-footer-ci">월~토 AM 10:00 - PM 18:30</span>
            </div>
          </div>
          <div class="pf-footer-badge">대구광역시 교육청<br>정식인가 제5513호</div>
        </div>
      </div>`;
  }


  /* ============================================================
   * 3. 세부 프로그램 안내 페이지 생성
   * ============================================================ */
  function _buildDetailPages(selectedPageIds) {
    const config = MK_CONFIG.resolve();

    return selectedPageIds.map(pageId => {
      const page = config.pages[pageId];
      if (!page) return '';

      // 섹션 라벨 (A. / B. 등) — sbLabel 앞 글자
      const secLetter = (page.sbLabel || '').substring(0, 2);
      const secGroup  = page.group === 'roadmap' ? '학년 관리 로드맵'
                      : page.group === 'individual' ? '개별 관리 컨설팅'
                      : '대입 전략 컨설팅';

      // 01 프로그램 구성
      const programsHtml = (page.programs || []).map((p, i) => {
        const items = (p.items || []).map(t => `<li>${t}</li>`).join('');
        return `
          <div class="dt-p-item">
            <div class="dt-p-header">
              <span class="dt-p-num">PROGRAM · ${String(i+1).padStart(2,'0')}</span>
              <span class="dt-p-title">${p.title || ''}</span>
            </div>
            <ul class="dt-p-items">${items}</ul>
          </div>`;
      }).join('');

      // 02 제공 조건
      const conditionsHtml = (page.conditions || []).map(c => {
        let body = '';
        if (c.type === 'tags+text') {
          const tags = (c.tags || []).map(t => `<span class="dt-tag">${t}</span>`).join('');
          const txt  = c.text ? `<div class="dt-c-line">${c.text}</div>` : '';
          body = `<div class="dt-tag-row">${tags}</div>${txt}`;
        } else {
          body = (c.text || '').split(/\n|<br\s*\/?>/i)
            .filter(l => l.trim())
            .map(l => `<div class="dt-c-line">${l.trim()}</div>`).join('');
        }
        // 우측 뱃지 — 타이틀 영어 약어
        const badge = c.title.length <= 4 ? c.title.toUpperCase()
          : c.type === 'tags+text' ? 'SUBJECT' : 'CONDITION';
        return `
          <div class="dt-c-box">
            <div class="dt-c-title">${c.title}<span class="dt-c-badge">${badge}</span></div>
            <div class="dt-c-txt">${body}</div>
          </div>`;
      }).join('');

      // 노트
      const colorMap = { blue:'dt-note-blue', amber:'dt-note-amber', red:'dt-note-red' };
      const notesHtml = (page.notes || []).map(n => {
        const cls = colorMap[n.color] || 'dt-note-blue';
        return `<div class="dt-note ${cls}"><div class="dt-note-dot"></div><div class="dt-note-text">${n.text}</div></div>`;
      }).join('');

      return `
      <div class="dt-page">
        <div class="dt-header">
          <div>
            <div class="dt-brand">마이더스K교육컨설팅</div>
            <div class="dt-doc-title">세부 프로그램 안내서</div>
          </div>
          <span class="dt-badge-outline">TEACHERS CONSULTANT</span>
        </div>

        <div class="dt-banner">
          <div class="dt-banner-num">${secLetter}</div>
          <div class="dt-banner-divider"></div>
          <div>
            <div class="dt-banner-label">SECTION ${secLetter.replace('.','').trim()} · ${secGroup}</div>
            <div class="dt-banner-title">${(page.sbLabel || '').substring(3)}</div>
            <div class="dt-banner-sub">${page.subtitle || ''}</div>
          </div>
        </div>

        ${programsHtml ? `
        <div class="dt-sec-label"><span class="dt-sec-num">01</span><span class="dt-sec-text">프로그램 구성</span></div>
        <div class="dt-prog-area">${programsHtml}</div>` : ''}

        ${conditionsHtml ? `
        <div class="dt-sec-label"><span class="dt-sec-num">02</span><span class="dt-sec-text">제공 조건 및 세부 내용</span></div>
        <div class="dt-cond-area">${conditionsHtml}</div>` : ''}

        ${notesHtml ? `<div class="dt-notes-area">${notesHtml}</div>` : ''}

        <div class="dt-footer">
          <div>
            <div class="dt-footer-brand">티처스 컨설턴트의 학생부 관리 컨설팅</div>
            <div class="dt-footer-contact">☎ 053-782-0331 · 월~토 AM 10:00 – PM 18:30</div>
          </div>
          <div class="dt-footer-badge">대구광역시 교육청<br>정식인가 제5513호</div>
        </div>
      </div>`;
    }).join('');
  }


  /* ============================================================
   * 4. 새 창으로 열기 + 인쇄
   * ============================================================ */
  function open() {
    const items      = _collectItems();
    const studentKey = document.getElementById('tb-title')?.textContent || '';
    const body       = _buildHTML(items, studentKey);
    const details    = _buildDetailPages(items.selectedPageIds || []);
    const config     = MK_CONFIG.resolve();

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>마이더스K 컨설팅 포트폴리오</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Noto Sans KR',sans-serif;background:#fff;color:#15151A;padding:0}
@page{margin:12mm 14mm;size:A4}
:root{--mk-blue:#2B4BAF;--mk-blue-lt:#F0F4FC;--mk-line:#e2e2e2}
.pf-doc{max-width:680px;margin:0 auto;padding:24px 32px}
.pf-header{text-align:center;padding-bottom:16px;border-bottom:2px solid #15151A;margin-bottom:20px}
.pf-header-top{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px}
.pf-brand{font-size:16px;font-weight:700;letter-spacing:.12em;color:#2B4BAF;text-transform:uppercase}
.pf-main-title{font-size:20px;font-weight:700;margin-bottom:0}
.pf-teachers-box{display:inline-block;font-size:11px;font-weight:700;color:#2B4BAF;letter-spacing:.08em;border:1.5px solid #2B4BAF;border-radius:4px;padding:3px 10px}
.pf-info-card{display:flex;flex-wrap:wrap;gap:8px 0;padding:12px 16px;background:#fff;border-radius:10px;margin:0 0 20px;border:2px solid #15151A}
.pf-info-row{display:flex;flex-wrap:wrap;gap:6px 22px}
.pf-info-item{display:flex;align-items:center;gap:6px;font-size:12.5px}
.pf-info-label{color:#999;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.pf-info-value{font-weight:700;color:#15151A}
.pf-programs-title{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#aaa;margin-bottom:12px}
.pf-section{margin-bottom:12px;border-radius:10px;overflow:hidden;border:1px solid var(--mk-line)}
.pf-section-header{display:flex;align-items:center;gap:8px;padding:9px 14px;background:var(--mk-blue-lt);border-bottom:1px solid var(--mk-line)}
.pf-section-bar{width:3px;height:14px;border-radius:0;background:var(--mk-blue);flex-shrink:0}
.pf-section-label{font-size:12.5px;font-weight:700;color:var(--mk-blue)}
.pf-section table{width:100%;border-collapse:collapse;background:#fff}
.pf-section td{padding:8px 14px;font-size:13px;border-bottom:1px solid #f5f5f5}
.pf-section td:last-child{text-align:right;font-weight:600;white-space:nowrap;color:#15151A}
.pf-section td:first-child{color:#43434A}
.pf-section tr:last-child td{border-bottom:none}
.pf-subtotal{text-align:right;padding:8px 14px;font-size:12.5px;font-weight:600;color:var(--mk-blue);background:var(--mk-blue-lt);border-top:1px solid var(--mk-line)}
.pf-subtotal s{opacity:.45;margin-right:4px;color:#888}
.pf-extra-dc{text-align:right;font-size:12px;color:#5b35c4;font-weight:600;padding:2px 12px 8px;}
.pf-special-box{border:1.5px solid #d0d0d8;border-radius:8px;padding:14px 16px;margin:12px 0;height:60px;display:flex;gap:12px;align-items:flex-start;}
.pf-special-label{font-size:12px;font-weight:700;color:#43434A;white-space:nowrap;padding-top:2px;}
.pf-total-box{margin:16px 0;padding:16px 20px;background:#fff;border:2px solid #15151A;border-radius:10px;display:flex;justify-content:space-between;align-items:center}
.pf-total-label{font-size:15px;font-weight:700;color:#15151A}
.pf-total-right{text-align:right}
.pf-total-raw{font-size:11px;color:#aaa;text-decoration:line-through;margin-bottom:2px}
.pf-total-amt{font-size:28px;font-weight:700;color:var(--mk-blue)}
.pf-footer{border-top:2px solid var(--mk-blue);padding:16px 0 0;margin-top:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.pf-footer-left{display:flex;flex-direction:column;gap:5px}
.pf-footer-brand{font-size:12.5px;font-weight:700;color:#15151A}
.pf-footer-contact{display:flex;align-items:center;gap:16px;margin-top:2px}
.pf-footer-ci{font-size:11.5px;color:#555}
.pf-footer-badge{padding:7px 13px;border:1.5px solid var(--mk-blue);border-radius:8px;font-size:10.5px;color:var(--mk-blue);text-align:center;line-height:1.7;font-weight:600;white-space:nowrap}
.print-btn{position:fixed;bottom:24px;right:24px;padding:12px 24px;background:var(--mk-blue);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
@media print{.print-btn{display:none}}

/* ── 세부 프로그램 안내 페이지 ── */
:root{
  --dt-deep:#2A3340;--dt-acc:#455367;--dt-tint:#F2F4F8;
  --dt-line:rgba(69,83,103,.22);--dt-ink:#15151A;--dt-ink2:#43434A;--dt-ink3:#86868B;
  --dt-card:#fff;--dt-warm:#FBFAF7;
  --dt-line-soft:rgba(21,21,26,.08);--dt-line-md:rgba(21,21,26,.14);
  --dt-red-bg:#FBEAEF;--dt-red-br:rgba(139,28,58,.15);--dt-red-tx:#8b1c3a;
  --dt-amber-bg:#FEF9EC;--dt-amber-br:rgba(180,120,0,.18);--dt-amber-tx:#7a5000;
}
.dt-page{page-break-before:always;font-family:'Noto Sans KR',sans-serif}
.dt-header{background:var(--dt-deep);padding:14px 28px;display:flex;align-items:center;justify-content:space-between}
.dt-brand{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.22em;color:rgba(255,255,255,.45)}
.dt-doc-title{font-size:14px;font-weight:800;color:#fff;margin-top:2px}
.dt-badge-outline{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.12em;color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.22);border-radius:3px;padding:4px 10px}
.dt-banner{background:var(--dt-tint);border-bottom:1px solid var(--dt-line);padding:14px 28px;display:flex;align-items:center;gap:14px}
.dt-banner-num{font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:700;color:var(--dt-deep);line-height:1;flex-shrink:0}
.dt-banner-divider{width:1px;height:32px;background:var(--dt-line);flex-shrink:0}
.dt-banner-label{font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:700;letter-spacing:.24em;color:var(--dt-acc);margin-bottom:3px}
.dt-banner-title{font-size:17px;font-weight:800;color:var(--dt-ink);letter-spacing:-.015em}
.dt-banner-sub{font-size:11px;color:var(--dt-ink3);margin-top:2px}
.dt-sec-label{display:flex;align-items:center;gap:8px;padding:14px 28px 10px}
.dt-sec-num{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.14em;color:#fff;background:var(--dt-deep);padding:3px 8px;border-radius:3px}
.dt-sec-text{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.16em;color:var(--dt-ink2)}
.dt-sec-label::after{content:'';flex:1;height:1px;background:var(--dt-line-md)}
.dt-prog-area{padding:0 28px 6px}
.dt-p-item{background:var(--dt-card);border:1px solid var(--dt-line-soft);border-radius:8px;margin-bottom:8px;overflow:hidden}
.dt-p-header{display:inline-flex;align-items:stretch;margin:12px 16px 8px;border:1px solid var(--dt-line);border-radius:6px;overflow:hidden;background:var(--dt-tint)}
.dt-p-num{display:inline-flex;align-items:center;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;color:#fff;background:var(--dt-deep);padding:0 11px;letter-spacing:.06em;white-space:nowrap}
.dt-p-title{display:inline-flex;align-items:center;font-size:12.5px;font-weight:800;color:var(--dt-deep);padding:7px 13px 7px 11px;letter-spacing:-.005em}
.dt-p-items{list-style:none;padding:0 16px 13px}
.dt-p-items li{font-size:12px;color:var(--dt-ink2);line-height:1.7;padding-left:13px;position:relative;margin-bottom:3px}
.dt-p-items li::before{content:'';position:absolute;left:2px;top:9px;width:3px;height:3px;border-radius:50%;background:var(--dt-acc);opacity:.7}
.dt-cond-area{padding:0 28px 6px}
.dt-c-box{background:var(--dt-warm);border:1px solid var(--dt-line-soft);border-radius:8px;overflow:hidden;margin-bottom:8px}
.dt-c-title{display:flex;align-items:center;background:var(--dt-deep);padding:9px 14px;font-size:12px;font-weight:700;color:#fff}
.dt-c-badge{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:700;letter-spacing:.2em;color:rgba(255,255,255,.35)}
.dt-c-txt{padding:12px 14px;font-size:11.5px;color:var(--dt-ink2);line-height:1.8}
.dt-tag-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px}
.dt-tag{background:var(--dt-tint);color:var(--dt-deep);border:1px solid var(--dt-line);border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700}
.dt-c-line{position:relative;padding-left:12px;margin-bottom:3px}
.dt-c-line::before{content:'';position:absolute;left:1px;top:8px;width:3px;height:3px;border-radius:50%;background:var(--dt-acc);opacity:.6}
.dt-notes-area{padding:0 28px 18px}
.dt-note{border-radius:7px;padding:10px 13px;margin-bottom:7px;display:flex;gap:9px;align-items:flex-start;border:1px solid transparent}
.dt-note-blue{background:var(--dt-tint);border-color:var(--dt-line)}
.dt-note-red{background:var(--dt-red-bg);border-color:var(--dt-red-br)}
.dt-note-amber{background:var(--dt-amber-bg);border-color:var(--dt-amber-br)}
.dt-note-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:6px}
.dt-note-blue .dt-note-dot{background:var(--dt-acc)}
.dt-note-red .dt-note-dot{background:var(--dt-red-tx)}
.dt-note-amber .dt-note-dot{background:var(--dt-amber-tx)}
.dt-note-text{font-size:11px;line-height:1.7}
.dt-note-blue .dt-note-text{color:var(--dt-deep)}
.dt-note-red .dt-note-text{color:var(--dt-red-tx)}
.dt-note-amber .dt-note-text{color:var(--dt-amber-tx)}
.dt-footer{background:var(--dt-deep);padding:12px 28px;display:flex;justify-content:space-between;align-items:center}
.dt-footer-brand{font-size:11.5px;font-weight:700;color:#fff}
.dt-footer-contact{font-family:'JetBrains Mono',monospace;font-size:9.5px;color:rgba(255,255,255,.45);margin-top:2px}
.dt-footer-badge{padding:5px 11px;border:1px solid rgba(255,255,255,.22);border-radius:4px;font-size:9px;color:rgba(255,255,255,.65);text-align:center;line-height:1.75;font-weight:700;font-family:'JetBrains Mono',monospace;letter-spacing:.04em}
</style>
</head>
<body>
${body}
${details}
<button class="print-btn" onclick="window.print()">🖨 인쇄 / PDF 저장</button>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  }

  function print() {
    // 새 창 방식으로 전환 — 하위 호환
    open();
  }


  /* ============================================================
   * Public API
   * ============================================================ */
  return { open, print };

})();
