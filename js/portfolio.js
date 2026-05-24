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

      const group  = page.group;
      const bucket = result[group];
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
    const config  = MK_CONFIG.resolve();
    const totals  = Calc.getAllTotals();
    const grade   = Calc.getGrade();
    const gradeStr = grade ? `고${grade}학년` : '학년 미선택';

    // 학생 정보 파싱 (키: 이름_학교학년_진로)
    const parts     = (studentKey || '').split('_');
    const stuName   = parts[0] || '';
    const stuSchool = parts[1] || '';
    const stuGoal   = parts[2] || '';

    const hasItems = Object.values(items).some(arr => arr.length > 0);

    if (!hasItems) {
      return `
        <div style="text-align:center;padding:60px 20px;color:#86868B;">
          <i class="ti ti-clipboard-off" style="font-size:48px;display:block;margin-bottom:16px;"></i>
          선택된 프로그램이 없습니다.<br>
          <span style="font-size:13px;">프로그램을 선택한 후 다시 시도해 주세요.</span>
        </div>`;
    }

    const sectionHtml = (label, arr, total) => {
      if (!arr.length) return '';
      const rows = arr.map(item => `
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#43434A;">${item.label}</td>
          <td style="padding:7px 0;font-size:13px;font-weight:600;color:#15151A;
                     text-align:right;white-space:nowrap;">${fmt(item.amt)}</td>
        </tr>`).join('');

      return `
        <div class="pf-section">
          <div class="pf-section-title">■ ${label}</div>
          <table style="width:100%;border-collapse:collapse;">
            <tbody>${rows}</tbody>
          </table>
          <div class="pf-subtotal">소계: ${fmt(total)}</div>
        </div>`;
    };

    return `
      <div class="pf-doc">
        <!-- 헤더 -->
        <div class="pf-header">
          <div class="pf-brand">${config.app.brandName}</div>
          <div class="pf-main-title">학생부 관리 컨설팅 포트폴리오</div>
          <div class="pf-license">${config.app.license}</div>
        </div>

        <!-- 학생 정보 -->
        <div class="pf-info-row">
          <div class="pf-info-item">
            <span class="pf-info-label">학년</span>
            <span class="pf-info-value">${gradeStr}</span>
          </div>
          ${stuName ? `
          <div class="pf-info-item">
            <span class="pf-info-label">학생명</span>
            <span class="pf-info-value">${stuName}</span>
          </div>` : ''}
          ${stuSchool ? `
          <div class="pf-info-item">
            <span class="pf-info-label">학교</span>
            <span class="pf-info-value">${stuSchool}</span>
          </div>` : ''}
          ${stuGoal ? `
          <div class="pf-info-item">
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
          ${sectionHtml('로드맵 컨설팅',    items.roadmap,    totals.roadmap)}
          ${sectionHtml('개별 컨설팅',      items.individual, totals.individual)}
          ${sectionHtml('대입 전략 컨설팅', items.strategy,   totals.strategy)}
        </div>

        <!-- 합계 -->
        <div class="pf-total-row">
          <span class="pf-total-label">합계금액</span>
          <span class="pf-total-amt">${fmt(totals.grand)}</span>
        </div>
        <div class="pf-tax">※ 부가세 별도</div>

        <!-- 서명란 -->
        <div class="pf-sign">
          <p>위 컨설팅 프로그램 선택에 동의합니다.</p>
          <div class="pf-sign-row">
            <span>성명: <span class="pf-sign-line" style="width:160px;"></span> (인)</span>
            <span>날짜: ____년 ____월 ____일</span>
          </div>
        </div>
      </div>`;
  }


  /* ============================================================
   * 3. 모달 열기
   * ============================================================ */
  function open() {
    const items      = _collectItems();
    const studentKey = document.getElementById('student-select')?.value || '';
    const body       = _buildHTML(items, studentKey);

    const existing = document.getElementById('pf-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id    = 'pf-modal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-box pf-modal-box">
        <div class="modal-header">
          <span><i class="ti ti-clipboard-list"></i> 컨설팅 포트폴리오</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="admin-save-btn" onclick="Portfolio.print()">
              <i class="ti ti-printer"></i> 인쇄
            </button>
            <button class="modal-close" onclick="document.getElementById('pf-modal').remove()">
              <i class="ti ti-x"></i>
            </button>
          </div>
        </div>
        <div class="modal-body pf-preview" id="pf-preview-area">
          ${body}
        </div>
      </div>`;

    document.body.appendChild(modal);
  }


  /* ============================================================
   * 4. 인쇄
   * ============================================================ */
  function print() {
    window.print();
  }


  /* ============================================================
   * Public API
   * ============================================================ */
  return { open, print };

})();
