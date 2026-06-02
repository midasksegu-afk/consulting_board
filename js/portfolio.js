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
   * 학생정보 라벨 결정 — 학생정보 > 학년 기준 > 표시안함
   * ============================================================ */
  function _resolveStudentLabel(studentKey) {
    if (studentKey && studentKey.trim()) return studentKey.trim();
    const g = Calc.state?.grade || 0;
    if (g >= 1 && g <= 3) return `고${g} 기준`;
    return '';
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
  function _buildDetailPages(selectedPageIds, studentKey) {
    const config = MK_CONFIG.resolve();
    const stuLabel = _resolveStudentLabel(studentKey);
    const stuInfo = stuLabel ? `<div class="dt-stu-info">${stuLabel}</div>` : '';

    // HTML → 순수 텍스트 (모든 인라인 태그·스타일 제거)
    function _clean(html) {
      return (html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
    }

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
        const items = (p.items || []).map(t => `<li>${_clean(t)}</li>`).join('');
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
          const txt  = c.text ? `<div class="dt-c-line">${_clean(c.text)}</div>` : '';
          body = `<div class="dt-tag-row">${tags}</div>${txt}`;
        } else {
          body = _clean(c.text).split('\n')
            .map(l => l.trim()).filter(l => l)
            .map(l => `<div class="dt-c-line">${l}</div>`).join('');
        }
        const badge = c.title.length <= 4 ? c.title.toUpperCase()
          : c.type === 'tags+text' ? 'SUBJECT' : 'CONDITION';
        return `
          <div class="dt-c-box">
            <div class="dt-c-title">${c.title}<span class="dt-c-badge">${badge}</span></div>
            <div class="dt-c-txt">${body}</div>
          </div>`;
      }).join('');

      // DC 할인 뱃지 — 해당 페이지 group에 적용된 할인만 표시
      const cfg        = MK_CONFIG.resolve();
      const discount   = cfg.discount || {};
      const dcLabels   = [];
      const effGroup   = page.calcGroup || page.group;

      if (effGroup === 'roadmap') {
        if (Calc.isSelectDcActive()) {
          const rate = discount.selectDc || 0;
          if (rate) dcLabels.push(`선택가 할인 (${rate}%)`);
        } else if (Calc.isDcActive('roadmap')) {
          const rate = discount.roadmap || 0;
          if (rate) dcLabels.push(`로드맵 할인 (${rate}%)`);
        }
        if (Calc.isSemesterDcActive()) dcLabels.push('2학기 할인');
      } else if (effGroup === 'individual') {
        if (Calc.isDcActive('individual')) {
          const rate = discount.individual || 0;
          if (rate) dcLabels.push(`개별 할인 (${rate}%)`);
        }
      }

      const dcBadgeHtml = dcLabels.length
        ? dcLabels.map(l => `<div class="dt-dc-badge">${l}</div>`).join('')
        : '';

      // 노트
      const colorMap = { blue:'dt-note-blue', amber:'dt-note-amber', red:'dt-note-red' };
      const notesHtml = (page.notes || []).map(n => {
        const cls = colorMap[n.color] || 'dt-note-blue';
        return `<div class="dt-note ${cls}"><div class="dt-note-dot"></div><div class="dt-note-text">${n.text}</div></div>`;
      }).join('');

      return `
      <div class="dt-page">
        <div class="dt-header">
          <div class="dt-header-left">
            <div class="dt-brand">마이더스K교육컨설팅</div>
            <div class="dt-doc-title">세부 프로그램 안내서</div>
          </div>
          <div class="dt-header-center">${stuInfo || ''}</div>
          <div class="dt-header-right">
            <span class="dt-badge-outline">티처스 컨설턴트</span>
          </div>
        </div>
        <div class="dt-header-line"></div>

        <div class="dt-banner">
          <div class="dt-banner-num">${secLetter}</div>
          <div class="dt-banner-divider"></div>
          <div style="flex:1">
            <div class="dt-banner-label">SECTION ${secLetter.replace('.','').trim()} · ${secGroup}</div>
            <div class="dt-banner-title">${(page.sbLabel || '').substring(3)}</div>
            <div class="dt-banner-sub">${page.subtitle || ''}</div>
          </div>
          ${dcBadgeHtml}
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
    const detailHtml = _buildDetailPages(items.selectedPageIds || [], studentKey);
    const checklistHtml = _buildChecklistPage(items.selectedPageIds || [], studentKey);
    const introHtml     = _buildIntroPage(studentKey);
    const config     = MK_CONFIG.resolve();

    // 세부 안내서 새 창 오픈 스크립트 — JSON.stringify로 안전하게 전달
    // </script> 문자열이 외부 script 블록을 조기 종료시키지 않도록 이스케이프
    const detailJson = JSON.stringify(_detailWindowHTML(detailHtml, checklistHtml, introHtml))
      .replace(/<\/script>/gi, '<\\/script>');
    const detailsScript = `
      var w=window.open('','mk_detail_window');
      var h=${detailJson};
      w.document.write(h);w.document.close();`;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>마이더스K 컨설팅 포트폴리오</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Noto Sans KR',sans-serif;background:#fff;color:#15151A;padding:0;padding-top:52px}
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
.pf-toolbar{position:fixed;top:0;left:0;right:0;height:52px;background:#2B4BAF;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 24px;z-index:999}
.pf-toolbar-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 18px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:-.01em}
.pf-toolbar-btn-print{background:#fff;color:#2B4BAF}
.pf-toolbar-btn-zoom{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35);min-width:36px;padding:6px 10px;font-size:16px}
.pf-zoom-label{color:#fff;font-size:12px;font-weight:700;min-width:42px;text-align:center}
.pf-toolbar-btn-detail{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.35)}
@media print{.pf-toolbar{display:none}body{padding-top:0}.pf-doc,.dt-page,.ck-page,.it-page{zoom:1 !important}}

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
.dt-header{background:#fff;padding:12px 28px;display:flex;align-items:center;gap:12px}
.dt-header-left{flex:1}
.dt-header-center{flex:1;display:flex;justify-content:center;align-items:center}
.dt-header-right{flex:1;display:flex;justify-content:flex-end;align-items:center}
.dt-brand{font-family:'Noto Sans KR',sans-serif;font-size:9px;font-weight:700;letter-spacing:.22em;color:var(--dt-ink3)}
.dt-doc-title{font-size:14px;font-weight:800;color:var(--dt-ink);margin-top:2px}
.dt-stu-bar{padding:8px 28px;text-align:center;background:#fff}
.dt-header-line{height:1px;background:var(--dt-line-md);margin:0 28px}
.dt-stu-info{font-size:11.5px;font-weight:700;color:var(--dt-deep);background:var(--dt-tint);border:1px solid var(--dt-line);border-radius:5px;padding:6px 24px;display:inline-block;white-space:nowrap}
.dt-badge-outline{font-family:'Noto Sans KR',sans-serif;font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--dt-acc);border:1px solid var(--dt-line);border-radius:3px;padding:4px 10px}
.dt-banner{background:var(--dt-tint);border-bottom:1px solid var(--dt-line);padding:14px 28px;display:flex;align-items:center;gap:14px}
.dt-banner-num{font-family:'Noto Sans KR',sans-serif;font-size:26px;font-weight:700;color:var(--dt-deep);line-height:1;flex-shrink:0}
.dt-banner-divider{width:1px;height:32px;background:var(--dt-line);flex-shrink:0}
.dt-banner-label{font-family:'Noto Sans KR',sans-serif;font-size:8.5px;font-weight:700;letter-spacing:.24em;color:var(--dt-acc);margin-bottom:3px}
.dt-banner-title{font-size:17px;font-weight:800;color:var(--dt-ink);letter-spacing:-.015em}
.dt-banner-sub{font-size:11px;color:var(--dt-ink3);margin-top:2px}
.dt-dc-badge{padding:6px 12px;border:1px solid var(--dt-line);border-radius:4px;font-size:14px;font-weight:700;color:var(--dt-deep);text-align:center;line-height:1.5;white-space:nowrap;align-self:center}
.dt-sec-label{display:flex;align-items:center;gap:8px;padding:14px 28px 10px}
.dt-sec-num{font-family:'Noto Sans KR',sans-serif;font-size:9px;font-weight:700;letter-spacing:.14em;color:#fff;background:var(--dt-deep);padding:3px 8px;border-radius:3px}
.dt-sec-text{font-family:'Noto Sans KR',sans-serif;font-size:10px;font-weight:700;letter-spacing:.16em;color:var(--dt-ink2)}
.dt-sec-label::after{content:'';flex:1;height:2px;background:var(--dt-deep)}
.dt-prog-area{padding:0 28px 6px}
.dt-p-item{background:var(--dt-card);border:1px solid var(--dt-line-soft);border-radius:8px;margin-bottom:8px;overflow:hidden}
.dt-p-header{display:inline-flex;align-items:stretch;margin:12px 16px 8px;border:1px solid var(--dt-line);border-radius:6px;overflow:hidden;background:var(--dt-tint)}
.dt-p-num{display:inline-flex;align-items:center;font-family:'Noto Sans KR',sans-serif;font-size:9.5px;font-weight:700;color:#fff;background:var(--dt-deep);padding:0 11px;letter-spacing:.06em;white-space:nowrap}
.dt-p-title{display:inline-flex;align-items:center;font-size:12.5px;font-weight:800;color:var(--dt-deep);padding:7px 13px 7px 11px;letter-spacing:-.005em}
.dt-p-items{list-style:none;padding:0 16px 13px}
.dt-p-items li{font-size:12px;color:var(--dt-ink2);line-height:1.7;padding-left:13px;position:relative;margin-bottom:3px}
.dt-p-items li::before{content:'';position:absolute;left:2px;top:9px;width:3px;height:3px;border-radius:50%;background:var(--dt-acc);opacity:.7}
.dt-cond-area{padding:0 28px 6px}
.dt-c-box{background:var(--dt-warm);border:1px solid var(--dt-line-soft);border-radius:8px;overflow:hidden;margin-bottom:8px}
.dt-c-title{display:flex;align-items:center;background:var(--dt-deep);padding:9px 14px;font-size:12px;font-weight:700;color:#fff}
.dt-c-badge{margin-left:auto;font-family:'Noto Sans KR',sans-serif;font-size:8.5px;font-weight:700;letter-spacing:.2em;color:rgba(255,255,255,.35)}
.dt-c-txt{padding:12px 14px;font-size:12px;color:var(--dt-ink2);line-height:1.8}
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
.dt-note-text{font-size:12px;line-height:1.7}
.dt-note-blue .dt-note-text{color:var(--dt-deep)}
.dt-note-red .dt-note-text{color:var(--dt-red-tx)}
.dt-note-amber .dt-note-text{color:var(--dt-amber-tx)}
.dt-footer{background:#fff;border-top:1px solid var(--dt-line-md);padding:12px 28px;display:flex;justify-content:space-between;align-items:center}
.dt-footer-brand{font-size:11.5px;font-weight:700;color:var(--dt-ink)}
.dt-footer-contact{font-size:9.5px;color:var(--dt-ink3);margin-top:2px}
.dt-footer-badge{padding:5px 11px;border:1px solid var(--dt-line);border-radius:4px;font-size:9px;color:var(--dt-acc);text-align:center;line-height:1.75;font-weight:700;font-family:'Noto Sans KR',sans-serif;letter-spacing:.04em}
</style>
</head>
<body>
<div class="pf-toolbar">
  <button class="pf-toolbar-btn pf-toolbar-btn-zoom" onclick="mkZoom(-10)">−</button>
  <span class="pf-zoom-label" id="mk-zoom-val">100%</span>
  <button class="pf-toolbar-btn pf-toolbar-btn-zoom" onclick="mkZoom(10)">+</button>
  <button class="pf-toolbar-btn pf-toolbar-btn-detail" onclick="openDetails()">📄 세부 프로그램 안내서</button>
  <button class="pf-toolbar-btn pf-toolbar-btn-print" onclick="window.print()">🖨 인쇄 / PDF 저장</button>
</div>
${body}
<script>
var mkZoomLevel = Number(localStorage.getItem('mk_zoom')) || 100;
function mkApplyZoom(){
  document.querySelectorAll('.pf-doc').forEach(function(el){
    el.style.zoom = mkZoomLevel + '%';
  });
  var v = document.getElementById('mk-zoom-val');
  if (v) v.textContent = mkZoomLevel + '%';
}
function mkZoom(d){
  mkZoomLevel = Math.max(70, Math.min(180, mkZoomLevel + d));
  try { localStorage.setItem('mk_zoom', mkZoomLevel); } catch(e){}
  mkApplyZoom();
}
mkApplyZoom();
function openDetails(){
  ${detailsScript}
}
</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  }

  /* ============================================================
   * 5. 세부 안내서 전용 새 창 HTML 래퍼
   * ============================================================ */
  function _detailWindowHTML(detailHtml, checklistHtml, introHtml) {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>마이더스K 세부 프로그램 안내서</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Noto Sans KR',sans-serif;background:#fff;color:#15151A;padding-top:52px}
@page{margin:12mm 14mm;size:A4}
:root{
  --dt-deep:#2A3340;--dt-acc:#455367;--dt-tint:#F2F4F8;
  --dt-line:rgba(69,83,103,.22);--dt-ink:#15151A;--dt-ink2:#43434A;--dt-ink3:#86868B;
  --dt-card:#fff;--dt-warm:#FBFAF7;
  --dt-line-soft:rgba(21,21,26,.08);--dt-line-md:rgba(21,21,26,.14);
  --dt-red-bg:#FBEAEF;--dt-red-br:rgba(139,28,58,.15);--dt-red-tx:#8b1c3a;
  --dt-amber-bg:#FEF9EC;--dt-amber-br:rgba(180,120,0,.18);--dt-amber-tx:#7a5000;
}
.pf-toolbar{position:fixed;top:0;left:0;right:0;height:52px;background:#2A3340;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 24px;z-index:999}
.pf-toolbar-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 18px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
.pf-toolbar-btn-print{background:#fff;color:#2A3340}
.pf-toolbar-btn-zoom{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35);min-width:36px;padding:6px 10px;font-size:16px}
.pf-zoom-label{color:#fff;font-size:12px;font-weight:700;min-width:42px;text-align:center}
@media print{.pf-toolbar{display:none}body{padding-top:0}.pf-doc,.dt-page,.ck-page,.it-page{zoom:1 !important}}
.dt-page{page-break-before:always;max-width:680px;margin:0 auto;padding:0 0 32px;border-top:1px solid var(--dt-line-md)}
.dt-page:first-child{page-break-before:auto}
.ck-page:first-child{page-break-before:auto}
.dt-header{background:#fff;padding:12px 28px;display:flex;align-items:center;gap:12px}
.dt-header-left{flex:1}
.dt-header-center{flex:1;display:flex;justify-content:center;align-items:center}
.dt-header-right{flex:1;display:flex;justify-content:flex-end;align-items:center}
.dt-brand{font-size:9px;font-weight:700;letter-spacing:.22em;color:var(--dt-ink3)}
.dt-doc-title{font-size:14px;font-weight:800;color:var(--dt-ink);margin-top:2px}
.dt-stu-bar{padding:8px 28px;text-align:center;background:#fff}
.dt-header-line{height:1px;background:var(--dt-line-md);margin:0 28px}
.dt-stu-info{font-size:11.5px;font-weight:700;color:var(--dt-deep);background:var(--dt-tint);border:1px solid var(--dt-line);border-radius:5px;padding:6px 24px;display:inline-block;white-space:nowrap}
.dt-badge-outline{font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--dt-acc);border:1px solid var(--dt-line);border-radius:3px;padding:4px 10px}
.dt-banner{background:var(--dt-tint);border-bottom:1px solid var(--dt-line);padding:14px 28px;display:flex;align-items:center;gap:14px}
.dt-banner-num{font-size:26px;font-weight:800;color:var(--dt-deep);line-height:1;flex-shrink:0}
.dt-banner-divider{width:1px;height:32px;background:var(--dt-line);flex-shrink:0}
.dt-banner-label{font-size:9px;font-weight:700;letter-spacing:.16em;color:var(--dt-acc);margin-bottom:3px}
.dt-banner-title{font-size:17px;font-weight:800;color:var(--dt-ink);letter-spacing:-.015em}
.dt-banner-sub{font-size:11px;color:var(--dt-ink3);margin-top:2px}
.dt-dc-badge{padding:6px 12px;border:1px solid var(--dt-line);border-radius:4px;font-size:14px;font-weight:700;color:var(--dt-deep);text-align:center;line-height:1.5;white-space:nowrap;align-self:center}
.dt-sec-label{display:flex;align-items:center;gap:8px;padding:14px 28px 10px}
.dt-sec-num{font-size:9px;font-weight:800;letter-spacing:.14em;color:#fff;background:var(--dt-deep);padding:3px 9px;border-radius:3px}
.dt-sec-text{font-size:10px;font-weight:700;letter-spacing:.14em;color:var(--dt-ink2)}
.dt-sec-label::after{content:'';flex:1;height:2px;background:var(--dt-deep)}
.dt-prog-area{padding:0 28px 6px}
.dt-p-item{background:var(--dt-card);border:1px solid var(--dt-line-soft);border-radius:8px;margin-bottom:8px;overflow:hidden}
.dt-p-header{display:inline-flex;align-items:stretch;margin:12px 16px 8px;border:1px solid var(--dt-line);border-radius:6px;overflow:hidden;background:var(--dt-tint)}
.dt-p-num{display:inline-flex;align-items:center;font-size:10px;font-weight:800;color:#fff;background:var(--dt-deep);padding:0 11px;letter-spacing:.06em;white-space:nowrap}
.dt-p-title{display:inline-flex;align-items:center;font-size:12.5px;font-weight:800;color:var(--dt-deep);padding:7px 13px 7px 11px}
.dt-p-items{list-style:none;padding:0 16px 13px}
.dt-p-items li{font-size:12px;color:var(--dt-ink2);line-height:1.7;padding-left:13px;position:relative;margin-bottom:3px}
.dt-p-items li::before{content:'';position:absolute;left:2px;top:9px;width:3px;height:3px;border-radius:50%;background:var(--dt-acc);opacity:.7}
.dt-cond-area{padding:0 28px 6px}
.dt-c-box{background:var(--dt-warm);border:1px solid var(--dt-line-soft);border-radius:8px;overflow:hidden;margin-bottom:8px}
.dt-c-title{display:flex;align-items:center;background:var(--dt-deep);padding:9px 14px;font-size:12px;font-weight:700;color:#fff}
.dt-c-badge{margin-left:auto;font-size:9px;font-weight:700;letter-spacing:.16em;color:rgba(255,255,255,.35)}
.dt-c-txt{padding:12px 14px;font-size:12px;color:var(--dt-ink2);line-height:1.8}
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
.dt-note-text{font-size:12px;line-height:1.7}
.dt-note-blue .dt-note-text{color:var(--dt-deep)}
.dt-note-red .dt-note-text{color:var(--dt-red-tx)}
.dt-note-amber .dt-note-text{color:var(--dt-amber-tx)}
.dt-footer{background:#fff;border-top:1px solid var(--dt-line-md);padding:12px 28px;display:flex;justify-content:space-between;align-items:center}
.dt-footer-brand{font-size:11.5px;font-weight:700;color:var(--dt-ink)}
.dt-footer-contact{font-size:9.5px;color:var(--dt-ink3);margin-top:2px}
.dt-footer-badge{padding:5px 11px;border:1px solid var(--dt-line);border-radius:4px;font-size:9px;color:var(--dt-acc);text-align:center;line-height:1.75;font-weight:700;letter-spacing:.04em}

/* ── 선택 현황 페이지 ── */
.ck-page{page-break-before:always;max-width:680px;margin:0 auto;padding:0 0 0;display:flex;flex-direction:column;min-height:267mm;border-top:1px solid var(--dt-line-md)}
.ck-slogan{background:var(--dt-acc);padding:7px 28px;font-size:11px;color:#fff;font-weight:500;line-height:1.5}
.ck-slogan strong{font-weight:800}
.ck-head{padding:10px 28px 8px;border-bottom:1px solid var(--dt-line-md);display:flex;align-items:baseline;justify-content:space-between}
.ck-title{font-size:14px;font-weight:800;color:var(--dt-ink)}
.ck-student{font-size:11px;color:var(--dt-ink3)}
.ck-group{padding:8px 28px 2px}
.ck-group-label{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.ck-gnum{font-size:8px;font-weight:800;letter-spacing:.14em;color:#fff;background:var(--dt-deep);padding:2px 7px;border-radius:3px}
.ck-gtext{font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--dt-ink2)}
.ck-group-label::after{content:'';flex:1;height:1px;background:var(--dt-line-md)}
.ck-item{display:flex;align-items:baseline;gap:7px;padding:4px 6px;border-bottom:1px solid rgba(21,21,26,.04)}
.ck-box{width:18px;height:14px;border:1.5px solid;border-radius:2px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;flex-shrink:0;line-height:1}
.ck-on .ck-box{border-color:#1a6e3c;color:#1a6e3c;background:#edf7f1}
.ck-off .ck-box{border-color:#ccc;color:transparent}
.ck-name{font-size:11.5px;font-weight:700;flex-shrink:0;min-width:86px}
.ck-on .ck-name{color:#1a6e3c}
.ck-off .ck-name{color:var(--dt-ink2)}
.ck-sub{font-size:10px;color:var(--dt-ink3);line-height:1.4}
.ck-on .ck-sub{color:#4a9068}

/* ── 회사 소개 페이지 ── */
.it-page{page-break-before:always;max-width:680px;margin:0 auto;padding:0 0 0;border-top:1px solid var(--dt-line-md)}
.it-impact{background:var(--dt-tint);border:1px solid var(--dt-line);border-radius:10px;margin:14px 28px 0;padding:16px 20px}
.it-tag{font-size:8px;font-weight:700;letter-spacing:.22em;color:var(--dt-acc);margin-bottom:6px}
.it-copy{font-size:12px;font-weight:500;color:var(--dt-ink2);line-height:1.7;margin-bottom:12px}
.it-quote{border-left:3px solid var(--dt-deep);padding:10px 16px;background:#fff;border-radius:0 6px 6px 0}
.it-quote-pre{font-size:8.5px;font-weight:400;letter-spacing:.18em;color:var(--dt-ink3);margin-bottom:5px}
.it-quote-text{font-size:13.5px;font-weight:800;color:var(--dt-deep);line-height:1.5;letter-spacing:-.01em}
.it-quote-text em{font-style:normal;font-weight:800;color:#1a6e3c}
.it-greeting{padding:10px 28px 6px;font-size:13px;font-weight:500;color:var(--dt-ink2);line-height:1.6}
.it-greeting-name{font-weight:800;color:var(--dt-deep)}
.it-body{padding:14px 28px 0}
.it-desc{font-size:12px;color:var(--dt-ink2);line-height:1.85;padding:12px 14px;background:var(--dt-tint);border-radius:7px;border-left:3px solid var(--dt-acc)}
.it-divider{margin:12px 28px;height:1px;background:var(--dt-line-md)}
.it-awards{padding:0 28px 10px}
.it-sec-label{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.it-sec-num{font-size:8px;font-weight:800;letter-spacing:.14em;color:#fff;background:var(--dt-deep);padding:2px 7px;border-radius:3px}
.it-sec-text{font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--dt-ink2)}
.it-sec-label::after{content:'';flex:1;height:1px;background:var(--dt-line-md)}
.it-award{display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid rgba(21,21,26,.04)}
.it-dot{width:4px;height:4px;border-radius:50%;background:var(--dt-acc);flex-shrink:0;margin-top:6px}
.it-atext{font-size:11.5px;color:var(--dt-ink2);line-height:1.5}
.it-atext strong{font-weight:700;color:var(--dt-ink)}
.it-EXPERT{margin:10px 28px 12px;padding:10px 14px;background:var(--dt-deep);border-radius:7px;display:flex;align-items:center;gap:10px}
.it-EXPERT-label{font-size:8px;font-weight:700;letter-spacing:.14em;color:rgba(255,255,255,.35);flex-shrink:0}
.it-EXPERT-div{width:1px;height:18px;background:rgba(255,255,255,.15);flex-shrink:0}
.it-EXPERT-text{font-size:11.5px;font-weight:700;color:rgba(255,255,255,.82);line-height:1.5}
</style>
</head>
<body>
<div class="pf-toolbar">
  <button class="pf-toolbar-btn pf-toolbar-btn-zoom" onclick="mkZoom(-10)">−</button>
  <span class="pf-zoom-label" id="mk-zoom-val">100%</span>
  <button class="pf-toolbar-btn pf-toolbar-btn-zoom" onclick="mkZoom(10)">+</button>
  <button class="pf-toolbar-btn pf-toolbar-btn-print" onclick="window.print()">🖨 인쇄 / PDF 저장</button>
</div>
${checklistHtml}
${detailHtml}
${introHtml}
<script>
var mkZoomLevel = Number(localStorage.getItem('mk_zoom')) || 100;
function mkApplyZoom(){
  document.querySelectorAll('.dt-page, .ck-page, .it-page').forEach(function(el){
    el.style.zoom = mkZoomLevel + '%';
  });
  var v = document.getElementById('mk-zoom-val');
  if (v) v.textContent = mkZoomLevel + '%';
}
function mkZoom(d){
  mkZoomLevel = Math.max(70, Math.min(180, mkZoomLevel + d));
  try { localStorage.setItem('mk_zoom', mkZoomLevel); } catch(e){}
  mkApplyZoom();
}
mkApplyZoom();
</script>
</body>
</html>`;
  }


  /* ============================================================
   * 6. 선택 현황 페이지
   * ============================================================ */
  function _buildChecklistPage(selectedPageIds, studentKey) {
    const config  = MK_CONFIG.resolve();
    const groups  = [
      { key: 'roadmap',    label: '학년 관리 로드맵' },
      { key: 'individual', label: '개별 관리 컨설팅' },
      { key: 'strategy',   label: '대입 전략 컨설팅' },
    ];

    const groupsHtml = groups.map((g, gi) => {
      const pages = MK_CONFIG.pageOrder
        .map(id => config.pages[id])
        .filter(p => p && !p.isOverview && p.group === g.key);

      if (!pages.length) return '';

      const rows = pages.map(p => {
        const isSelected = selectedPageIds.includes(
          Object.keys(config.pages).find(k => config.pages[k] === p)
        );
        const titles = (p.programs || []).map(pr => pr.title).join(' · ');
        return `
          <div class="ck-item ${isSelected ? 'ck-on' : 'ck-off'}">
            <span class="ck-box">${isSelected ? '✓' : ''}</span>
            <span class="ck-name">${p.sbLabel || ''}</span>
            ${titles ? `<span class="ck-sub">${titles}</span>` : ''}
          </div>`;
      }).join('');

      return `
        <div class="ck-group">
          <div class="ck-group-label">
            <span class="ck-gnum">0${gi+1}</span>
            <span class="ck-gtext">${g.label}</span>
          </div>
          ${rows}
        </div>`;
    }).join('');

    const stuLabel = _resolveStudentLabel(studentKey);
    const stuLine = stuLabel ? `<div class="dt-stu-info">${stuLabel}</div>` : '';

    return `
      <div class="ck-page">
        <div class="dt-header">
          <div class="dt-header-left">
            <div class="dt-brand">마이더스K교육컨설팅</div>
            <div class="dt-doc-title">로드맵 프로그램 선택 현황</div>
          </div>
          <div class="dt-header-center">${stuLine}</div>
          <div class="dt-header-right">
            <span class="dt-badge-outline">티처스 컨설턴트</span>
          </div>
        </div>
        <div class="dt-header-line"></div>
        <div class="ck-slogan">복잡한 입시, 이젠 <strong>"아무것도 모르고 오셔도 괜찮습니다."</strong> 지금부터 최선의 로드맵 전략을 기획하고 실행합니다.</div>
        <div class="ck-head">
          <div class="ck-title">프로그램 선택 현황</div>
        </div>
        ${groupsHtml}
        <div class="dt-footer" style="margin-top:auto">
          <div><div class="dt-footer-brand">티처스 컨설턴트의 학생부 관리 컨설팅</div><div class="dt-footer-contact">☎ 053-782-0331 · 월~토 AM 10:00 – PM 18:30</div></div>
          <div class="dt-footer-badge">대구광역시 교육청<br>정식인가 제5513호</div>
        </div>
      </div>`;
  }

  /* ============================================================
   * 7. 회사 소개 페이지
   * ============================================================ */
  function _buildIntroPage(studentKey) {
    const stuName  = (studentKey || '').split(' · ')[0]?.trim() || '';

    const awards = [
      '한국학원총연합회 · 학원 발전 기여부문 표창장',
      '한국학원총연합회 · 건전한 학원기풍 조성 표창장',
      '대구광역시 교육감 · 평생교육 진흥부문 표창장 (제60808호)',
      '김영일 교육컨설팅 업무 제휴',
      '세특구원자 · 네이버 우수콘텐츠 선정',
      '세특구원자 PRO AI 컨설팅 알고리즘 연구 개발',
      '세특구원자 특허 출원 (제40-2023-0535289호)',
       ];
    const awardsHtml = awards.map(a => {
      const [bold, rest] = a.includes(' · ') ? [a.split(' · ')[0], ' · ' + a.split(' · ').slice(1).join(' · ')] : ['', a];
      return `<div class="it-award"><div class="it-dot"></div><div class="it-atext">${bold ? `<strong>${bold}</strong>${rest}` : a}</div></div>`;
    }).join('');

    return `
      <div class="it-page">
        <div class="dt-header">
          <div class="dt-header-left">
            <div class="dt-brand">마이더스K교육컨설팅</div>
            <div class="dt-doc-title">${stuName ? `<span class="it-greeting-name">${stuName}</span> 학생, 학부모님<br>마이더스K교육컨설팅을 소개합니다.` : '회사 소개'}</div>
          </div>
          <div class="dt-header-center" style="flex:2"></div>
          <div class="dt-header-right">
            <span class="dt-badge-outline">티처스 컨설턴트</span>
          </div>
        </div>
        <div class="dt-header-line"></div>
        <div class="it-impact">
          <div class="it-tag">MIDAS-K EDUCATION CONSULTING</div>
          <div class="it-copy">수행평가 주제 선정부터 동아리, 진로 활동, 학생부 세특 제출 관리까지.</div>
          <div class="it-quote">
            <div class="it-quote-pre">CONSULTING PHILOSOPHY</div>
            <div class="it-quote-text">복잡한 입시, 아무것도 모르고 오셔도 괜찮습니다. <em>'최선의 대입 전략'</em>은 이미 시작되었습니다.</div>
          </div>
        </div>
        <div class="it-body">
          <div class="it-desc">연간 700~800회 이상의 개인 및 학교 단체 상담을 통해 누적된 컨설팅 노하우와 실전경험을 바탕으로 고교학점제 및 대학 평가의 실체를 연구하고, 그 대안을 확실하게 제시하는 <strong>대입전략 컨설팅 전문 회사</strong>입니다.</div>
        </div>
        <div class="it-divider"></div>
        <div class="it-awards">
          <div class="it-sec-label"><span class="it-sec-num">수상</span><span class="it-sec-text">주요 수상 및 이력</span></div>
          ${awardsHtml}
        </div>
        <div class="it-EXPERT">
          <span class="it-EXPERT-label">EXPERT</span>
          <div class="it-EXPERT-div"></div>
          <div class="it-EXPERT-text">유웨이 · 진학사 대입컨설턴트 출신 &nbsp;|&nbsp; 채널A \'성적을 부탁해 티처스\' 대구 의대편 컨설턴트</div>
        </div>
        <div class="dt-footer">
          <div><div class="dt-footer-brand">티처스 컨설턴트의 학생부 관리 컨설팅</div><div class="dt-footer-contact">☎ 053-782-0331 · 월~토 AM 10:00 – PM 18:30</div></div>
          <div class="dt-footer-badge">대구광역시 교육청<br>정식인가 제5513호</div>
        </div>
      </div>`;
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
