/**
 * portfolio.js — 컨설팅 포트폴리오 출력 / 인쇄
 *
 * 로드 순서: config.js → store.js → calc.js → ui.js → portfolio.js
 */

const Portfolio = (() => {

  function fmt(n) {
    if (n === 0) return '0원';
    return n.toLocaleString('ko-KR') + '원';
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

    return result;
  }


  /* ============================================================
   * 2. 출력물 HTML 생성
   * ============================================================ */
  function _buildHTML(items, studentKey) {
    const config   = MK_CONFIG.resolve();
    const totals   = Calc.getAllTotals();
    const totalsDc = Calc.getAllTotalsDc();
    const grade    = Calc.getGrade();
    const gradeStr = grade ? `고${grade}학년` : '학년 미선택';

    // 학생 정보 파싱 (tb-title: 이름 · 학교 · 학년 · 진로목표)
    const parts     = (studentKey || '').split(' · ');
    const stuName   = parts[0]?.trim() || '';
    const stuSchool = parts[1]?.trim() || '';
    // parts[2] = 학년 문자열 (고1/고2/고3) — grade는 Calc.getGrade()로 별도 취득하므로 미사용
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

      return `
        <div class="pf-section">
          <div class="pf-section-header">${label}</div>
          <table><tbody>${rows}</tbody></table>
          ${subtotalHtml}
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
        <!-- 헤더 -->
        <div class="pf-header">
          <div class="pf-brand">마이더스K교육컨설팅</div>
          <div class="pf-main-title">학생부 관리 컨설팅 포트폴리오</div>
          <div class="pf-license">${config.app.license}</div>
        </div>

        <!-- 학생 정보 -->
        <div class="pf-info-card">
          <div class="pf-info-item">
            <span class="pf-info-label">학년</span>
            <span class="pf-info-value">${gradeStr}</span>
          </div>
          ${stuName ? `<div class="pf-info-item">
            <span class="pf-info-label">학생명</span>
            <span class="pf-info-value">${stuName}</span>
          </div>` : ''}
          ${stuSchool ? `<div class="pf-info-item">
            <span class="pf-info-label">학교</span>
            <span class="pf-info-value">${stuSchool}</span>
          </div>` : ''}
          ${stuGoal ? `<div class="pf-info-item">
            <span class="pf-info-label">진로목표</span>
            <span class="pf-info-value">${stuGoal}</span>
          </div>` : ''}
          <div class="pf-info-item">
            <span class="pf-info-label">작성일</span>
            <span class="pf-info-value">${today()}</span>
          </div>
        </div>

        <!-- 선택 프로그램 -->
        <div class="pf-programs">
          <div class="pf-programs-title">[ 선택 프로그램 ]</div>
          ${sectionHtml('roadmap',    items.roadmap,    totals.roadmap,    totalsDc.roadmap)}
          ${sectionHtml('individual', items.individual, totals.individual, totalsDc.individual)}
          ${sectionHtml('strategy',   items.strategy,   totals.strategy,   totalsDc.strategy)}
        </div>

        <!-- 합계 -->
        ${totalHtml}

        <!-- 하단 고정문구 -->
        <div class="pf-footer">
          <p style="font-size:13px;color:#43434A;line-height:1.8;">
            티처스 컨설턴트의 학생부 관리 컨설팅<br>
            상담문의 : 053-782-0331
          </p>
        </div>
      </div>`;
  }


  /* ============================================================
   * 3. 새 창으로 열기 + 인쇄
   * ============================================================ */
  function open() {
    const items      = _collectItems();
    const studentKey = document.getElementById('tb-title')?.textContent || '';
    const body       = _buildHTML(items, studentKey);
    const config     = MK_CONFIG.resolve();

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>마이더스K 컨설팅 포트폴리오</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Noto Sans KR',sans-serif;background:#fff;color:#15151A;padding:0}
@page{margin:12mm 14mm;size:A4}
.pf-doc{max-width:680px;margin:0 auto;padding:24px 32px}
.pf-header{text-align:center;padding-bottom:16px;border-bottom:2px solid #15151A;margin-bottom:20px}
.pf-brand{font-size:11px;font-weight:700;letter-spacing:.2em;color:#8870C8;text-transform:uppercase;margin-bottom:6px}
.pf-main-title{font-size:20px;font-weight:700;margin-bottom:6px}
.pf-license{font-size:11px;color:#A8A4AB}
.pf-info-card{display:flex;flex-wrap:wrap;gap:8px 0;padding:12px 16px;background:#fff;border-radius:10px;margin-bottom:20px;border:2px solid #15151A}
.pf-info-item{display:flex;gap:6px;font-size:12.5px;margin-right:20px}
.pf-info-label{color:#A8A4AB}
.pf-info-value{font-weight:700;color:#15151A}
.pf-programs-title{font-size:11px;font-weight:700;letter-spacing:.1em;color:#A8A4AB;text-transform:uppercase;margin-bottom:12px}
.pf-section{margin-bottom:14px;border-radius:10px;overflow:hidden;border:1px solid rgba(0,0,0,0.07)}
.pf-section-header{padding:10px 16px;font-size:13px;font-weight:700;color:#5b35c4;background:#f3f0ff;border-left:4px solid #B79CFF}
.pf-section table{width:100%;border-collapse:collapse;background:#fff}
.pf-section td{padding:8px 16px;font-size:13px;border-bottom:1px solid #f5f5f5}
.pf-section td:last-child{text-align:right;font-weight:600;white-space:nowrap}
.pf-section tr:last-child td{border-bottom:none}
.pf-subtotal{text-align:right;padding:8px 16px;font-size:13px;font-weight:600;color:#5b35c4;background:#faf8ff;border-top:1px solid rgba(183,156,255,0.2)}
.pf-total-box{margin:16px 0;padding:16px 20px;background:#fff;border:2px solid #15151A;border-radius:10px;display:flex;justify-content:space-between;align-items:center}
.pf-total-label{font-size:15px;font-weight:700;color:#15151A}
.pf-total-right{text-align:right}
.pf-total-raw{font-size:12px;color:#A8A4AB;text-decoration:line-through;margin-bottom:2px}
.pf-total-amt{font-size:22px;font-weight:700;color:#5b35c4}
.pf-tax{font-size:11px;color:#A8A4AB;text-align:right;margin-bottom:20px}
.pf-footer{border-top:1px solid #e8e8e8;padding-top:16px;margin-top:8px;font-size:12.5px;color:#6B6970;line-height:1.8}
.print-btn{position:fixed;bottom:24px;right:24px;padding:12px 24px;background:linear-gradient(105deg,#FFB89A,#FF8FB1,#B79CFF);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(183,156,255,0.4)}
@media print{.print-btn{display:none}}
</style>
</head>
<body>
${body}
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
