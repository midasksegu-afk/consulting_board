/**
 * sign.js — 마이더스K 가입약관 & 운영방침 동의서 서명 시스템
 *
 * 완전 독립 모듈 — config.js / store.js / calc.js 참조 없음
 * Supabase: signatures 테이블 (session_id, image_data, doc_type, created_at)
 *
 * 구조:
 *   탭1 — 가입약관       (서명자: 학부모)
 *   탭2 — 운영방침 동의서 (서명자: 학생)
 */

const Sign = (() => {

  /* ============================================================
   * 1. Supabase 설정 (store.js와 동일 키 재사용)
   * ============================================================ */
  const SUPABASE_URL = 'https://rigdvsxjqzaojwhvucpr.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_FcoQJ-2-LU5ctB-JVzFfEQ_4DvLWt9n';
  const SIG_TABLE    = 'signatures';

  function _headers(extra = {}) {
    return {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...extra,
    };
  }


  /* ============================================================
   * 2. 세션 ID — 고정값 사용
   *    아이패드 홈화면 바로가기 방식. 인터넷만 되면 어디서든 동작.
   * ============================================================ */
  const _sessionId = 'mk_active_session';
  const CONFIG_TABLE = 'app_config';

  // 런타임에 Supabase에서 로드된 pages 데이터
  // { 'rm-a': { prices: [...] }, 'rm-b': ... }
  let _remotePages = null;

  /* ============================================================
   * 2-A. Supabase app_config 로드
   *      페이지 열릴 때 1회 호출 — prices 데이터 캐시
   * ============================================================ */
  async function _loadRemoteConfig() {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${CONFIG_TABLE}?key=eq.settings&select=data&limit=1`,
        { method: 'GET', headers: _headers({ 'Accept': 'application/json' }) }
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (rows && rows.length > 0 && rows[0].data && rows[0].data.pages) {
        _remotePages = rows[0].data.pages;
      }
    } catch (e) {
      console.warn('[Sign] config 로드 실패 — 기본값 사용:', e);
    }
  }

  // pageId의 prices 반환 — remote 우선, 없으면 null
  function _getPrices(pageId) {
    if (_remotePages && _remotePages[pageId] && _remotePages[pageId].prices) {
      return _remotePages[pageId].prices;
    }
    return null;
  }


  /* ============================================================
   * 3. 약관 데이터
   * ============================================================ */
  const TERMS_DATA = {

    /* ── 가입약관 ── */
    terms: {
      docType:     'terms',
      tabLabel:    '가입약관',
      title:       '학생부 관리 컨설팅\n회원가입 신청서 및 가입약관',
      signerLabel: '가입자(학부모성명)',
      sections: [
        {
          title: '❒ 컨설팅 항목',
          type:  'consulting-items',
          // 하드코딩 제거 — _buildConsultingTable(gradeNum) 동적 생성
        },
        {
          title: '❒ 가입 유의사항',
          type:  'list',
          items: [
            '학생부 관리 컨설팅은 학기 및 학년 단위 관리 서비스로 결제와 동시에 효력이 발생하며, 1년 단위 계약이 아니라 약관에 명시한 기한을 따릅니다.',
            '계약시점부터 필요한 개인정보 수집 및 이용에 동의가 된 것으로 판단하며, 제3자에게 정보 제공하지 않습니다. 해당 정보는 가입 철회시 또는 고등학교 졸업 시점까지 보유 및 이용하며 입시관련 성적 및 자료, 합격대학 통계를 위한 정보 활용 동의도 포함됩니다. (수집범위 : 학교생활기록부, 성적표, 연락처 및 기타 신상정보)',
            '관리 종료 이후 컨설팅 제공실적(추천 주제, 기재 정리 파일, 활동 포트폴리오 등 학생부 관리 제반 정보)은 마이더스K교육컨설팅의 자산으로 귀속 처리됩니다.',
          ],
        },
        {
          title: '❒ 가입해지 시 환불규정',
          type:  'refund',
          rows: [
            { period: '1개월 미만',        rule: '제공받은 서비스 차감 후 환불 (컨설팅 항목별 차감금액 현황표 기준)' },
            { period: '1개월 이상~3개월 미만',  rule: '가입금액의 30% 차감' },
            { period: '3개월 이상~6개월 미만',  rule: '가입금액의 50% 차감' },
            { period: '6개월 이상~9개월 미만',  rule: '가입금액의 80% 차감' },
            { period: '9개월 이상 경과',    rule: '환불 금액 없음' },
          ],
          note: '프로그램 해지 시 위의 기간별 환불규정이 적용되며, 더불어 아래 항목별 차감금액에 따라 제공받은 컨설팅 항목 누적금액이 가입기간에 따른 환불금액보다 많을 경우에는 최종 환불 금액이 더 적거나 없을 수 있습니다. 상호 인지하에 해지 의사를 명확히 밝힌 일자가 해지확정일자이며, 환급금은 가입시작일로부터 해지확정일자 기준으로 정산됩니다.',
        },
        {
          title: '❒ 컨설팅 항목별 차감금액 현황표 (가입 중도 해지 시 적용)',
          type:  'table',
          content: `
<table class="sg-table">
  <thead>
    <tr><th>#</th><th>컨설팅 항목</th><th>차감 금액</th></tr>
  </thead>
  <tbody>
    <tr class="sg-group-row"><td colspan="3">학년관리 로드맵</td></tr>
    <tr><td>1</td><td>A.세특관리 — 세특 강화 솔루션 (1과목 이상 기재 요약 및 기재 제출 지원 진행 시)</td><td>학기당 1,300,000</td></tr>
    <tr><td>2</td><td>A.세특관리 — N차 심화 탐구 연결 주제 기획 (세특구원자 보고서 설계도 별도 과금)</td><td>건당 100,000</td></tr>
    <tr><td>3</td><td>A.세특관리 — 학생부 분석 및 심화 확장 주제 추천</td><td>회당 300,000</td></tr>
    <tr><td>4</td><td>B.수행관리 (1건 이상 수행에 관한 컨설팅 지원 시)</td><td>학기당 1,300,000</td></tr>
    <tr><td>5</td><td>C.주제추천 — 방향성 코칭 (회원 유지시 무료, 가입 철회시 과금)</td><td>회당 100,000</td></tr>
    <tr><td>6</td><td>D.대면컨설팅 — RPM 컨설팅 (세특 코칭 및 활동 방향 설계)</td><td>회당 100,000</td></tr>
    <tr><td>7</td><td>D.대면컨설팅 — 성적누적분석 초기 SYSTEM 세팅 / 성적 입력시</td><td>100,000 / 300,000</td></tr>
    <tr><td>8</td><td>D.대면컨설팅 — 맞춤 진로 진학 상담 및 질의응답 진행시</td><td>회당 100,000</td></tr>
    <tr><td>9</td><td>E.기본관리 — 학종특강 (수업 미진행시 부과하지 않음)</td><td>회당 200,000</td></tr>
    <tr><td>10</td><td>E.기본관리 — 행정관리 (상담 스케줄, 컨설팅 밴드 운영관리)</td><td>월별 100,000</td></tr>
    <tr class="sg-group-row"><td colspan="3">대입전략 컨설팅</td></tr>
    <tr><td>11</td><td>수시 원서전략 컨설팅 (수시 예비 상담 이후 환불 불가)</td><td>회당 400,000</td></tr>
    <tr><td>12</td><td>정시 원서전략 컨설팅</td><td>회당 350,000</td></tr>
    <tr><td>13</td><td>가채점 컨설팅 (상담 이후 환불 불가)</td><td>회당 100,000</td></tr>
    <tr><td>14</td><td>면접 컨설팅 (분석 및 질문지 작성 후 대면 미진행 시 20만원 차감)</td><td>350,000 / 400,000</td></tr>
  </tbody>
</table>`,
        },
      ],
      finalNote: '위 사항에 대해 숙지하였으며 개인정보수집 및 이용에 동의합니다.',
    },


    /* ── 운영방침 동의서 ── */
    policy: {
      docType:     'policy',
      tabLabel:    '운영방침 동의서',
      title:       '컨설팅 운영 방침 동의서',
      signerLabel: '가입자',
      intro: '마이더스K교육컨설팅은 대구광역시 교육청 컨설팅부문 정식인가(제5513호) 학원(업체)으로 교육부 \'학교생활기록부 기재 관련 시행령 및 방침\'을 준수하고 이를 고지합니다.',
      sections: [
        {
          title: '❐ 학교생활기록부 관련 교육부 시행령에 포함된 \'위법\'행위 규정 사항 고지',
          type:  'notice-list',
          items: [
            { num: '1', title: '셀프 학생부', desc: '학생으로부터 기재할 내용을 제출받아 그대로 기재하는 행위' },
            { num: '2', title: '교사에게 사교육기관 컨설팅 제공', desc: '부당한 기재 및 수정을 요구하는 행위' },
            { num: '3', title: '허위 사실 기재', desc: '\'학생 성적 관련 비위\'로 간주되어 징계 양정 기준이 적용되며 징계 감경에서도 제외' },
          ],
        },
        {
          title: '❐ 교육청 지도 점검',
          type:  'alert',
          text:  '탐구 활동 보고서 대행 대필 및 이에 준하는(내용 수정 및 첨삭) 행위',
        },
        {
          title: '❐ 학생부 관리 컨설팅 운영 방식 안내 (세부규정)',
          type:  'sub-title',
        },
        {
          title: '01. 공통',
          type:  'numbered',
          items: [
            '단순 조사 대행, 보고서 작성 대행, 수행평가 중간 첨삭 등 학생의 주도성 또는 수행평가의 공정성을 저해할 수 있는 부분은 제공하지 않습니다. 또한 원활한 컨설팅 운영과 안정성을 위해, 당일 접수 및 당일 제출을 요구하는 건에 대한 지원은 원칙적으로 제공하지 않습니다.',
            '마이더스K는 학생의 생기부 경쟁력 구축에 역량을 집중하기 위해 컨설팅 프로그램을 \'세특관리\', \'수행관리\', \'주제추천\', \'대면관리\', \'기본관리\'로 구분하여 운영합니다. 이에 각 프로그램은 가입 약관에 명시된 컨설팅 항목, 프로그램 구성, 제공 횟수 기준 등에 따라 관리가 진행됩니다.',
            '온라인으로 업로드하는 수행평가 및 탐구 관련 자료에는 \'과목명_활동명\' 또는 \'탐구 주제\'와 더불어 \'제출기한\'을 명시해야 합니다. 학생은 활동이 발생한 즉시 지정된 컨설팅 밴드를 통해 관련 자료를 업로드해야 하며, 정기적인 자료 요청 공지에도 불구하고 자료가 제출되지 않거나 필수 정보가 누락되어 발생하는 문제에 대해서는 책임지지 않습니다.',
            '평일 17시 이후 접수된 요청 건은 다음 업무일 처리를 원칙으로 하며, 토요일 16시 이후 접수된 요청 건은 다음 첫 업무일 처리를 원칙으로 합니다. 정기 휴무일인 일요일 및 공휴일에는 요청 건에 대한 지원이 원칙적으로 제공되지 않습니다. 긴급한 수행평가 주제나 보고서 작성이 필요한 경우에는 24시간 이용 가능한 세특구원자(보고서 설계도 플랫폼)을 활용해 주시기 바랍니다.',
            '컨설팅 과정에서 제공되는 자료, 코칭 내용, 주제 추천, 보고서 설계도 등은 학생의 학습과 탐구 방향 설정을 돕기 위한 참고 자료이며, 학생은 자신의 수업 맥락과 이해 수준에 맞게 내용을 재구성한다면 더 좋은 결과가 따를 것입니다.',
          ],
        },
        {
          title: '02. A. 세특 관리',
          type:  'numbered',
          items: [
            '학생이 실제로 수행한 기록물에 대해서만 세특 기재를 진행합니다. 증빙 기록물이 없거나 단순 신문 스크랩, 책자 사진만 제출한 경우에는 컨설팅이 제한될 수 있습니다.',
            '수학 교과의 공식 나열 및 문제풀이, 과학 교과의 실험, 영어 교과의 원문 등 학생의 탐구 의도를 파악하기 어려운 기록물은 \'해석지\' 또는 \'한글본\'을 반드시 첨부해야 합니다.',
            '세특 또는 자기평가서 제공 이후의 수정 요청은 컨설턴트가 중요한 수정 사항이나 누락 사항이 있다고 판단한 경우, 또는 학생이 구체적인 수정 요청 사항을 직접 전달한 경우에 한해 가능합니다.',
            '심화 확장 스토리 구축 과정에서 이전 활동과 연결되는 주제는 세특구원자 플랫폼을 통해 관리 밴드에 링크 또는 댓글 방식으로 제공하는 것을 원칙으로 합니다.',
            '모든 활동 보고서가 최종 세특 정리본으로 제공되는 것은 아닙니다. 세특 경쟁력과 기재 적합성을 기준으로 우선순위가 높은 2~3개의 우수 활동을 선별하여 최종 세특 정리본으로 제공합니다.',
          ],
        },
        {
          title: '03. B. 수행 관리',
          type:  'numbered',
          items: [
            '수행관리 프로그램은 수행평가 준비 과정에서 발생하는 불필요한 시간 소모를 줄이고 정리할 수 있도록 돕는 것을 목표로 합니다. 다만 어려운 수학 문제의 풀이 과정, 자신의 롤 모델 조사처럼 개인적 감상이나 경험이 중심이 되는 활동, 학교 행사 참여 보고서처럼 학생 본인만이 확인하고 작성할 수 있는 내용은 활동 지원이 제한될 수 있습니다.',
            '수행관리 결과물은 수행평가의 공정성을 침해하지 않는 범위에서 탐구 방향, 보고서 흐름, 핵심 기준 정리, 발표 구성 등의 형태로 제공되며, 완성본 대행 또는 제출용 문안 작성은 제공하지 않습니다.',
            '옵션 A(방향성 코칭)는 탐구 주제 선정, 자료 활용 방향, 보고서 전개 방식 등 기본 방향을 잡을 수 있도록 코칭하는 방식입니다. 옵션 B(세특구원자 활용)는 탐구 주제, 논문 및 도서 등 검증된 자료, 과정, 결과 및 고찰 패키지로 구성된 보고서 설계도 및 초안을 제시하는 방식입니다.',
            '수행관리에서 제공되는 자료와 코칭 내용은 학생의 수행평가 준비를 돕기 위한 참고 자료이며, 학교 제출물의 최종 작성 및 제출 책임은 학생에게 있습니다.',
            '수행평가의 평가 결과, 점수, 교사 피드백, 생기부 반영 여부 등은 학교의 평가 기준과 교사의 판단에 따라 달라질 수 있으므로, 수행관리 프로그램이 특정 결과를 보장하지는 않습니다.',
          ],
        },
        {
          title: '04. C. 주제 추천',
          type:  'numbered',
          items: [
            '모든 수행평가 활동에서 주제를 추천받는 방식은 학생의 탐구 주도성을 저해하고, 학생다운 활동의 자연스러운 형성을 방해할 수 있습니다. 이에 마이더스K는 일괄 과금 방식이 아니라 학생의 상황과 필요에 따라 탐구 주제 추천 프로그램을 선택적으로 운영합니다.',
            '교과 세특은 무분별하게 진로와 연결하기보다 교과목 개념의 심화 확장 주제로 삼는 것이 평가에서 더 유리합니다.',
            '컨설팅 지원 업무시간 이후 긴급한 주제 선정이 필요한 경우, 우선 관리 밴드 내 \'나만의 심화 확장\' 게시판을 확인해 주시기 바랍니다.',
            '수행 조건이 충분히 제시되지 않은 요청이나, 개인적 판단 또는 선호에 따라 동일 활동에 대해 반복적으로 이루어지는 주제 변경 요청은 지원이 제한될 수 있습니다.',
            '실험 여건이나 학교 기자재 확인이 어려운 실험 활동은 주제 추천이 제한될 수 있습니다. 실험 활동에서는 실험의 난이도 자체보다 학생이 어떤 호기심에서 출발했는지, 과정에서 어떤 의문을 발견해 심화 확장했는지가 더 중요합니다.',
          ],
        },
      ],
      finalNotes: [
        '본 컨설팅은 학교 수행 탐구 활동 전반에 대해 무한한 책임을 부담하는 서비스가 아니며, 학생의 탐구 방향 설정과 학습 성장을 지원하는 것을 목적으로 합니다. <strong>이에 보고서 첨삭, 작성 대행 등 학생 주도성과 평가 공정성을 저해할 수 있는 지원은 제공하지 않습니다.</strong>',
        '<strong>관리 지원 범위를 벗어난 요청, 동일 활동에 대한 반복적인 주제 변경 요청, 학교 활동 과정에서 발생하는 모든 변수에 대한 과도한 요구</strong> 등으로 정상적인 컨설팅 운영에 지속적인 지장이 발생할 경우, 마이더스K교육컨설팅은 관리 중지, 계약 갱신 거절 또는 가입 해지를 요청할 수 있습니다.',
        '마이더스K교육컨설팅은 학생의 <strong>탐구 과정과 학습 성장을 지원하되, 학교 평가 결과, 생기부 반영 여부에 대한 최종 책임을 부담하지 않는다</strong>는 것을 확인합니다.',
      ],
      finalNote: '본인은 위 운영 방침과 지원 관련 세부 규정을 충분히 확인하였으며, 마이더스K교육컨설팅의 관리 범위 및 지원 제한 사항에 동의합니다.',
    },
  };


  /* ============================================================
   * 4. 서명 캔버스 상태
   * ============================================================ */
  let _canvas      = null;
  let _ctx         = null;
  let _drawing     = false;
  let _hasSignature = false;
  let _currentTab  = 'terms';   // 'terms' | 'policy'
  let _pollTimer   = null;
  let _signatureData = null;    // 수신된 서명 base64
  let _selectedPages  = [];      // 선택된 pageId 목록 (index.html → URL 파라미터)
  let _isSemesterDc   = false;  // 2학기 DC 활성 여부 (index.html → URL 파라미터)


  /* ============================================================
   * 5. 초기화
   * ============================================================ */
  async function init() {
    // 이전 세션 서명 즉시 삭제 (새 상담 시작)
    await _deleteSignature();
    // Supabase config 먼저 로드 (prices 데이터)
    await _loadRemoteConfig();
    _renderTabs();
    _bindEvents();
    _switchTab('terms');
    _startPolling();
    // 보드에서 전달된 파라미터 자동 채움
    _applyUrlParams();
  }

  function _bindEvents() {
    document.getElementById('sg-tab-terms')?.addEventListener('click',  () => _switchTab('terms'));
    document.getElementById('sg-tab-policy')?.addEventListener('click', () => _switchTab('policy'));
  }


  /* ============================================================
   * 6. 탭 전환
   * ============================================================ */
  function _switchTab(tab) {
    _currentTab = tab;
    _signatureData = null;

    document.querySelectorAll('.sg-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    const data = TERMS_DATA[tab];
    _renderDocument(data);
    _renderInputForm(data);
    _initCanvas();
    _updateSignPreview(null);
  }


  /* ============================================================
   * 7. 탭 버튼 렌더
   * ============================================================ */
  function _renderTabs() {
    const container = document.getElementById('sg-tabs');
    if (!container) return;
    container.innerHTML = `
      <button class="sg-tab-btn" data-tab="terms"  id="sg-tab-terms">
        📋 가입약관 <span class="sg-tab-sub">학부모 서명</span>
      </button>
      <button class="sg-tab-btn" data-tab="policy" id="sg-tab-policy">
        📄 운영방침 동의서 <span class="sg-tab-sub">학생 서명</span>
      </button>`;
  }


  /* ============================================================
   * 8. 약관 본문 렌더
   * ============================================================ */
  function _renderDocument(data) {
    const el = document.getElementById('sg-doc-body');
    if (!el) return;

    let html = '';

    // 인트로 문구 (운영방침만)
    if (data.intro) {
      html += `<div class="sg-intro">${data.intro}</div>`;
    }

    // 섹션 렌더
    data.sections.forEach(sec => {
      html += `<div class="sg-section">`;

      if (sec.type === 'sub-title') {
        html += `<div class="sg-sub-title">${sec.title}</div>`;
        html += `</div>`;
        return;
      }

      html += `<div class="sg-section-title">${sec.title}</div>`;

      if (sec.type === 'consulting-items') {
        // 초기 렌더: gradeNum=0 (학년 미선택 상태)
        // 학년 선택 시 _onGradeChange()가 실시간 갱신
        html += `<div class="sg-table-wrap" id="sg-consulting-table">` +
          _buildConsultingTable(0) + `</div>`;
        html += `</div>`;
        return;
      }

      if (sec.type === 'table') {
        html += `<div class="sg-table-wrap">${sec.content}</div>`;
      }

      if (sec.type === 'list') {
        html += `<ol class="sg-ol">`;
        sec.items.forEach((item, i) => {
          html += `<li><span class="sg-li-num">${i + 1}</span><span>${item}</span></li>`;
        });
        html += `</ol>`;
      }

      if (sec.type === 'notice-list') {
        html += `<div class="sg-notice-list">`;
        sec.items.forEach(item => {
          html += `
            <div class="sg-notice-item">
              <span class="sg-notice-num">${item.num}</span>
              <div>
                <strong>${item.title}</strong>
                <span class="sg-notice-desc">${item.desc}</span>
              </div>
            </div>`;
        });
        html += `</div>`;
      }

      if (sec.type === 'alert') {
        html += `<div class="sg-alert">${sec.text}</div>`;
      }

      if (sec.type === 'numbered') {
        html += `<div class="sg-numbered-list">`;
        sec.items.forEach((item, i) => {
          html += `
            <div class="sg-num-row">
              <span class="sg-num-badge">${i + 1}</span>
              <p>${item}</p>
            </div>`;
        });
        html += `</div>`;
      }

      if (sec.type === 'refund') {
        html += `<div class="sg-table-wrap"><table class="sg-table">
          <thead><tr><th>가입기간</th><th>환불규정</th></tr></thead>
          <tbody>`;
        sec.rows.forEach(r => {
          html += `<tr><td>${r.period}</td><td>${r.rule}</td></tr>`;
        });
        html += `</tbody></table></div>`;
        if (sec.note) html += `<div class="sg-refund-note">${sec.note}</div>`;
      }

      html += `</div>`;
    });

    // 필독 참고 사항 (운영방침)
    if (data.finalNotes) {
      html += `<div class="sg-final-notes">`;
      data.finalNotes.forEach((note, i) => {
        html += `
          <div class="sg-final-note-item">
            <span class="sg-final-note-num">${i + 1}</span>
            <p>${note}</p>
          </div>`;
      });
      html += `</div>`;
    }

    el.innerHTML = html;
  }


  /* ============================================================
   * 9. 가입정보 입력폼 렌더
   * ============================================================ */
  function _renderInputForm(data) {
    const el = document.getElementById('sg-input-form');
    if (!el) return;

    if (data.docType === 'terms') {
      el.innerHTML = `
        <div class="sg-form-title">가입 정보 입력</div>
        <div class="sg-form-note">🔒 자동입력 항목은 컨설팅 보드에서 가져옵니다</div>
        <div class="sg-form-grid">
          <div class="sg-form-row">
            <label>회원명 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-name" placeholder="학생 이름" readonly>
          </div>
          <div class="sg-form-row">
            <label>학교 / 학년 / 진로목표 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-school" placeholder="예) ○○고 / 고2 / 의대" readonly>
          </div>
          <div class="sg-form-row">
            <label>상품명 <span class="sg-auto-badge">자동</span></label>
            <div style="display:flex;gap:6px;align-items:center;">
              <select class="sg-input" id="f-grade" style="width:80px;flex-shrink:0;"
                onchange="Sign._onGradeChange()">
                <option value="">학년</option>
                <option value="고1">고1</option>
                <option value="고2">고2</option>
                <option value="고3">고3</option>
              </select>
              <input class="sg-input sg-input-auto" id="f-product" value="학생부 관리 컨설팅" readonly style="flex:1;">
            </div>
          </div>
          <div class="sg-form-row">
            <label>가입금액 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-amount" placeholder="보드에서 자동 입력" readonly>
          </div>
          <div class="sg-form-row">
            <label>특약 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-special" placeholder="DC 적용 내역 자동 입력" readonly>
          </div>
          <div class="sg-form-divider">✏️ 직접 입력</div>
          <div class="sg-form-row">
            <label>가입 시작일</label>
            <input class="sg-input" id="f-start" type="date"
              oninput="Sign._calcExpiry()">
          </div>
          <div class="sg-form-row">
            <label>가입기간 <span class="sg-auto-badge">자동계산</span></label>
            <input class="sg-input sg-input-auto" id="f-period-display"
              placeholder="시작일 입력 시 자동계산" readonly>
          </div>
          <div class="sg-form-row">
            <label>관리유예기간 <span class="sg-auto-badge">자동계산</span></label>
            <input class="sg-input sg-input-auto" id="f-expiry"
              placeholder="시작일 입력 시 자동계산" readonly>
          </div>
          <div class="sg-form-row">
            <label>학부모 성명</label>
            <input class="sg-input" id="f-parent" placeholder="학부모 성함을 입력하세요">
          </div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="sg-form-title">서명자 정보</div>
        <div class="sg-form-note">🔒 자동입력 항목은 컨설팅 보드에서 가져옵니다</div>
        <div class="sg-form-grid">
          <div class="sg-form-row">
            <label>학생명 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-name" placeholder="학생 이름" readonly>
          </div>
          <div class="sg-form-row">
            <label>학교 / 학년</label>
            <input class="sg-input sg-input-auto" id="f-school" placeholder="예) ○○고 / 고2" readonly>
          </div>
        </div>`;
    }
  }


  /* ============================================================
   * 10. 서명 캔버스 초기화
   * ============================================================ */
  function _initCanvas() {
    _canvas = document.getElementById('sg-canvas');
    if (!_canvas) return;
    _ctx = _canvas.getContext('2d');
    _hasSignature = false;
    _clearCanvas();
    _bindCanvasEvents();
  }

  function _clearCanvas() {
    if (!_ctx || !_canvas) return;
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _ctx.fillStyle = '#fff';
    _ctx.fillRect(0, 0, _canvas.width, _canvas.height);
    _hasSignature = false;
    document.getElementById('sg-canvas-placeholder')?.style.setProperty('display', 'flex');
  }

  function _bindCanvasEvents() {
    if (!_canvas) return;
    // 중복 바인딩 방지
    const newCanvas = _canvas.cloneNode(true);
    _canvas.parentNode.replaceChild(newCanvas, _canvas);
    _canvas = newCanvas;
    _ctx    = _canvas.getContext('2d');

    _ctx.strokeStyle = '#15151A';
    _ctx.lineWidth   = 2.5;
    _ctx.lineCap     = 'round';
    _ctx.lineJoin    = 'round';

    const placeholder = document.getElementById('sg-canvas-placeholder');

    const getPos = (e) => {
      const rect = _canvas.getBoundingClientRect();
      const scaleX = _canvas.width  / rect.width;
      const scaleY = _canvas.height / rect.height;
      const src = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * scaleX,
        y: (src.clientY - rect.top)  * scaleY,
      };
    };

    const start = (e) => {
      e.preventDefault();
      _drawing = true;
      if (placeholder) placeholder.style.display = 'none';
      const pos = getPos(e);
      _ctx.beginPath();
      _ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
      e.preventDefault();
      if (!_drawing) return;
      const pos = getPos(e);
      _ctx.lineTo(pos.x, pos.y);
      _ctx.stroke();
      _hasSignature = true;
    };

    const end = (e) => {
      e.preventDefault();
      _drawing = false;
    };

    // 마우스
    _canvas.addEventListener('mousedown',  start);
    _canvas.addEventListener('mousemove',  draw);
    _canvas.addEventListener('mouseup',    end);
    _canvas.addEventListener('mouseleave', end);
    // 터치 (아이패드)
    _canvas.addEventListener('touchstart', start, { passive: false });
    _canvas.addEventListener('touchmove',  draw,  { passive: false });
    _canvas.addEventListener('touchend',   end,   { passive: false });
  }


  /* ============================================================
   * 11. 서명 요청 — Supabase에 세션 생성 + 아이패드 대기
   * ============================================================ */
  async function requestSignature() {
    _signatureData = null;

    // 기존 같은 세션 정리
    await _cleanOldSignatures();

    // 아이패드용 서명 URL 표시
    const signUrl = window.location.origin + window.location.pathname
      + '?sign_session=' + _sessionId + '&doc=' + _currentTab;

    _showSignRequestModal(signUrl);
    _startPolling();
  }

  function _showSignRequestModal(url) {
    const existing = document.getElementById('sg-request-modal');
    if (existing) existing.remove();

    // QR 코드 생성 (Google Charts API 활용 — 외부 의존 최소화)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

    const modal = document.createElement('div');
    modal.id = 'sg-request-modal';
    modal.className = 'sg-modal-overlay';
    modal.innerHTML = `
      <div class="sg-modal-box">
        <div class="sg-modal-header">
          <span>아이패드에서 서명받기</span>
          <button onclick="document.getElementById('sg-request-modal').remove()">✕</button>
        </div>
        <div class="sg-modal-body">
          <div class="sg-qr-wrap">
            <img src="${qrUrl}" alt="QR코드" width="200" height="200">
          </div>
          <div class="sg-qr-desc">
            아이패드 카메라로 QR을 스캔하거나<br>
            아이패드 홈화면 바로가기로 접속 후 서명해주세요
          </div>
          <div class="sg-qr-url">${url}</div>
          <div class="sg-poll-status" id="sg-poll-status">
            <span class="sg-poll-dot"></span> 서명 대기 중...
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }


  /* ============================================================
   * 12. 아이패드 서명 저장 — Supabase
   * ============================================================ */
  async function submitSignatureFromTablet() {
    if (!_hasSignature) {
      alert('서명을 먼저 해주세요.');
      return;
    }
    const imgData = _canvas.toDataURL('image/png');

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${SIG_TABLE}`, {
        method:  'POST',
        headers: _headers({ 'Prefer': 'return=minimal' }),
        body:    JSON.stringify({
          session_id: _sessionId,
          image_data: imgData,
          doc_type:   _currentTab,
        }),
      });
      if (!res.ok) throw new Error('저장 실패');

      document.getElementById('sg-tablet-confirm')?.classList.add('visible');
      document.getElementById('sg-canvas-area')?.classList.add('submitted');
    } catch (e) {
      alert('서명 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
      console.error('[Sign] submitSignature 실패:', e);
    }
  }


  /* ============================================================
   * 13. 폴링 — 데스크탑에서 서명 수신 대기
   * ============================================================ */
  function _startPolling() {
    _stopPolling();
    _pollTimer = setInterval(_pollSignature, 2000);
  }

  function _stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  async function _pollSignature() {
    if (!_sessionId) return;
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${SIG_TABLE}?session_id=eq.${_sessionId}&limit=1`,
        { method: 'GET', headers: _headers({ 'Accept': 'application/json' }) }
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (rows && rows.length > 0) {
        _stopPolling();
        _signatureData = rows[0].image_data;
        _updateSignPreview(_signatureData);

        // 수신 완료 UI
        const statusEl = document.getElementById('sg-poll-status');
        if (statusEl) {
          statusEl.innerHTML = '<span style="color:#1a6e3c;">✓ 서명 수신 완료</span>';
        }
        setTimeout(() => {
          document.getElementById('sg-request-modal')?.remove();
        }, 1200);
      }
    } catch (e) { /* 네트워크 오류 무시 */ }
  }

  function _updateSignPreview(imgData) {
    const preview = document.getElementById('sg-sign-preview');
    const empty   = document.getElementById('sg-sign-empty');
    if (!preview || !empty) return;
    if (imgData) {
      preview.src = imgData;
      preview.style.display = 'block';
      empty.style.display   = 'none';
    } else {
      preview.style.display = 'none';
      empty.style.display   = 'flex';
    }
  }


  /* ============================================================
   * 14. 이전 서명 정리
   * ============================================================ */
  async function _cleanOldSignatures() {
    try {
      // 1시간 이상 된 서명 삭제
      const cutoff = new Date(Date.now() - 3600000).toISOString();
      await fetch(
        `${SUPABASE_URL}/rest/v1/${SIG_TABLE}?created_at=lt.${cutoff}`,
        { method: 'DELETE', headers: _headers() }
      );
    } catch (e) { /* 무시 */ }
  }


  /* ============================================================
   * 15. 로컬 캔버스 서명 사용 (데스크탑 직접 서명)
   * ============================================================ */
  function useLocalSignature() {
    if (!_hasSignature) {
      alert('서명란에 서명을 먼저 해주세요.');
      return;
    }
    _signatureData = _canvas.toDataURL('image/png');
    _updateSignPreview(_signatureData);
  }

  function clearSignature() {
    _clearCanvas();
    _signatureData = null;
    _updateSignPreview(null);
  }


  /* ============================================================
   * 16. 입력값 수집
   * ============================================================ */
  function _collectFormData() {
    const get = (id) => document.getElementById(id)?.value?.trim() || '';
    if (_currentTab === 'terms') {
      // 가입기간: 자동계산된 표시값 사용
      const start  = get('f-start');
      const expiry = get('f-expiry');
      const period = get('f-period-display') || (start ? start : '');
      // 상품명 합성: 학년 + 고정 텍스트 ('고' 없이 드롭다운 값 그대로)
      const grade   = get('f-grade');
      const product = grade ? `${grade} 학생부 관리 컨설팅` : '학생부 관리 컨설팅';
      return {
        name:    get('f-name'),
        school:  get('f-school'),
        product,
        period,
        expiry,
        amount:  get('f-amount'),
        special: get('f-special'),
        parent: get('f-parent'),
      };
    } else {
      return {
        name:   get('f-name'),
        school: get('f-school'),
      };
    }
  }


  /* ============================================================
   * 17. PDF 출력
   * ============================================================ */
  function printDocument() {
    // 가입약관 탭에서 학년 미선택 차단
    if (_currentTab === 'terms') {
      const grade = document.getElementById('f-grade')?.value || '';
      if (!grade) {
        alert('학년을 선택해 주세요.\n상품명의 학년(고1/고2/고3)을 먼저 선택해야 출력할 수 있습니다.');
        document.getElementById('f-grade')?.focus();
        return;
      }
    }
    if (!_signatureData) {
      alert('서명이 없습니다.\n아이패드로 서명하거나 서명란에 직접 서명 후 [서명 적용] 버튼을 눌러주세요.');
      return;
    }
    const form = _collectFormData();
    const data = TERMS_DATA[_currentTab];
    const html = _buildPrintHTML(data, form, _signatureData);

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();

    // 출력 후 서명 DB 정리
    _deleteSignature();
  }

  async function _deleteSignature() {
    if (!_sessionId) return;
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/${SIG_TABLE}?session_id=eq.${_sessionId}`,
        { method: 'DELETE', headers: _headers() }
      );
    } catch (e) { /* 무시 */ }
  }


  /* ============================================================
   * 18. 출력 HTML 생성 — portfolio.js dt- 컨셉 통일
   * ============================================================ */
  function _buildPrintHTML(data, form, signatureImg) {
    const today = (() => {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}년 ${p(d.getMonth()+1)}월 ${p(d.getDate())}일`;
    })();

    // 가입정보 테이블 (가입약관만)
    const infoTableHtml = data.docType === 'terms' ? `
      <div class="sg-info-card">
        <table class="sg-info-table">
          <tr>
            <th>회원명</th>
            <td>${form.name || '　　　　　'}</td>
            <th>학교/학년/계열</th>
            <td>${form.school || '　　　　　'}</td>
          </tr>
          <tr>
            <th>상품명</th>
            <td colspan="3">${form.product || '학생부 관리 컨설팅'}</td>
          </tr>
          <tr>
            <th>가입기간</th>
            <td colspan="3">
              ${form.period || '　　년 　월 　일 ~ 　　년 　월 　일'}
              ${form.expiry ? `&nbsp;&nbsp;(관리유예기간 : ${form.expiry} 까지)` : '&nbsp;&nbsp;(관리유예기간 : 　　년 2월 15일 까지)'}
            </td>
          </tr>
          <tr>
            <th>가입금액</th>
            <td>${form.amount || '　　　　　'}원</td>
            <th>특약</th>
            <td>${form.special || ''}</td>
          </tr>
          <tr>
            <td colspan="4" style="font-size:11px;color:#555;padding-top:8px;border-top:1px solid #e0e0e0;">
              * 관리유예기간은 학년 변경 전의 성적보관을 위한 최종관리기간으로, 유예기간이 지나면 관리는 자동 종료됩니다.<br>
              * 12월부터 1월 말일까지 갱신을 희망하는 회원은 우선으로 가입 대상이 될 수 있으며, 이후로는 관리 인원 제한 정책에 따라 갱신이 불가할 수 있습니다.
            </td>
          </tr>

        </table>
      </div>` : `
      <div class="sg-info-card" style="margin-bottom:16px;">
        <table class="sg-info-table">
          <tr>
            <th>학생명</th><td>${form.name || '　　　　　'}</td>
            <th>학교/학년</th><td>${form.school || '　　　　　'}</td>
          </tr>
        </table>
      </div>`;

    // 섹션 본문 HTML
    let bodyHtml = '';
    if (data.intro) {
      bodyHtml += `<div class="sg-pr-intro">${data.intro}</div>`;
    }

    data.sections.forEach(sec => {
      if (sec.type === 'sub-title') {
        bodyHtml += `<div class="sg-pr-subtitle">${sec.title}</div>`;
        return;
      }
      bodyHtml += `<div class="sg-pr-section">`;
      bodyHtml += `<div class="sg-pr-section-title">${sec.title}</div>`;

      if (sec.type === 'consulting-items') {
        // 출력물 — 드롭다운 선택값 직접 참조 (가장 정확)
        const gradeEl  = document.getElementById('f-grade');
        const gradeNum = gradeEl ? (parseInt(gradeEl.value.replace(/[^0-9]/g, '')) || 0) : 0;
        bodyHtml += _buildConsultingTable(gradeNum, _selectedPages, _isSemesterDc);
        bodyHtml += `</div>`;
        return;
      }
      if (sec.type === 'table') {
        bodyHtml += sec.content;
      }
      if (sec.type === 'list') {
        bodyHtml += `<ol class="sg-pr-ol">`;
        sec.items.forEach((item, i) => {
          bodyHtml += `<li><span class="sg-pr-li-num">${i+1}</span><span>${item}</span></li>`;
        });
        bodyHtml += `</ol>`;
      }
      if (sec.type === 'notice-list') {
        sec.items.forEach(item => {
          bodyHtml += `<div class="sg-pr-notice-item">
            <span class="sg-pr-notice-num">${item.num}</span>
            <div><strong>${item.title}</strong> — ${item.desc}</div>
          </div>`;
        });
      }
      if (sec.type === 'alert') {
        bodyHtml += `<div class="sg-pr-alert">${sec.text}</div>`;
      }
      if (sec.type === 'numbered') {
        sec.items.forEach((item, i) => {
          bodyHtml += `<div class="sg-pr-num-row">
            <span class="sg-pr-num-badge">${i+1}</span>
            <p>${item}</p>
          </div>`;
        });
      }
      if (sec.type === 'refund') {
        bodyHtml += `<table class="sg-table sg-pr-refund">
          <thead><tr><th>가입기간</th><th>환불규정</th></tr></thead>
          <tbody>`;
        sec.rows.forEach(r => {
          bodyHtml += `<tr><td>${r.period}</td><td>${r.rule}</td></tr>`;
        });
        bodyHtml += `</tbody></table>`;
        if (sec.note) bodyHtml += `<div class="sg-pr-refund-note">${sec.note}</div>`;
      }
      bodyHtml += `</div>`;
    });

    // 필독 참고 사항 박스 (운영방침)
    let finalNotesHtml = '';
    if (data.finalNotes) {
      finalNotesHtml = `<div class="sg-pr-final-notes">`;
      data.finalNotes.forEach((note, i) => {
        finalNotesHtml += `<div class="sg-pr-final-note-row">
          <span class="sg-pr-final-num">${i+1}.</span>
          <p>${note}</p>
        </div>`;
      });
      finalNotesHtml += `</div>`;
    }

    // 서명란
    const parentName = (data.docType === 'terms') ? (form.parent || '') : '';
    const sigHtml = `
      <div class="sg-pr-sign-area">
        <div class="sg-pr-sign-text">${data.finalNote}</div>
        <div class="sg-pr-sign-date">${today}</div>
        ${data.docType === 'terms' ? `
        <div class="sg-pr-sign-row-name">
          <span class="sg-pr-signer-label">가입자(학부모성명)</span>
          <span class="sg-pr-signer-line">${parentName}</span>
        </div>` : ''}
        <div class="sg-pr-sign-row-sig">
          <span class="sg-pr-signer-label">서명</span>
          <span class="sg-pr-sign-img-wrap">
            <img src="${signatureImg}" class="sg-pr-sign-img" alt="서명">
          </span>
        </div>
      </div>`;

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>마이더스K — ${data.tabLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Noto Sans KR',sans-serif;background:#fff;color:#15151A;padding-top:52px}
@page{margin:14mm 16mm;size:A4}
:root{
  --dt-deep:#2A3340;--dt-acc:#455367;--dt-tint:#F2F4F8;
  --dt-line:rgba(69,83,103,.22);--dt-ink:#15151A;--dt-ink2:#43434A;--dt-ink3:#86868B;
  --dt-line-soft:rgba(21,21,26,.08);--dt-line-md:rgba(21,21,26,.14);
}

/* ── 툴바 ── */
.sg-pr-toolbar{position:fixed;top:0;left:0;right:0;height:52px;background:#2A3340;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 24px;z-index:999}
.sg-pr-tb-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 18px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
.sg-pr-tb-print{background:#fff;color:#2A3340}
@media print{.sg-pr-toolbar{display:none}body{padding-top:0}}

/* ── 페이지 래퍼 ── */
.sg-pr-page{max-width:680px;margin:0 auto;padding:0 0 32px}

/* ── 헤더 ── */
.sg-pr-header{background:#fff;padding:12px 28px;display:flex;align-items:center;gap:12px}
.sg-pr-header-left{flex:1}
.sg-pr-header-right{flex:1;display:flex;justify-content:flex-end;align-items:center}
.sg-pr-brand{font-size:9px;font-weight:700;letter-spacing:.22em;color:var(--dt-ink3)}
.sg-pr-doc-title{font-size:14px;font-weight:800;color:var(--dt-ink);margin-top:2px}
.sg-pr-badge{font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--dt-acc);border:1px solid var(--dt-line);border-radius:3px;padding:4px 10px}
.sg-pr-header-line{height:1px;background:var(--dt-line-md);margin:0 28px}

/* ── 배너 ── */
.sg-pr-banner{background:var(--dt-tint);border-bottom:1px solid var(--dt-line);padding:16px 28px;margin-bottom:4px}
.sg-pr-banner-label{font-size:8.5px;font-weight:700;letter-spacing:.24em;color:var(--dt-acc);margin-bottom:4px}
.sg-pr-banner-title{font-size:20px;font-weight:800;color:var(--dt-ink);letter-spacing:-.015em;white-space:pre-line}

/* ── 가입정보 카드 ── */
.sg-info-card{padding:0 28px 12px}
.sg-info-table{width:100%;border-collapse:collapse;border:1.5px solid var(--dt-deep);font-size:12.5px}
.sg-info-table th{background:var(--dt-deep);color:#fff;font-weight:700;padding:8px 12px;white-space:nowrap;font-size:12px}
.sg-info-table td{padding:8px 12px;border:1px solid var(--dt-line);color:var(--dt-ink)}
.sg-info-table tr:first-child td,.sg-info-table tr:first-child th{border-top:none}

/* ── 인트로 ── */
.sg-pr-intro{margin:12px 28px;padding:12px 16px;background:var(--dt-tint);border-left:3px solid var(--dt-deep);border-radius:0 6px 6px 0;font-size:12px;color:var(--dt-ink2);line-height:1.8}

/* ── 섹션 ── */
.sg-pr-section{padding:8px 28px 6px}
.sg-pr-subtitle{padding:10px 28px 2px;font-size:13px;font-weight:800;color:var(--dt-deep)}
.sg-pr-section-title{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:9px 14px;background:var(--dt-deep);border-radius:6px;font-size:12px;font-weight:700;color:#fff}

/* ── 테이블 ── */
.sg-table{width:100%;border-collapse:collapse;font-size:11.5px}
.sg-table th{background:var(--dt-acc);color:#fff;padding:7px 10px;text-align:left;font-weight:700;font-size:11px}
.sg-table td{padding:7px 10px;border:1px solid var(--dt-line);color:var(--dt-ink2);vertical-align:top;line-height:1.6}
.sg-group-row td{background:var(--dt-tint);font-weight:700;color:var(--dt-deep);font-size:11px;letter-spacing:.04em}

/* ── 리스트 ── */
.sg-pr-ol{list-style:none;padding:0}
.sg-pr-ol li{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--dt-line-soft);font-size:12px;color:var(--dt-ink2);line-height:1.7}
.sg-pr-li-num{width:18px;height:18px;background:var(--dt-deep);color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;margin-top:2px}

/* ── 위법 고지 ── */
.sg-pr-notice-item{display:flex;gap:10px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--dt-line-soft);font-size:12px;color:var(--dt-ink2)}
.sg-pr-notice-num{width:22px;height:22px;background:var(--dt-deep);color:#fff;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0}

/* ── 경고 ── */
.sg-pr-alert{background:#FBEAEF;border:1px solid rgba(139,28,58,.2);border-radius:6px;padding:10px 14px;font-size:12px;color:#8b1c3a;font-weight:600;margin-bottom:4px}

/* ── 번호 항목 ── */
.sg-pr-num-row{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--dt-line-soft);font-size:12px;color:var(--dt-ink2);line-height:1.7}
.sg-pr-num-badge{width:20px;height:20px;background:var(--dt-acc);color:#fff;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;margin-top:3px}

/* ── 환불 ── */
.sg-pr-refund td:first-child{white-space:nowrap;font-weight:600;color:var(--dt-deep)}
.sg-pr-refund-note{font-size:11px;color:var(--dt-ink3);line-height:1.7;padding:8px 0;margin-top:4px}

/* ── 필독 참고 사항 ── */
.sg-pr-final-notes{margin:12px 28px;padding:14px 16px;background:#F0F4FC;border:1.5px solid rgba(42,51,64,.18);border-radius:8px}
.sg-pr-final-note-row{display:flex;gap:10px;font-size:12px;color:var(--dt-ink2);line-height:1.75;margin-bottom:8px}
.sg-pr-final-note-row:last-child{margin-bottom:0}
.sg-pr-final-num{font-weight:800;color:var(--dt-deep);flex-shrink:0;width:16px}

/* ── 서명란 ── */
.sg-pr-sign-area{margin:16px 28px 0;padding:16px 20px;border:1.5px solid var(--dt-deep);border-radius:8px;background:#fff}
.sg-pr-sign-text{font-size:12px;color:var(--dt-ink2);line-height:1.7;margin-bottom:12px;text-align:center}
.sg-pr-sign-date{font-size:13px;font-weight:700;color:var(--dt-ink);text-align:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--dt-line-md)}
.sg-pr-sign-row-name{display:flex;align-items:center;gap:12px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--dt-line-md)}
.sg-pr-sign-row-sig{display:flex;align-items:center;gap:12px}
.sg-pr-signer-label{font-size:12px;font-weight:700;color:var(--dt-deep);white-space:nowrap;min-width:120px}
.sg-pr-signer-line{flex:1;border-bottom:1px solid var(--dt-ink);min-height:28px;font-size:13px;font-weight:600;color:var(--dt-ink);display:flex;align-items:flex-end;padding-bottom:2px}
.sg-pr-sign-img-wrap{flex:1;height:52px;border-bottom:1px solid var(--dt-ink);display:flex;align-items:center;justify-content:center}
.sg-pr-sign-img{max-width:100%;max-height:48px;object-fit:contain}

/* ── 푸터 ── */
.sg-pr-footer{border-top:1px solid var(--dt-line-md);padding:12px 28px;display:flex;justify-content:space-between;align-items:center;margin-top:20px}
.sg-pr-footer-brand{font-size:11.5px;font-weight:700;color:var(--dt-ink)}
.sg-pr-footer-contact{font-size:9.5px;color:var(--dt-ink3);margin-top:2px}
.sg-pr-footer-badge{padding:5px 11px;border:1px solid var(--dt-line);border-radius:4px;font-size:9px;color:var(--dt-acc);text-align:center;line-height:1.75;font-weight:700;letter-spacing:.04em}
</style>
</head>
<body>
<div class="sg-pr-toolbar">
  <button class="sg-pr-tb-btn sg-pr-tb-print" onclick="window.print()">🖨 인쇄 / PDF 저장</button>
</div>
<div class="sg-pr-page">
  <div class="sg-pr-header">
    <div class="sg-pr-header-left">
      <div class="sg-pr-brand">MIDAS-K EDUCATION CONSULTING</div>
      <div class="sg-pr-doc-title">${data.tabLabel}</div>
    </div>
    <div class="sg-pr-header-right">
      <span class="sg-pr-badge">티처스 컨설턴트</span>
    </div>
  </div>
  <div class="sg-pr-header-line"></div>
  <div class="sg-pr-banner">
    <div class="sg-pr-banner-label">MIDAS-K EDUCATION CONSULTING · 대구광역시 교육청 정식인가 제5513호</div>
    <div class="sg-pr-banner-title">${data.title}</div>
  </div>
  ${infoTableHtml}
  ${bodyHtml}
  ${finalNotesHtml}
  ${sigHtml}
  <div class="sg-pr-footer">
    <div>
      <div class="sg-pr-footer-brand">티처스 컨설턴트의 학생부 관리 컨설팅</div>
      <div class="sg-pr-footer-contact">☎ 053-782-0331 · 월~토 AM 10:00 – PM 18:30</div>
    </div>
    <div class="sg-pr-footer-badge">대구광역시 교육청<br>정식인가 제5513호</div>
  </div>
</div>
</body>
</html>`;
  }


  /* ============================================================
   * 19. 아이패드 전용 서명 페이지 진입 확인
   *     URL에 ?sign_session=xxx&doc=xxx 파라미터가 있으면 서명 전용 모드
   * ============================================================ */
  function checkTabletMode() {
    const params = new URLSearchParams(window.location.search);
    const sessId = params.get('sign_session');
    const docType = params.get('doc');
    if (!sessId) return false;

    _currentTab = docType || 'terms';
    _renderTabletUI();
    return true;
  }

  function _renderTabletUI() {
    // sign.html 전체를 서명 전용 UI로 교체
    document.body.innerHTML = `
      <div class="sg-tablet-wrap">
        <div class="sg-tablet-header">
          <div class="sg-tablet-brand">마이더스K교육컨설팅</div>
          <div class="sg-tablet-title">${TERMS_DATA[_currentTab]?.tabLabel || '서명'}</div>
        </div>
        <div class="sg-tablet-guide">아래 서명란에 손가락으로 서명해 주세요</div>
        <div class="sg-tablet-canvas-area" id="sg-canvas-area">
          <div class="sg-canvas-placeholder" id="sg-canvas-placeholder">
            <span>✍ 여기에 서명하세요</span>
          </div>
          <canvas id="sg-canvas" width="1400" height="560"></canvas>
        </div>
        <div class="sg-tablet-btns">
          <button class="sg-tablet-btn sg-tablet-btn-clear" onclick="Sign._clearCanvas()">지우기</button>
          <button class="sg-tablet-btn sg-tablet-btn-submit" onclick="Sign._submitFromTablet()">서명 완료</button>
        </div>
        <div class="sg-tablet-confirm" id="sg-tablet-confirm">
          <div class="sg-confirm-icon">✓</div>
          <div class="sg-confirm-text">서명이 전송되었습니다</div>
        </div>
      </div>`;

    // 태블릿 전용 스타일 주입
    const style = document.createElement('style');
    style.textContent = `
      body{margin:0;font-family:'Noto Sans KR',sans-serif;background:#F2F4F8;display:flex;align-items:center;justify-content:center;min-height:100vh}
      .sg-tablet-wrap{width:100%;max-width:760px;padding:32px 24px}
      .sg-tablet-header{text-align:center;margin-bottom:20px}
      .sg-tablet-brand{font-size:11px;font-weight:700;letter-spacing:.22em;color:#86868B;margin-bottom:6px}
      .sg-tablet-title{font-size:26px;font-weight:800;color:#2A3340}
      .sg-tablet-guide{text-align:center;font-size:14px;color:#43434A;margin-bottom:20px}
      .sg-tablet-canvas-area{position:relative;background:#fff;border:2px solid #2A3340;border-radius:12px;overflow:hidden;margin-bottom:20px}
      .sg-canvas-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:18px;pointer-events:none;z-index:1}
      #sg-canvas{display:block;width:100%;touch-action:none}
      .sg-tablet-btns{display:flex;gap:12px}
      .sg-tablet-btn{flex:1;padding:16px;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit}
      .sg-tablet-btn-clear{background:#F2F4F8;color:#2A3340;border:1.5px solid #ccc}
      .sg-tablet-btn-submit{background:#2A3340;color:#fff}
      .sg-tablet-confirm{display:none;text-align:center;margin-top:24px;padding:20px;background:#edf7f1;border-radius:10px}
      .sg-tablet-confirm.visible{display:block}
      .sg-confirm-icon{font-size:40px;color:#1a6e3c;margin-bottom:8px}
      .sg-confirm-text{font-size:16px;font-weight:700;color:#1a6e3c}
    `;
    document.head.appendChild(style);

    _initCanvas();
  }


  /* ============================================================
   * 17-A. URL 파라미터 자동채움
   *       index.html 서명 버튼이 Calc 값을 URL로 전달
   * ============================================================ */
  function _applyUrlParams() {
    const p = new URLSearchParams(window.location.search);
    if (!p.has('name') && !p.has('grade') && !p.has('grand')) return;

    // 학생 정보
    const name   = p.get('name')   || '';
    const school = p.get('school') || '';
    const goal   = p.get('goal')   || '';
    const grade  = p.get('grade')  || '';

    // 금액
    const roadmap  = Number(p.get('roadmap')  || 0);
    const strategy = Number(p.get('strategy') || 0);
    const grand    = Number(p.get('grand')    || 0);

    // DC 내역
    const dcRoadmap   = p.get('dcRoadmap')   || '';
    const dcSelect    = p.get('dcSelect')    || '';
    const dcSemester  = p.get('dcSemester')  || '';

    // 금액 포맷 헬퍼
    const fmtMan = (n) => {
      if (!n) return '';
      const man = Math.round(n / 10000);
      return man.toLocaleString('ko-KR') + '만원';
    };

    // 가입금액 문자열 조합
    const parts = [];
    if (roadmap)  parts.push('로드맵 ' + fmtMan(roadmap));
    if (strategy) parts.push('대입전략 ' + fmtMan(strategy));
    const amountStr = grand
      ? fmtMan(grand) + (parts.length ? ' (' + parts.join(' / ') + ')' : '')
      : '';

    // 특약 DC 내역 조합
    const dcParts = [];
    if (dcRoadmap)  dcParts.push(dcRoadmap);
    if (dcSelect)   dcParts.push(dcSelect);
    if (dcSemester) dcParts.push(dcSemester);
    const specialStr = dcParts.join(' / ');

    // 학교/학년/진로목표 합성 (학년은 '고2' 형태 그대로)
    const gradeLabel = grade ? '고' + grade : '';
    const schoolStr = [school, gradeLabel, goal].filter(Boolean).join(' / ');

    // 폼 채움 — 렌더 후 DOM에 값 삽입
    setTimeout(() => {
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.value = val;
      };
      setVal('f-name',    name);
      setVal('f-school',  schoolStr);
      setVal('f-amount',  amountStr);
      setVal('f-special', specialStr);

      // 학년 드롭다운 선택 (보드에서 숫자 '2'로 오므로 '고2' 매칭)
      const gradeEl = document.getElementById('f-grade');
      if (gradeEl && grade) {
        const gradeVal = grade.startsWith('고') ? grade : '고' + grade;
        const opt = gradeEl.querySelector(`option[value="${gradeVal}"]`);
        if (opt) {
          opt.selected = true;
          // 드롭다운 값 세팅 후 즉시 테이블 갱신
          _onGradeChange();
        }
      }
    }, 50);

    // selectedPages 파라미터 파싱 → 모듈 변수에 저장
    const spRaw = p.get('selectedPages') || '';
    _selectedPages  = spRaw ? spRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    // 2학기 DC 활성 여부 — dcSemester 값이 있으면 활성
    _isSemesterDc   = !!p.get('dcSemester');
  }


  /* ============================================================
   * 17-B. 컨설팅 항목표 동적 생성
   *        gradeNum: 1|2|3|0(미선택)
   *        config prices 기반 — 학년별 금액 분기
   *        대입전략: 고3만 표시, 선택항목 녹색/나머지 회색
   * ============================================================ */
  function _buildConsultingTable(gradeNum, selectedPages, isSemesterDc) {
    // selectedPages 미전달 시 빈 배열 (전체 미선택으로 간주하지 않고, undefined이면 선택 필터 적용 안 함)
    const hasSelection = Array.isArray(selectedPages) && selectedPages.length > 0;
    const fmtAmt = (n) => Number(n).toLocaleString('ko-KR');

    // ── 로드맵 pages 정의 (순서 고정)
    const roadmapPages = [
      { id: 'rm-a', label: 'A. 세특 관리',
        programs: [
          { title: '1. 세특 강화 솔루션',
            desc: '❶ 각종 활동 결과물을 학교 제출용 자기평가서 혹은 세특으로 기재 요약<br>❷ 단순 요약이 아닌 비인지적 역량, 교과회귀, 고찰점 강화하여 재구성<br>국/수/영/사/과 교과, 자율/동아리/진로/행특 / BEST 실적 영역별 최대 2~3건',
            freq: '연관리' },
          { title: '2. 심화 확장 스토리 구축',
            desc: '❶ N차 심화 탐구 연결 (기재관리 시 선별)<br>❷ 이전 활동을 심화 확장하는 수행 및 창체 활동 주제 + 보고서 설계도 제공<br>❸ 학생부 분석 및 심화 확장 주제 추천',
            freq: '상시제공 (학생부 분석 연1회)' },
        ],
      },
      { id: 'rm-b', label: 'B. 수행 관리',
        programs: [
          { title: '1. 수행 조건 분석',
            desc: '❶ 수행 과제의 조건, 제출 형식, 활용 자료를 먼저 파악<br>❷ 학생이 놓치기 쉬운 핵심 기준 정리<br>❸ 수행 조건에 따라 A / B / A+B 혼합형 제공<br>국/수/영/사/과 교과, 기타 진로 연관 교과 / 영역별 최대 2건',
            freq: '연관리' },
          { title: '2. [옵션 A] 방향성 코칭',
            desc: '❶ 탐구 주제 선정, 자료 활용 방향, 보고서 전개 방식 등 학생 맞춤 수행 방향 제시',
            freq: '-' },
          { title: '3. [옵션 B] 보고서 설계도 / 초안 제시',
            desc: '❶ 탐구 주제, 보고서 흐름, 실제 작성 가능 초안 틀 제공',
            freq: '-' },
        ],
      },
      { id: 'rm-c', label: 'C. 주제 추천',
        programs: [
          { title: '세특구원자 플랫폼 활용',
            desc: '24시간 키워드 검색, 탐구 주제 직접 선정<br>로드맵 컨설팅 회원 구독 할인 적용 (6개월 40% / 연 50%)',
            freq: '상시제공' },
        ],
      },
      // D. 대면관리 — 모든 학년 공통 (필수)
      { id: 'rm-d', label: 'D. 대면관리 (필수)',
        programs: [
          { title: '1. RPM 컨설팅 (Roadmap·Planning·Mentoring)',
            desc: '❶ 교과 & 창체 세특 코칭 + 활동 방향 설계<br>❷ 동아리·진로 등 창체 주제 선정이 막힐 경우 구체적 실행 방안 제시',
            freq: '연 관리' },
          { title: '2. 성적 누적 분석',
            desc: '❶ 내신/모의성적 누적 및 전형별 가중치 관리<br>❷ 부족 과목 학습 운영 전략<br>❸ 목표 대학 포트폴리오 누적 관리',
            freq: '상시제공' },
          { title: '3. 맞춤 상담',
            desc: '❶ 학생 맞춤 진로·진학 컨설팅<br>❷ 학부모 질의응답 — 1:1 대면 시 상시 제공',
            freq: '기본포함' },
        ],
      },
      // E. 기본관리 — 모든 학년 공통 (필수)
      { id: 'rm-e', label: 'E. 기본관리 (필수)',
        programs: [
          { title: '1. 학종특강',
            desc: '❶ 서류 평가 메커니즘 교육<br>❷ 세특 디자인 수업 / 심화 탐구 빌드업 전략<br>❸ 컨설팅 활용법',
            freq: '상시제공 (오프라인/온라인/자료대체 가능)' },
          { title: '2. 행정관리',
            desc: '❶ 상담 스케줄 관리<br>❷ 컨설팅 밴드 운영 관리 (학종 대비 전략 코칭 및 교육 — 온라인)<br>❸ 성적 입력 및 기재 베이스 관리',
            freq: '상시제공' },
        ],
      },
    ];

    // ── 대입전략 pages (고3만 표시)
    const strategyPages = [
      { id: 'sc-suisi',     label: '수시 원서전략 컨설팅', freq: '1회', grade: 3 },
      { id: 'sc-jeongsi',   label: '정시 원서전략 컨설팅 (가채점 포함)', freq: '1회', grade: 3 },
      { id: 'sc-interview', label: '면접 컨설팅 — 일반학과', freq: '1회', grade: 3 },
      { id: 'sc-interview', label: '면접 컨설팅 — 의치한약수·SKY', freq: '1회', grade: 3, subIdx: 1 },
    ];

    // URL 파라미터에서 선택된 대입전략 금액 파악 (녹색 강조용)
    const urlParams   = new URLSearchParams(window.location.search);
    const strategyAmt = Number(urlParams.get('strategy') || 0);

    // ── 금액 포맷 헬퍼
    const getAmt = (pageId, gradeNum) => {
      const prices = _getPrices(pageId);
      if (!prices) return '-';

      if (gradeNum === 0) {
        // 학년 미선택 — 전체 나열 (학년 라벨 포함)
        return prices.map(p => {
          const gLabel = p.grade ? `고${p.grade} ` : '';
          return `${gLabel}${fmtAmt(p.amt)}`;
        }).join('<br>');
      }

      // 해당 학년 필터 — grade 없는 항목(학년 무관)도 포함
      const matched = prices.filter(p => {
        if (!p.grade) return true;
        const grades = String(p.grade).split(',').map(g => Number(g.trim()));
        return grades.includes(gradeNum);
      });
      if (!matched.length) return '-';

      // note 없는 대표 항목 우선 — note 있는 항목(학기별 단독)은 비고 표시
      const main = matched.filter(p => !p.note);
      const sub  = matched.filter(p =>  p.note);

      const mainStr = main.length
        ? main.map(p => fmtAmt(p.amt)).join('<br>')
        : matched.map(p => fmtAmt(p.amt)).join('<br>');

      const subStr = (sub.length && isSemesterDc)
        ? sub.map(p => `<span style="font-size:10px;color:#86868B;">고${gradeNum} ${p.note}: ${fmtAmt(p.amt)}</span>`).join('<br>')
        : '';

      return (isSemesterDc && subStr) ? subStr : mainStr;
    };

    // ── rm-c 특수 처리 (학년 무관 고정 금액)
    const getRmcAmt = () => {
      const prices = _getPrices('rm-c');
      if (!prices || !prices.length) return '세특구원자 플랫폼 결제 방식';
      return prices.map(p => `${p.label} ${fmtAmt(p.amt)}`).join('<br>');
    };

    // ── 테이블 생성
    let rows = '';

    // 학년관리 로드맵
    rows += `<tr class="sg-group-row"><td colspan="4">학년관리 로드맵</td></tr>`;

    roadmapPages.forEach(page => {
      const progCount = page.programs.length;
      const isSelected = !hasSelection || selectedPages.includes(page.id);
      const rowStyle   = isSelected ? '' : 'color:#aaa;';
      const amtContent = isSelected
        ? (page.id === 'rm-c' ? getRmcAmt() : getAmt(page.id, gradeNum))
        : '<span style="color:#bbb;font-style:italic;">-미선택-</span>';

      page.programs.forEach((prog, pi) => {
        const amtCell = pi === 0
          ? `<td rowspan="${progCount}">${amtContent}</td>`
          : '';
        const labelCell = pi === 0
          ? `<td rowspan="${progCount}"><strong>${page.label}</strong></td>`
          : '';
        rows += `<tr style="${rowStyle}">
          ${labelCell}
          <td><strong>${prog.title}</strong><br>${prog.desc}</td>
          <td>${prog.freq}</td>
          ${amtCell}
        </tr>`;
      });
    });

    // 대입전략 — 고3만 표시
    rows += `<tr class="sg-group-row"><td colspan="4">대입전략 컨설팅 (고3)</td></tr>`;
    strategyPages.forEach(sp => {
      const prices  = _getPrices(sp.id);
      let amt = '-';
      if (prices) {
        const idx  = sp.subIdx || 0;
        const g3   = prices.filter(p => p.grade === 3 || String(p.grade) === '3');
        if (g3[idx]) amt = fmtAmt(g3[idx].amt);
      }
      // 선택된 항목 강조: strategy 금액이 0보다 크면 선택됨 표시
      // 세부 항목 매칭은 금액 기준
      const isSelected = strategyAmt > 0 && amt !== '-' &&
        String(strategyAmt).includes(amt.replace(/,/g, ''));
      const rowStyle = isSelected
        ? 'background:#edf7f1;color:#1a6e3c;font-weight:700;'
        : 'color:#aaa;';
      rows += `<tr style="${rowStyle}">
        <td colspan="2">${sp.label}</td>
        <td>${sp.freq}</td>
        <td>${amt}</td>
      </tr>`;
    });

    return `<table class="sg-table">
  <thead>
    <tr><th>구분</th><th>프로그램 구성</th><th>제공횟수</th><th>금액</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
  }


  /* ============================================================
   * 17-C. 학년 드롭다운 변경 시 처리 (기존 함수 교체)
   *        컨설팅 항목표 학년별 갱신
   * ============================================================ */
  function _onGradeChange() {
    const gradeEl = document.getElementById('f-grade');
    const gradeNum = gradeEl ? (parseInt(gradeEl.value.replace(/[^0-9]/g, '')) || 0) : 0;
    // 컨설팅 항목표 실시간 갱신
    const tableEl = document.getElementById('sg-consulting-table');
    if (tableEl) {
      tableEl.innerHTML = _buildConsultingTable(gradeNum, _selectedPages, _isSemesterDc);
    }
  }


  /* ============================================================
   * 17-D. 가입 시작일 → 관리유예기간 자동계산
   *       유예기간 = 가입 시작연도 + 1년 2월 15일
   * ============================================================ */
  function _calcExpiry() {
    const startEl       = document.getElementById('f-start');
    const periodEl      = document.getElementById('f-period-display');
    const expiryEl      = document.getElementById('f-expiry');
    if (!startEl) return;
    const val = startEl.value;
    if (!val) {
      if (periodEl)  periodEl.value  = '';
      if (expiryEl)  expiryEl.value  = '';
      return;
    }
    const d         = new Date(val);
    const startYear = d.getFullYear();
    // 종료일: 시작연도 12월 31일
    const endStr    = `${startYear}.12.31`;
    // 유예기간: 시작연도 +1년 2월 15일
    const expiryStr = `${startYear + 1}.02.15`;

    if (periodEl) periodEl.value  = `${val.replace(/-/g,'.')} ~ ${endStr}`;
    if (expiryEl) expiryEl.value  = expiryStr;
  }


  /* ============================================================
   * Public API
   * ============================================================ */
  return {
    init,
    checkTabletMode,
    requestSignature,
    useLocalSignature,
    clearSignature,
    printDocument,
    // 태블릿 내부 호출용
    _clearCanvas:       clearSignature,
    _submitFromTablet:  submitSignatureFromTablet,
    // HTML 이벤트 핸들러
    _calcExpiry,
    _onGradeChange,
  };

})();
