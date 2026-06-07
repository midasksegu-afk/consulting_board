/**
 * sign2.js — 마이더스K 개별 컨설팅 가입약관 서명 시스템
 *
 * 완전 독립 모듈 — sign.js와 별도 파일
 * Supabase: signatures 테이블 (session_id, image_data, doc_type, created_at)
 *
 * 구조:
 *   탭1 — 기재관리(개별)     (서명자: 가입자/학부모)
 *   탭2 — 수행관리(개별)     (서명자: 가입자/학부모)
 *   탭3 — 교과+정시관리(개별) (서명자: 가입자/학부모)
 *
 * sign.html 탭바의 A존 탭(가입약관/운영방침) 클릭 시 sign.html로 복귀
 */

const Sign2 = (() => {

  /* ============================================================
   * 1. Supabase 설정 (sign.js와 동일)
   * ============================================================ */
  const SUPABASE_URL = 'https://rigdvsxjqzaojwhvucpr.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_FcoQJ-2-LU5ctB-JVzFfEQ_4DvLWt9n';
  const SIG_TABLE    = 'signatures';
  const CONFIG_TABLE = 'app_config';

  function _headers(extra = {}) {
    return {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...extra,
    };
  }


  /* ============================================================
   * 2. 세션 ID
   * ============================================================ */
  const _sessionId = 'mk_active_session';

  // Supabase에서 로드된 pages 데이터
  let _remotePages = null;


  /* ============================================================
   * 2-A. Supabase app_config 로드
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
      console.warn('[Sign2] config 로드 실패 — 기본값 사용:', e);
    }
  }

  // pageId로 prices 반환 — remote 우선, localStorage, MK_CONFIG 순 fallback
  function _getPrices(pageId) {
    if (_remotePages && _remotePages[pageId] && _remotePages[pageId].prices) {
      return _remotePages[pageId].prices;
    }
    try {
      const cached = JSON.parse(localStorage.getItem('mk_config') || '{}');
      if (cached.pages?.[pageId]?.prices) return cached.pages[pageId].prices;
    } catch (e) { /* 무시 */ }
    try {
      const base = window.MK_CONFIG?.resolve?.();
      if (base?.pages?.[pageId]?.prices) return base.pages[pageId].prices;
    } catch (e) { /* 무시 */ }
    return null;
  }

  // sbLabel로 pageId 찾기 — 동적 추가 프로그램(pg-xxxx) 대응
  function _findPageIdByLabel(label) {
    const pages = _remotePages || {};
    const found = Object.entries(pages).find(([, p]) => p.sbLabel === label);
    if (found) return found[0];
    // localStorage fallback
    try {
      const cached = JSON.parse(localStorage.getItem('mk_config') || '{}');
      const entry = Object.entries(cached.pages || {}).find(([, p]) => p.sbLabel === label);
      if (entry) return entry[0];
    } catch (e) { /* 무시 */ }
    return null;
  }

  // 교과+정시 pageId 캐시
  let _gyogwaPageId = null;

  function _getGyogwaPrices() {
    if (!_gyogwaPageId) {
      _gyogwaPageId = _findPageIdByLabel('교과정시 관리')
        || _findPageIdByLabel('교과+정시 관리')
        || _findPageIdByLabel('교과 정시 관리')
        || _findPageIdByLabel('교과정시관리');
    }
    if (_gyogwaPageId) return _getPrices(_gyogwaPageId);
    return null;
  }


  /* ============================================================
   * 3. 약관 데이터
   * ============================================================ */
  const TERMS_DATA = {

    /* ── 기재관리(개별) ── */
    jaeji: {
      docType:     'jaeji',
      tabLabel:    '기재관리(개별)',
      title:       '학생부 기재 관리 컨설팅\n(온라인 관리)\n회원가입 신청서 및 가입약관',
      signerLabel: '가입자',
      pricePageId: 'ind-a',
      sections: [
        {
          title: '1. 컨설팅 세부 내용',
          type:  'numbered',
          items: [
            '본 프로그램은 학생이 직접 작성한 탐구 수행 보고서를 바탕으로 학교 제출용 자기평가서 및 세특 정리를 지원합니다. \'학생 셀프 세특\'의 첨삭 시, 원본 내용의 학문적 오류, 사실관계 오류, 부정확한 해석에 대해서는 책임을 부담하지 않습니다. 또한 제출 내용이 학교생활기록부 기재 기준에 부합하지 않거나 부적절하다고 판단되는 경우, 첨삭 지원이 제한될 수 있습니다.',
            '항목별 최대 2~3건, 제공 범위는 주요교과(국수영사과)와 창체(자율,동아리,진로)와 행특에 한함.',
            '학기 관리는 1학기 기재 마감일 8월31일, 학년 관리는 다음 년도 1월 31일 이후 관리 종료 함.',
          ],
        },
        {
          title: '2. 가입 유의사항',
          type:  'numbered',
          items: [
            '기재 관리 컨설팅 프로그램은 별도 내방 없는 온라인 관리 컨설팅입니다. 또한 가입 시기 상관없이 학년 및 학기 단위 관리이며, 결제와 동시에 효력이 발생합니다. (단. 반드시 지정된 밴드 게시글로 업로드된 자료만 지원합니다, 즉 카톡, 전화, 메일, 문자, 밴드 채팅 등 요청 건 지원 불가)',
            '계약시점부터 개인정보 수집 및 이용에 동의가 된 것으로 판단하며, 제3자에게 정보 제공하지 않습니다. 동의 철회시 또는 고교 졸업시점까지 보유 및 이용하며, 합격대학 통계를 위한 정보 활용 동의도 포함됩니다. 단, 고3의 경우 합격 대학 및 학과 정보 활용 동의도 포함됩니다. (수집범위 : 학교생활기록부, 성적표, 연락처 및 기타 신상정보)',
            '관리 종료 이후 컨설팅 제공실적(추천 주제, 기재 정리 파일, 활동 포트폴리오 등 학생부 관리 제반 정보)은 마이더스K교육컨설팅의 자산으로 귀속 처리됩니다.',
            '관리 세부 규정에 어긋나는 요청으로 업무의 지장을 지속적으로 초래하는 회원에 한해 마이더스K교육컨설팅은 관리중지(갱신포기) 및 가입해지를 요구할 수 있습니다. 해당 시점으로부터 약관에 의거 환불금을 정산합니다.',
          ],
        },
        {
          title: '3. 가입해지 시 환불규정',
          type:  'numbered',
          items: [
            '영업 기밀 누출에 관한 보호 차원에서 1개 이상 기재 요약 및 기재 제출 지원 진행 후 해당 학기의 컨설팅 금액은 환불 불가합니다. 단, 1년 가입 시 학기가 시작하기 전의 경우에는 해당 학기의 컨설팅 금액이 환불 가능합니다. (자퇴, 유학, 건강 문제와 같이 불가피한 상황이라고 판단 될 경우 기재 건당 10만원 차감 후 환불)',
            '기재 요약 및 기재 제출 지원을 받지 않은 경우에도 가입기간 경과 이후에는 환불이나 다른 컨설팅으로 변경 불가합니다.',
            '환급금은 가입 해지 의사를 명확히 표시한 해지확정일자를 기준으로 정산됩니다.',
          ],
        },
        {
          title: '4. 학교생활기록부 관련 교육부 시행령에 포함된 \'위법\'행위 규정 사항 고지',
          type:  'sub-title-intro',
          intro: '마이더스K교육컨설팅은 대구광역시 교육청 컨설팅부문 정식인가(제5513호) 학원으로 교육부 \'학교생활기록부 기재 관련 시행령 및 방침\'을 준수하고 이를 고지합니다.',
          items: [
            { num: '1', title: '셀프 학생부', desc: '학생으로부터 기재할 내용을 제출받아 그대로 기재하는 행위' },
            { num: '2', title: '교사에게 사교육기관 컨설팅 제공', desc: '부당한 기재 및 수정을 요구하는 행위' },
            { num: '3', title: '허위 사실 기재', desc: '\'학생 성적관련 비위\'로 간주되어 징계 양정 기준이 적용되며 징계 감경에서도 제외' },
          ],
        },
        {
          title: '5. 컨설팅 운영 방식 및 세부 관리 규정',
          type:  'numbered',
          items: [
            '학생이 실제로 수행한 기록물에 대해서만 세특 기재를 진행합니다. 증빙 기록물이 없거나 단순 신문 스크랩, 책자 사진만 제출한 경우에는 컨설팅이 제한될 수 있습니다.',
            '수학 교과의 공식 나열 및 문제풀이, 과학 교과의 실험, 영어 교과의 원문 등 학생의 탐구 의도를 파악하기 어려운 기록물은 \'해석지\' 또는 \'한글본\'을 반드시 첨부해야 합니다. 해당 자료가 누락되어 발생하는 해석 오류에 대해서는 책임지지 않습니다.',
            '보고서 작성 대행, 중간 첨삭 등 학생의 주도성 또는 수행평가의 공정성을 저해할 수 있는 부분은 일체 제공하지 않습니다. 또한 원활한 컨설팅 운영과 안정성을 위해, 당일 접수 및 당일 제출을 요구하는 건에 대한 지원은 원칙적으로 제공하지 않습니다.',
            '세특 또는 자기평가서 제공 이후의 수정 요청은 컨설턴트가 중요한 수정 사항이나 누락 사항이 있다고 판단한 경우, 또는 학생이 구체적인 수정 요청 사항을 직접 전달한 경우에 한해 가능합니다. 다만 수정 요청 내용이 학생부종합전형의 서류 평가 방향이나 기재 적합성에 부합하지 않는다고 컨설턴트가 판단하는 경우, 해당 수정은 제한될 수 있습니다.',
            '온라인으로 업로드하는 수행평가 및 탐구 관련 자료에는 \'과목명_활동명\' 또는 \'탐구 주제\'와 더불어 \'제출기한\'을 명시해야 합니다. 학생은 활동이 발생한 즉시 지정된 컨설팅 밴드를 통해 관련 자료를 업로드해야 하며, 자료 요청 공지에도 불구하고 자료가 제출되지 않거나 필수 정보가 누락되어 발생하는 문제에 대해서는 책임지지 않습니다.',
            '평일 17시 이후 접수된 요청 건은 다음 업무일 처리를 원칙으로 하며, 토요일 16시 이후 접수된 요청 건은 다음 첫 업무일 처리를 원칙으로 합니다. 정기 휴무일인 일요일 및 공휴일에는 요청 건에 대한 지원이 원칙적으로 제공되지 않습니다. 긴급한 수행평가 주제나 보고서 작성이 필요한 경우에는 24시간 이용 가능한 세특구원자(보고서 설계도 플랫폼)을 활용해 주시기 바랍니다.',
            '모든 활동 보고서가 최종 세특 정리본으로 제공되는 것은 아닙니다. 세특 경쟁력과 기재 적합성을 기준으로 우선순위가 높은 2~3개의 우수 활동을 선별하여 최종 세특 정리본으로 제공합니다.',
          ],
        },
      ],
      finalNote: '위 사항에 대해 숙지하였으며 개인정보수집 및 이용에 동의합니다.',
    },

    /* ── 수행관리(개별) ── */
    suhaeng: {
      docType:     'suhaeng',
      tabLabel:    '수행관리(개별)',
      title:       '학생부 수행 관리 컨설팅\n(온라인 관리)\n회원가입 신청서 및 가입약관',
      signerLabel: '가입자',
      pricePageId: 'ind-b',
      sections: [
        {
          title: '1. 컨설팅 세부 내용',
          type:  'numbered',
          items: [
            '1) 수행 조건, 제출 형식, 활용 자료 등을 검토한 후 옵션 A 또는 옵션 B의 형태로 컨설팅을 제공합니다. 단, 수행 상황에 따라 옵션 A와 옵션 B를 혼합한 방식으로 제공될 수 있습니다. 2) 수행평가가 주로 이루어지는 주요 교과 국어, 수학, 영어, 사회, 과학의 세부능력 및 특기사항 영역에 대해 학기별 최대 2건까지 지원합니다. 단, 진로와의 연관성이 인정되는 기타 교과목의 경우에도 학기별 최대 2건까지 지원될 수 있습니다. 3) 보고서 완성본 작성 또는 제출용 문안에 대한 중간 첨삭은 원칙적으로 제공하지 않습니다.',
            '옵션 A(방향성 코칭)는 학생이 수행평가를 준비하는 과정에서 탐구 주제 선정, 자료 활용, 보고서 전개 방식 등 기본 방향을 설정할 수 있도록 보고서 틀과 관련 코멘트를 제공하는 방식입니다. 옵션 B(세특구원자 활용)는 탐구 주제, 논문 및 도서 등 검증된 자료, 과정, 결과 및 고찰 패키지로 구성된 마이더스K 탐구주제 플랫폼 \'세특구원자\'의 보고서 설계도와 관련 코멘트를 제공하는 방식입니다. 참고) 단. \'옵션B\'의 세특구원자 보고서 설계도는 별도 과금 됩니다. (건당 5,500~7,500원) ❈ 수행 관리 회원은 요청 시 마이더스K교육컨설팅의 공식 탐구 주제 플랫폼인 \'세특구원자\'의 기간 구독 6개월, 1년 또는 월 구독 할인(40~50%)혜택을 제공받을 수 있습니다.',
            '학기 관리는 1학기 기재 마감일 8월31일, 학년 관리는 가입년도 12월 31일 이후 관리 종료 함.',
          ],
        },
        {
          title: '2. 가입 유의사항',
          type:  'numbered',
          items: [
            '수행 관리 컨설팅 프로그램은 별도 내방 없는 온라인 관리 컨설팅입니다. 또한 가입 시기 상관없이 학년 및 학기 단위 관리이며, 결제와 동시에 효력이 발생합니다. (단. 반드시 지정된 밴드 게시글로 업로드된 자료만 지원합니다, 즉 카톡, 전화, 메일, 문자, 밴드 채팅 등 요청 건 지원 불가)',
            '계약시점부터 개인정보 수집 및 이용에 동의가 된 것으로 판단하며, 제3자에게 정보 제공하지 않습니다. 동의 철회시 또는 고교 졸업시점까지 보유 및 이용하며, 합격대학 통계를 위한 정보 활용 동의도 포함됩니다. 단, 고3의 경우 합격 대학 및 학과 정보 활용 동의도 포함됩니다. (수집범위 : 학교생활기록부, 성적표, 연락처 및 기타 신상정보)',
            '관리 종료 이후 컨설팅 제공실적(추천 주제, 기재 정리 파일, 활동 포트폴리오 등 학생부 관리 제반 정보)은 마이더스K교육컨설팅의 자산으로 귀속 처리됩니다.',
            '관리 세부 규정에 어긋나는 요청으로 업무의 지장을 지속적으로 초래하는 회원에 한해 마이더스K교육컨설팅은 관리중지(갱신포기) 및 가입해지를 요구할 수 있습니다. 해당 시점으로부터 약관에 의거 환불금을 정산합니다.',
          ],
        },
        {
          title: '3. 가입해지 시 환불규정',
          type:  'numbered',
          items: [
            '영업 기밀 누출에 관한 보호 차원에서 1개 이상 수행 관리 지원 후 해당 학기의 컨설팅 금액은 환불 불가합니다. 단, 1년 가입 시 학기가 시작하기 전의 경우에는 해당 학기의 컨설팅 금액이 환불 가능합니다. (자퇴, 유학, 건강 문제와 같이 불가피한 상황이라고 판단 될 경우 기재 건당 10만원 차감 후 환불)',
            '수행 관리 컨설팅을 받지 않은 경우에도 가입기간 경과 이후에는 환불이나 다른 컨설팅으로 변경 불가합니다.',
            '환급금은 가입 해지 의사를 명확히 표시한 해지확정일자를 기준으로 정산됩니다.',
          ],
        },
        {
          title: '4. 학교생활기록부 관련 교육부 시행령에 포함된 \'위법\'행위 규정 사항 고지',
          type:  'sub-title-intro',
          intro: '마이더스K교육컨설팅은 대구광역시 교육청 컨설팅부문 정식인가(제5513호) 학원으로 교육부 \'학교생활기록부 기재 관련 시행령 및 방침\'을 준수하고 이를 고지합니다.',
          items: [
            { num: '1', title: '셀프 학생부', desc: '학생으로부터 기재할 내용을 제출받아 그대로 기재하는 행위' },
            { num: '2', title: '교사에게 사교육기관 컨설팅 제공', desc: '부당한 기재 및 수정을 요구하는 행위' },
            { num: '3', title: '허위 사실 기재', desc: '\'학생 성적관련 비위\'로 간주되어 징계 양정 기준이 적용되며 징계 감경에서도 제외' },
          ],
        },
        {
          title: '5. 컨설팅 운영 방식 및 세부 관리 규정',
          type:  'numbered',
          items: [
            '본 컨설팅은 학교 수행 탐구 활동 전반에 대한 결과를 보장하거나 무한한 책임을 부담하는 서비스가 아니며, 학생의 탐구 방향 설정과 학습 성장을 지원하는 것을 목적으로 합니다. 또한 수행 이후 자기평가서 작성, 활동 내용 정리, 세특 반영 전략 수립 등 세특 기재 관리에 해당하는 과정은 별도의 \'기재 관리 프로그램\'을 통해 진행됨을 미리 알려 드립니다.',
            '수행관리 결과물은 수행평가의 공정성을 침해하지 않는 범위에서 탐구 방향, 보고서 흐름, 발표 구성 등의 틀(초안) 형태로 제공되며, 완성본 대행 또는 제출용 문안 작성은 제공하지 않습니다. 요청 시 학생은 과목명, 제출 형식, 제출 기한, 학교 안내문 등 최소한에 필요한 기본 자료를 함께 제공해야 하며, 자료가 불충분한 경우 지원이 제한될 수 있습니다.',
            '수학 문제의 풀이 과정, 롤모델 조사와 같이 개인적 감상이나 경험이 중심이 되는 활동, 학교 행사 참여 보고서처럼 학생 본인만 확인하고 작성할 수 있는 내용 등 학생 고유의 경험과 사고가 반드시 반영되어야 하는 영역은 지원이 제한될 수 있습니다.',
            '수행관리에서 제공되는 자료와 코칭 내용은 학생의 수행평가 준비를 돕기 위한 참고 자료이며, 학교 제출물의 최종 작성 및 제출 책임은 학생에게 있습니다. 학생은 제공된 방향과 자료를 바탕으로 자신의 이해와 표현에 맞게 보고서를 재구성해야 합니다.',
            '수행평가의 평가 결과, 점수, 교사 피드백, 생기부 반영 여부 등은 학교의 평가 기준과 교사의 판단에 따라 달라질 수 있으므로, 수행관리 프로그램이 특정 결과를 보장하지는 않습니다. 따라서 학생은 자신의 수업 맥락, 수행 조건, 교사의 안내 기준에 맞게 제공된 내용을 수정하고 더 발전시켜 활용하는 것을 권장드립니다.',
            '평일 17시 이후 접수된 요청 건은 다음 업무일 처리를 원칙으로 하며, 토요일 16시 이후 접수된 요청 건은 다음 첫 업무일 처리를 원칙으로 합니다. 정기 휴무일인 일요일 및 공휴일에는 요청 건에 대한 지원이 원칙적으로 제공되지 않습니다.',
            '컨설팅 지원 시간 이후 발생되는 수행평가 보고서 작성이 필요한 경우에는 24시간 이용 가능한 세특구원자(보고서 설계도 플랫폼)을 활용해 주시기 바랍니다. (건당 5,500~7,500원 별도 결제 필요)',
          ],
        },
      ],
      finalNote: '위 사항에 대해 숙지하였으며 개인정보수집 및 이용에 동의합니다.',
    },

    /* ── 교과+정시관리(개별) ── */
    gyogwa: {
      docType:     'gyogwa',
      tabLabel:    '교과+정시관리(개별)',
      title:       '[교과+정시 관리 컨설팅]\n가입약관',
      signerLabel: '가입자(학부모성명)',
      pricePageId: null, // _getGyogwaPrices() 로 동적 로드
      sections: [
        {
          title: '1. 가입정보',
          type:  'gyogwa-info',
          // 가입정보 테이블은 _renderInputForm에서 별도 렌더
        },
        {
          title: '2. 컨설팅 항목',
          type:  'gyogwa-items',
          rows: [
            { num: '1', desc: '내신, 모의 성적누적 및 대학별 환산점수 관리 (레포트 제공)' },
            { num: '2', desc: '수시 VS 정시 밸런스 관리' },
            { num: '3', desc: '내성적 VS 부족과목 학습전략 상담' },
            { num: '4', desc: '목표대학 관리, 학과추천, 합격라인예측' },
          ],
        },
        {
          title: '3. 가입 유의사항',
          type:  'numbered',
          items: [
            '교과 + 정시 관리 컨설팅은 1년 단위 관리 프로그램이며, 결제와 동시에 효력이 발생합니다.',
            '계약시점부터 필요한 개인정보 수집 및 이용에 동의가 된 것으로 판단하며, 제3자에게 정보 제공하지 않습니다. 동의 철회시 또는 고등학교 졸업시점까지 보유 및 이용하며 입시관련 성적 및 합격대학 통계를 위해 합격자 정보 활용 동의도 포함됩니다. (수집범위 : 학교생활기록부, 성적표, 연락처 및 신상정보)',
            '대면은 총 4회까지 제공되며, 가입 기간 종료 이후에는 잔여 대면이 사용 불가합니다.',
          ],
        },
        {
          title: '4. 가입해지 시 환불규정',
          type:  'gyogwa-refund',
          items: [
            '성적 입력 이후 해지 시 시스템 세팅비용(20만원) 차감 후 환불됩니다.',
            '정기 대면 컨설팅(대면 대체 전화상담 포함) 진행 시 회당 10만원 차감 후 환불됩니다.',
            '대면 컨설팅 및 전화상담을 진행하지 않은 경우에도 가입기간 경과 이후에는 환불이나 다른 컨설팅으로 변경 불가합니다.',
            '가입약관에 명시되어 있는 경우 외의 환불규정은 \'교습비등 반환기준\'에 의거합니다.',
            '환급금은 가입 해지 의사를 명확히 표시한 해지확정일자를 기준으로 정산됩니다.',
          ],
          refundTable: [
            { period: '1개월 미만',           rule: '제공받은 서비스 차감 후 환불 (시스템 세팅비용 20만원 포함)' },
            { period: '1개월 이상~3개월 미만', rule: '가입금액의 30% 차감 (시스템 세팅비용 20만원 포함)' },
            { period: '3개월 이상~6개월 미만', rule: '가입금액의 50% 차감 (시스템 세팅비용 20만원 포함)' },
            { period: '6개월 이상~9개월 미만', rule: '가입금액의 80% 차감' },
          ],
        },
      ],
      finalNote: '위 사항에 대해 숙지하였으며 개인정보수집 및 이용에 동의합니다.',
    },
  };


  /* ============================================================
   * 4. 서명 캔버스 상태
   * ============================================================ */
  let _canvas       = null;
  let _ctx          = null;
  let _drawing      = false;
  let _hasSignature = false;
  let _currentTab   = 'jaeji';  // 'jaeji' | 'suhaeng' | 'gyogwa'
  let _pollTimer    = null;
  let _signatureData = null;
  let _formData      = {};
  let _selectedPages = [];       // URL selectedPages 파라미터 파싱값
  let _selectedPriceLabel = '';   // 선택된 price label (1학기/2학기/학년관리 판단용)


  /* ============================================================
   * 5. 초기화
   * ============================================================ */
  async function init() {
    await _deleteSignature();
    await _loadRemoteConfig();

    // selectedPages 파싱 — 초기화 최우선
    const _p = new URLSearchParams(window.location.search);
    const _spRaw = _p.get('selectedPages') || '';
    _selectedPages = _spRaw.split(',').map(s => s.trim()).filter(Boolean);

    _renderTabs();
    _bindEvents();

    // 첫 탭 결정 — tab 파라미터 우선, 없으면 selectedPages로 자동 결정
    const tabParam = _p.get('tab') || '';
    let firstTab = 'jaeji';
    if (tabParam && TERMS_DATA[tabParam]) {
      firstTab = tabParam;
    } else {
      // selectedPages 기반 자동 결정
      if (_selectedPages.includes('ind-a'))      firstTab = 'jaeji';
      else if (_selectedPages.includes('ind-b')) firstTab = 'suhaeng';
      else if (_selectedPages.some(id => id && !id.startsWith('rm-') && !id.startsWith('sc-') && !id.startsWith('ind-'))) firstTab = 'gyogwa';
    }
    _switchTab(firstTab);

    _startPolling();
    _applyUrlParams();
  }

  function _signToast(msg) {
    let toast = document.getElementById('sg-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sg-toast';
      toast.style.cssText = 'position:fixed;bottom:36px;left:50%;transform:translateX(-50%);'
        + 'background:#1a1d2e;color:#fff;padding:12px 28px;border-radius:12px;'
        + 'font-size:14px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,0.15);'
        + 'z-index:9999;display:flex;align-items:center;gap:10px;white-space:nowrap;'
        + 'font-family:\'Noto Sans KR\',sans-serif;transition:opacity 0.3s;';
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<span style="font-size:16px;">✓</span> ' + msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
  }

  function _bindEvents() {
    document.getElementById('sg2-tab-jaeji')?.addEventListener('click',   () => _switchTab('jaeji'));
    document.getElementById('sg2-tab-suhaeng')?.addEventListener('click', () => _switchTab('suhaeng'));
    document.getElementById('sg2-tab-gyogwa')?.addEventListener('click',  () => _switchTab('gyogwa'));
  }


  /* ============================================================
   * 6. 탭 전환
   * ============================================================ */
  // 탭별 선택 여부 확인
  function _isTabSelected(tab) {
    if (!_selectedPages || _selectedPages.length === 0) return true; // 파라미터 없으면 전체 허용
    if (tab === 'jaeji')   return _selectedPages.includes('ind-a');
    if (tab === 'suhaeng') return _selectedPages.includes('ind-b');
    if (tab === 'gyogwa')  return _selectedPages.some(id => id && !id.startsWith('rm-') && !id.startsWith('sc-') && !id.startsWith('ind-'));
    return true;
  }

  function _switchTab(tab) {
    // 미선택 탭 차단
    if (!_isTabSelected(tab)) {
      _signToast('해당 컨설팅 계약이 진행되지 않았습니다.');
      return;
    }

    _currentTab = tab;
    _signatureData = null;

    document.querySelectorAll('.sg-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    const data = TERMS_DATA[tab];
    _renderDocument(data);
    document.querySelector('.sg-doc-scroll')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    _renderInputForm(data);
    _initCanvas();
    _updateSignPreview(null);

    // 동의 체크박스 초기화
    const agreeChk = document.getElementById('sg2-agree-chk');
    if (agreeChk) agreeChk.checked = false;

    setTimeout(_refillForm, 0);
    _startPolling();
  }


  /* ============================================================
   * 7. 탭 버튼 렌더
   * ============================================================ */
  function _renderTabs() {
    const container = document.getElementById('sg-tabs');
    if (!container) return;
    // 현재 URL 파라미터 전달용 (sign.html 복귀 시)
    const curSearch = window.location.search;
    container.innerHTML = `
      <button class="sg-tab-btn sg-tab-btn-a" data-tab="terms"
        onclick="Sign2._blockAzone()">
        📋 가입약관 <span class="sg-tab-sub">학부모 서명</span>
      </button>
      <button class="sg-tab-btn sg-tab-btn-a" data-tab="policy"
        onclick="Sign2._blockAzone()">
        📄 운영방침 동의서 <span class="sg-tab-sub">학생 서명</span>
      </button>
      <div class="sg-tab-divider"></div>
      <button class="sg-tab-btn" data-tab="jaeji" id="sg2-tab-jaeji">
        📝 기재관리(개별) <span class="sg-tab-sub">학부모 서명</span>
      </button>
      <button class="sg-tab-btn" data-tab="suhaeng" id="sg2-tab-suhaeng">
        🔬 수행관리(개별) <span class="sg-tab-sub">학부모 서명</span>
      </button>
      <button class="sg-tab-btn" data-tab="gyogwa" id="sg2-tab-gyogwa">
        📊 교과+정시관리(개별) <span class="sg-tab-sub">학부모 서명</span>
      </button>`;
  }

  // A존 탭 차단 — 개별 컨설팅 페이지에서는 로드맵 약관 접근 불가
  function _blockAzone() {
    _signToast('학년관리 로드맵 계약이 없습니다.');
  }


  /* ============================================================
   * 8. 약관 본문 렌더
   * ============================================================ */
  function _renderDocument(data) {
    const el = document.getElementById('sg-doc-body');
    if (!el) return;

    let html = '';

    data.sections.forEach(sec => {
      html += `<div class="sg-section">`;

      // 교과+정시 가입정보 섹션 — 정보 입력폼이 우측에 있으므로 본문에는 제목만
      if (sec.type === 'gyogwa-info') {
        html += `<div class="sg-section-title">${sec.title}</div>`;
        html += `<div class="sg-intro" style="font-size:12px;color:var(--dt-ink3);">우측 정보 입력란을 통해 가입정보를 입력해 주세요.</div>`;
        html += `</div>`;
        return;
      }

      // 위법행위 고지 (인트로 + notice-list 복합)
      if (sec.type === 'sub-title-intro') {
        html += `<div class="sg-section-title">${sec.title}</div>`;
        html += `<div class="sg-intro">${sec.intro}</div>`;
        html += `<div class="sg-notice-list">`;
        sec.items.forEach(item => {
          html += `
            <div class="sg-notice-item">
              <span class="sg-notice-num">${item.num}</span>
              <div>
                <strong>${item.title}</strong>
                <span class="sg-notice-desc"> — ${item.desc}</span>
              </div>
            </div>`;
        });
        html += `</div>`;
        html += `</div>`;
        return;
      }

      // 교과+정시 컨설팅 항목
      if (sec.type === 'gyogwa-items') {
        html += `<div class="sg-section-title">${sec.title}</div>`;
        html += `<div class="sg-table-wrap"><table class="sg-table">
          <thead><tr><th>순번</th><th>상세내용</th></tr></thead>
          <tbody>`;
        sec.rows.forEach(r => {
          html += `<tr><td style="white-space:nowrap;">${r.num}</td><td>${r.desc}</td></tr>`;
        });
        html += `</tbody></table></div>`;
        html += `</div>`;
        return;
      }

      // 교과+정시 환불규정 (번호항목 + 환불테이블)
      if (sec.type === 'gyogwa-refund') {
        html += `<div class="sg-section-title">${sec.title}</div>`;
        html += `<ol class="sg-ol">`;
        sec.items.forEach((item, i) => {
          html += `<li><span class="sg-li-num">${i + 1}</span><span>${item}</span></li>`;
        });
        html += `</ol>`;
        // 환불 테이블 (4번 항목 안에 포함)
        html += `<div class="sg-table-wrap" style="margin-top:8px;"><table class="sg-table">
          <thead><tr><th>가입기간</th><th>환불규정</th></tr></thead>
          <tbody>`;
        sec.refundTable.forEach(r => {
          html += `<tr><td style="white-space:nowrap;font-weight:600;">${r.period}</td><td>${r.rule}</td></tr>`;
        });
        html += `</tbody></table></div>`;
        html += `</div>`;
        return;
      }

      // 일반 번호 항목
      if (sec.type === 'numbered') {
        html += `<div class="sg-section-title">${sec.title}</div>`;
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

      html += `</div>`;
    });

    el.innerHTML = html;
  }


  /* ============================================================
   * 9. 가입정보 입력폼 렌더
   * ============================================================ */
  function _renderInputForm(data) {
    const el = document.getElementById('sg-input-form');
    if (!el) return;

    // 금액 표시용 — 관리자 config에서 로드
    const prices = data.pricePageId
      ? _getPrices(data.pricePageId)
      : _getGyogwaPrices();

    const priceStr = prices
      ? prices.map(p => {
          const gLabel = p.grade ? `고${p.grade} ` : '';
          const note   = p.note  ? ` (${p.note})` : '';
          return `${gLabel}${Number(p.amt).toLocaleString('ko-KR')}원${note}`;
        }).join(' / ')
      : '관리자 설정값';

    if (data.docType === 'gyogwa') {
      // 교과+정시: 가입기간 1년 단위, 학생 번호 없음
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
            <label>상품명</label>
            <input class="sg-input sg-input-auto" id="f-product"
              value="교과 + 정시 관리 컨설팅 : 교과, 모의 성적누적 및 학습전략 컨설팅" readonly>
          </div>
          <div class="sg-form-row">
            <label>가입금액 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-amount"
              placeholder="${priceStr}" readonly>
          </div>
          <div class="sg-form-row">
            <label>특약 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-special" placeholder="DC 적용 내역 자동 입력" readonly>
          </div>
          <div class="sg-form-divider">✏️ 직접 입력</div>
          <div class="sg-form-row">
            <label>가입 시작일</label>
            <div style="display:flex;gap:6px;align-items:center;">
              <input class="sg-input" id="f-start" type="date"
                oninput="Sign2._calcExpiry()" style="flex:1;">
              <button type="button" class="sg-input"
                style="flex-shrink:0;width:52px;cursor:pointer;font-weight:700;font-size:12px;background:var(--sg-deep,#2A3340);color:#fff;border:none;border-radius:6px;padding:0 10px;height:38px;"
                onclick="(function(){
                  const d=new Date();
                  const pad=n=>String(n).padStart(2,'0');
                  document.getElementById('f-start').value=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
                  Sign2._calcExpiry();
                })()">오늘</button>
            </div>
          </div>
          <div class="sg-form-row">
            <label>가입기간 <span class="sg-auto-badge">자동계산</span></label>
            <input class="sg-input sg-input-auto" id="f-period-display"
              placeholder="시작일 입력 시 자동계산" readonly>
          </div>
          <div class="sg-form-row">
            <label>학부모 성명</label>
            <input class="sg-input" id="f-parent" placeholder="학부모 성함을 입력하세요">
          </div>
        </div>`;
    } else {
      // 기재관리 / 수행관리: 학기관리/학년관리, 학생 번호 포함
      const productLabel = data.docType === 'jaeji'
        ? '학생부 기재 관리 컨설팅 [ 학기관리 / 학년관리 ]'
        : '수행 관리 컨설팅 [ 학기관리 / 학년관리 ]';

      el.innerHTML = `
        <div class="sg-form-title">가입 정보 입력</div>
        <div class="sg-form-note">🔒 자동입력 항목은 컨설팅 보드에서 가져옵니다</div>
        <div class="sg-form-grid">
          <div class="sg-form-row">
            <label>회원명 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-name" placeholder="학생 이름" readonly>
          </div>
          <div class="sg-form-row">
            <label>학교 / 학년 / 목표 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-school" placeholder="예) ○○고 / 고2 / 의대" readonly>
          </div>
          <div class="sg-form-row">
            <label>상품명 <span class="sg-auto-badge">자동</span></label>
            <div style="display:flex;gap:6px;align-items:center;">
              <select class="sg-input" id="f-grade" style="width:80px;flex-shrink:0;" onchange="Sign2._refillAmount()">
                <option value="">학년</option>
                <option value="고1">고1</option>
                <option value="고2">고2</option>
                <option value="고3">고3</option>
              </select>
              <input class="sg-input sg-input-auto" id="f-product"
                value="${productLabel}" readonly style="flex:1;">
            </div>
          </div>
          <div class="sg-form-row">
            <label>가입금액 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-amount"
              placeholder="${priceStr}" readonly>
          </div>
          <div class="sg-form-row">
            <label>특약 <span class="sg-auto-badge">자동</span></label>
            <input class="sg-input sg-input-auto" id="f-special" placeholder="DC 적용 내역 자동 입력" readonly>
          </div>
          <div class="sg-form-divider">✏️ 직접 입력</div>
          <div class="sg-form-row">
            <label>가입 시작일</label>
            <div style="display:flex;gap:6px;align-items:center;">
              <input class="sg-input" id="f-start" type="date"
                oninput="Sign2._calcExpiry()" style="flex:1;">
              <button type="button" class="sg-input"
                style="flex-shrink:0;width:52px;cursor:pointer;font-weight:700;font-size:12px;background:var(--sg-deep,#2A3340);color:#fff;border:none;border-radius:6px;padding:0 10px;height:38px;"
                onclick="(function(){
                  const d=new Date();
                  const pad=n=>String(n).padStart(2,'0');
                  document.getElementById('f-start').value=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
                  Sign2._calcExpiry();
                })()">오늘</button>
            </div>
          </div>
          <div class="sg-form-row">
            <label>가입기간 <span class="sg-auto-badge">자동계산</span></label>
            <input class="sg-input sg-input-auto" id="f-period-display"
              placeholder="시작일 입력 시 자동계산" readonly>
          </div>
          <div class="sg-form-row">
            <label>학생 휴대폰 번호</label>
            <input class="sg-input" id="f-phone" placeholder="학생 연락처를 입력하세요" type="tel">
          </div>
        </div>`;
    }
  }


  /* ============================================================
   * 10. 서명 캔버스 초기화 (sign.js와 동일)
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
    const newCanvas = _canvas.cloneNode(true);
    _canvas.parentNode.replaceChild(newCanvas, _canvas);
    _canvas = newCanvas;
    _ctx    = _canvas.getContext('2d');

    _ctx.strokeStyle = '#15151A';
    _ctx.lineWidth   = 6;
    _ctx.lineCap     = 'round';
    _ctx.lineJoin    = 'round';
    _ctx.globalAlpha = 1;

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

    _canvas.addEventListener('mousedown',  start);
    _canvas.addEventListener('mousemove',  draw);
    _canvas.addEventListener('mouseup',    end);
    _canvas.addEventListener('mouseleave', end);
    _canvas.addEventListener('touchstart', start, { passive: false });
    _canvas.addEventListener('touchmove',  draw,  { passive: false });
    _canvas.addEventListener('touchend',   end,   { passive: false });
  }


  /* ============================================================
   * 11. 서명 적용 / 지우기
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
   * 12. Supabase 서명 폴링 (sign.js와 동일 구조)
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
        `${SUPABASE_URL}/rest/v1/${SIG_TABLE}?session_id=eq.${_sessionId}&doc_type=eq.ind&limit=1`,
        { method: 'GET', headers: _headers({ 'Accept': 'application/json' }) }
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (rows && rows.length > 0) {
        _stopPolling();
        _signatureData = rows[0].image_data;
        _updateSignPreview(_signatureData);
        const statusEl = document.getElementById('sg-poll-status');
        if (statusEl) {
          statusEl.innerHTML = '<span style="color:#1a6e3c;">✓ 서명 수신 완료</span>';
        }
        setTimeout(() => {
          document.getElementById('sg-request-modal')?.remove();
        }, 1200);
      }
    } catch (e) { /* 무시 */ }
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
   * 13. 입력값 수집
   * ============================================================ */
  function _collectFormData() {
    const get = (id) => document.getElementById(id)?.value?.trim() || '';
    const start  = get('f-start');
    const period = get('f-period-display') || start;

    if (_currentTab === 'gyogwa') {
      return {
        name:    get('f-name'),
        school:  get('f-school'),
        product: '교과 + 정시 관리 컨설팅 : 교과, 모의 성적누적 및 학습전략 컨설팅',
        period,
        amount:  get('f-amount'),
        special: get('f-special'),
        parent:  get('f-parent'),
      };
    } else {
      const grade   = get('f-grade');
      const baseLabel = _currentTab === 'jaeji'
        ? '학생부 기재 관리 컨설팅'
        : '수행 관리 컨설팅';
      const product = grade ? `${grade} ${baseLabel}` : baseLabel;
      return {
        name:    get('f-name'),
        school:  get('f-school'),
        product,
        period,
        amount:  get('f-amount'),
        special: get('f-special'),
        phone:   get('f-phone'),
      };
    }
  }


  /* ============================================================
   * 14. PDF 출력
   * ============================================================ */
  function printDocument() {
    if (!_signatureData) {
      alert('서명이 없습니다.\n서명란에 직접 서명 후 [서명 적용] 버튼을 눌러주세요.');
      return;
    }
    if (!document.getElementById('sg2-agree-chk')?.checked) {
      _signToast('동의 체크박스를 확인해 주세요.');
      return;
    }
    const form = _collectFormData();
    const data = TERMS_DATA[_currentTab];
    const html = _buildPrintHTML(data, form, _signatureData);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    _deleteSignature();
  }


  /* ============================================================
   * 15. 출력 HTML 생성 (sign.js _buildPrintHTML 구조 승계)
   * ============================================================ */
  function _buildPrintHTML(data, form, signatureImg) {
    const today = (() => {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}년 ${p(d.getMonth()+1)}월 ${p(d.getDate())}일`;
    })();

    // 가입정보 테이블
    const infoTableHtml = (() => {
      if (data.docType === 'gyogwa') {
        return `
        <div class="sg-info-card">
          <table class="sg-info-table">
            <tr>
              <th>회원명</th><td>${form.name || '　　　　　'}</td>
              <th>학교/학년</th><td>${form.school || '　　　　　'}</td>
            </tr>
            <tr>
              <th>상품명</th>
              <td colspan="3">${form.product}</td>
            </tr>
            <tr>
              <th>가입기간</th>
              <td colspan="3">${form.period || '2026 /　　/　　'} 시작 날짜를 기준으로 1년 (단 4회까지 대면 제공)</td>
            </tr>
            <tr>
              <th>가입금액</th>
              <td>${form.amount || '　　　　　'}원</td>
              <th>특약</th>
              <td>${form.special || ''}</td>
            </tr>
          </table>
        </div>`;
      } else {
        return `
        <div class="sg-info-card">
          <table class="sg-info-table">
            <tr>
              <th>회원명</th><td>${form.name || '　　　　　'}</td>
              <th>학교/학년/목표</th><td>${form.school || '　　　　　'}</td>
            </tr>
            <tr>
              <th>상품명</th>
              <td colspan="3">${form.product}</td>
            </tr>
            <tr>
              <th>가입기간</th>
              <td colspan="3">
                ${form.period || '　　년 　월 　일 ~ 　　년 　월 　일'}
                <span style="font-size:11px;color:#666;">&nbsp;(관리 종료일 : 1학기 8/31, 2학기 ~1/31)</span>
              </td>
            </tr>
            <tr>
              <th>가입금액</th>
              <td>${form.amount || '　　　　　'}원</td>
              <th>특약</th>
              <td>${form.special || ''}</td>
            </tr>
            ${form.phone ? `<tr><th>학생 휴대폰 번호</th><td colspan="3">${form.phone}</td></tr>` : ''}
          </table>
          <div style="font-size:11px;color:#666;padding:8px 12px;border-top:1px solid #e0e0e0;">
            * 가입기간이 지나면 관리는 자동 종료됩니다.<br>
            * 8월중 혹은 12월중 갱신을 희망하는 회원은 우선으로 가입 대상이 될 수 있으며, 이후로는 관리 인원 제한 정책에 따라 갱신이 불가할 수 있습니다.
          </div>
        </div>`;
      }
    })();

    // 본문 HTML
    let bodyHtml = '';
    data.sections.forEach(sec => {
      if (sec.type === 'gyogwa-info') return; // 출력물에서는 위 infoTable로 대체

      bodyHtml += `<div class="sg-pr-section">`;
      bodyHtml += `<div class="sg-pr-section-title">${sec.title}</div>`;

      if (sec.type === 'sub-title-intro') {
        bodyHtml += `<div class="sg-pr-intro">${sec.intro}</div>`;
        sec.items.forEach(item => {
          bodyHtml += `<div class="sg-pr-notice-item">
            <span class="sg-pr-notice-num">${item.num}</span>
            <div><strong>${item.title}</strong> — ${item.desc}</div>
          </div>`;
        });
      }
      if (sec.type === 'gyogwa-items') {
        bodyHtml += `<table class="sg-table">
          <thead><tr><th>순번</th><th>상세내용</th></tr></thead>
          <tbody>`;
        sec.rows.forEach(r => {
          bodyHtml += `<tr><td style="white-space:nowrap;">${r.num}</td><td>${r.desc}</td></tr>`;
        });
        bodyHtml += `</tbody></table>`;
      }
      if (sec.type === 'gyogwa-refund') {
        bodyHtml += `<ol class="sg-pr-ol">`;
        sec.items.forEach((item, i) => {
          bodyHtml += `<li><span class="sg-pr-li-num">${i+1}</span><span>${item}</span></li>`;
        });
        bodyHtml += `</ol>`;
        bodyHtml += `<table class="sg-table sg-pr-refund" style="margin-top:8px;">
          <thead><tr><th>가입기간</th><th>환불규정</th></tr></thead>
          <tbody>`;
        sec.refundTable.forEach(r => {
          bodyHtml += `<tr><td style="white-space:nowrap;font-weight:600;">${r.period}</td><td>${r.rule}</td></tr>`;
        });
        bodyHtml += `</tbody></table>`;
      }
      if (sec.type === 'numbered') {
        sec.items.forEach((item, i) => {
          bodyHtml += `<div class="sg-pr-num-row">
            <span class="sg-pr-num-badge">${i+1}</span>
            <p>${item}</p>
          </div>`;
        });
      }

      bodyHtml += `</div>`;
    });

    // 서명란
    const parentName = (data.docType === 'gyogwa') ? (form.parent || '') : '';
    const sigHtml = `
      <div class="sg-pr-sign-area">
        <div class="sg-pr-sign-text">${data.finalNote}</div>
        <div class="sg-pr-sign-date">${today}</div>
        ${data.docType === 'gyogwa' ? `
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
<title>${[form.name, form.school, data.tabLabel].filter(Boolean).join('_')}</title>
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
.sg-pr-toolbar{position:fixed;top:0;left:0;right:0;height:52px;background:#2A3340;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 24px;z-index:999}
.sg-pr-tb-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 18px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
.sg-pr-tb-print{background:#fff;color:#2A3340}
@media print{.sg-pr-toolbar{display:none}body{padding-top:0}}
.sg-pr-page{max-width:680px;margin:0 auto;padding:0 0 32px}
.sg-pr-header{background:#fff;padding:12px 28px;display:flex;align-items:center;gap:12px}
.sg-pr-header-left{flex:1}
.sg-pr-header-right{flex:1;display:flex;justify-content:flex-end;align-items:center}
.sg-pr-brand{font-size:9px;font-weight:700;letter-spacing:.22em;color:var(--dt-ink3)}
.sg-pr-doc-title{font-size:14px;font-weight:800;color:var(--dt-ink);margin-top:2px}
.sg-pr-badge{font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--dt-acc);border:1px solid var(--dt-line);border-radius:3px;padding:4px 10px}
.sg-pr-header-line{height:1px;background:var(--dt-line-md);margin:0 28px}
.sg-pr-banner{background:var(--dt-tint);border-bottom:1px solid var(--dt-line);padding:16px 28px;margin-bottom:4px}
.sg-pr-banner-label{font-size:8.5px;font-weight:700;letter-spacing:.24em;color:var(--dt-acc);margin-bottom:4px}
.sg-pr-banner-title{font-size:20px;font-weight:800;color:var(--dt-ink);letter-spacing:-.015em;white-space:pre-line}
.sg-info-card{padding:0 28px 12px}
.sg-info-table{width:100%;border-collapse:collapse;border:1.5px solid var(--dt-deep);font-size:12.5px}
.sg-info-table th{background:var(--dt-deep);color:#fff;font-weight:700;padding:8px 12px;white-space:nowrap;font-size:12px}
.sg-info-table td{padding:8px 12px;border:1px solid var(--dt-line);color:var(--dt-ink)}
.sg-pr-intro{margin:0 0 8px;padding:10px 14px;background:var(--dt-tint);border-left:3px solid var(--dt-deep);border-radius:0 6px 6px 0;font-size:12px;color:var(--dt-ink2);line-height:1.8}
.sg-pr-section{padding:8px 28px 6px}
.sg-pr-section-title{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:9px 14px;background:var(--dt-deep);border-radius:6px;font-size:12px;font-weight:700;color:#fff}
.sg-table{width:100%;border-collapse:collapse;font-size:11.5px}
.sg-table th{background:var(--dt-acc);color:#fff;padding:7px 10px;text-align:left;font-weight:700;font-size:11px}
.sg-table td{padding:7px 10px;border:1px solid var(--dt-line);color:var(--dt-ink2);vertical-align:top;line-height:1.6}
.sg-pr-ol{list-style:none;padding:0}
.sg-pr-ol li{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--dt-line-soft);font-size:12px;color:var(--dt-ink2);line-height:1.7}
.sg-pr-li-num{width:18px;height:18px;background:var(--dt-deep);color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;margin-top:2px}
.sg-pr-notice-item{display:flex;gap:10px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--dt-line-soft);font-size:12px;color:var(--dt-ink2)}
.sg-pr-notice-num{width:22px;height:22px;background:var(--dt-deep);color:#fff;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0}
.sg-pr-num-row{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--dt-line-soft);font-size:12px;color:var(--dt-ink2);line-height:1.7}
.sg-pr-num-badge{width:20px;height:20px;background:var(--dt-acc);color:#fff;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;margin-top:3px}
.sg-pr-refund td:first-child{white-space:nowrap;font-weight:600;color:var(--dt-deep)}
.sg-pr-sign-area{margin:16px 28px 0;padding:16px 20px;border:1.5px solid var(--dt-deep);border-radius:8px;background:#fff}
.sg-pr-sign-text{font-size:12px;color:var(--dt-ink2);line-height:1.7;margin-bottom:12px;text-align:center}
.sg-pr-sign-date{font-size:13px;font-weight:700;color:var(--dt-ink);text-align:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--dt-line-md)}
.sg-pr-sign-row-name{display:flex;align-items:center;gap:12px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--dt-line-md)}
.sg-pr-sign-row-sig{display:flex;align-items:center;gap:12px}
.sg-pr-signer-label{font-size:12px;font-weight:700;color:var(--dt-deep);white-space:nowrap;min-width:120px}
.sg-pr-signer-line{flex:1;border-bottom:1px solid var(--dt-ink);min-height:28px;font-size:13px;font-weight:600;color:var(--dt-ink);display:flex;align-items:flex-end;padding-bottom:2px}
.sg-pr-sign-img-wrap{flex:1;height:80px;border-bottom:1px solid var(--dt-ink);display:flex;align-items:center;justify-content:center}
.sg-pr-sign-img{max-width:100%;max-height:76px;object-fit:contain;filter:contrast(1.8) brightness(0.6)}
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
      <div class="sg-pr-brand">마이더스K교육컨설팅</div>
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
   * 16. URL 파라미터 자동채움 (sign.js _applyUrlParams 구조 승계)
   * ============================================================ */
  function _applyUrlParams() {
    const p = new URLSearchParams(window.location.search);
    if (!p.has('name') && !p.has('grade') && !p.has('grand')) return;

    const name   = p.get('name')   || '';
    const school = p.get('school') || '';
    const goal   = p.get('goal')   || '';
    const grade  = p.get('grade')  || '';
    const grand  = Number(p.get('grand') || 0);

    const dcRoadmap  = p.get('dcRoadmap')  || '';
    const dcSelect   = p.get('dcSelect')   || '';
    const dcSemester = p.get('dcSemester') || '';
    const dcSpecial  = p.get('dcSpecial')  || '';

    const fmtMan = (n) => {
      if (!n) return '';
      const man = Math.round(n / 10000);
      return man.toLocaleString('ko-KR') + '만원';
    };

    // 금액: grand 전체 아닌 탭별 pageId prices에서 직접 읽기
    // _formData.amountStr는 탭 전환 시 _renderInputForm에서 재계산되므로 여기선 fallback용만 저장
    const amountStr = grand ? fmtMan(grand) : '';

    const dcParts = [];
    if (dcRoadmap)  dcParts.push(dcRoadmap);
    if (dcSelect)   dcParts.push(dcSelect);
    if (dcSemester) dcParts.push(dcSemester);
    if (dcSpecial)  dcParts.push(dcSpecial);
    const specialStr = dcParts.join(' / ');

    const gradeLabel = grade ? '고' + grade : '';
    const schoolStr  = [school, gradeLabel, goal].filter(Boolean).join(' / ');

    _formData = { name, schoolStr, amountStr, specialStr };

    setTimeout(() => {
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.value = val;
      };
      setVal('f-name',    name);
      setVal('f-school',  schoolStr);
      setVal('f-amount',  amountStr);
      setVal('f-special', specialStr);

      const gradeEl = document.getElementById('f-grade');
      if (gradeEl && grade) {
        const gradeVal = grade.startsWith('고') ? grade : '고' + grade;
        const opt = gradeEl.querySelector(`option[value="${gradeVal}"]`);
        if (opt) opt.selected = true;
      }
    }, 50);
  }

  function _refillForm() {
    if (!_formData.name && !_formData.schoolStr) return;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    };
    setVal('f-name',    _formData.name);
    setVal('f-school',  _formData.schoolStr);

    // 금액 — 탭별 pageId prices에서 직접 읽기 (grand 전체 사용 안 함)
    const tabData = TERMS_DATA[_currentTab];
    if (tabData) {
      const prices = tabData.pricePageId
        ? _getPrices(tabData.pricePageId)
        : _getGyogwaPrices();
      if (prices && prices.length) {
        const fmtAmt = (n) => Number(n).toLocaleString('ko-KR') + '원';
        // 학년 선택값 기반 필터
        const gradeEl = document.getElementById('f-grade');
        const gradeNum = gradeEl ? (parseInt(gradeEl.value.replace(/[^0-9]/g, '')) || 0) : 0;
        const matched = gradeNum
          ? prices.filter(p => {
              if (!p.grade) return true;
              const gs = String(p.grade).split(',').map(g => Number(g.trim()));
              return gs.includes(gradeNum);
            })
          : prices;
        // 2학기 제외 main 금액만
        const main = matched.filter(p => !String(p.label || '').includes('2학기'));
        const display = (main.length ? main : matched)
          .map(p => fmtAmt(p.amt)).join(' / ');
        const amtEl = document.getElementById('f-amount');
        if (amtEl && display) amtEl.value = display;
      }
    }

    setVal('f-special', _formData.specialStr);
    setVal('f-start',   _formData.start);
    setVal('f-parent',  _formData.parent);
    setVal('f-phone',   _formData.phone);
    // _calcExpiry는 _refillAmount에서 label 저장 후 호출 — 여기서 직접 호출 안 함

    const grade = new URLSearchParams(window.location.search).get('grade') || '';
    const gradeEl = document.getElementById('f-grade');
    if (gradeEl && grade) {
      const gradeVal = grade.startsWith('고') ? grade : '고' + grade;
      const opt = gradeEl.querySelector(`option[value="${gradeVal}"]`);
      if (opt) { opt.selected = true; }
    }
    // 학년 선택 후 금액 재계산 트리거
    if (grade) setTimeout(_refillAmount, 10);
  }

  // 학년 드롭다운 변경 시 금액 재계산
  function _refillAmount() {
    const tabData = TERMS_DATA[_currentTab];
    if (!tabData) return;
    const prices = tabData.pricePageId
      ? _getPrices(tabData.pricePageId)
      : _getGyogwaPrices();
    if (!prices || !prices.length) return;
    const gradeEl = document.getElementById('f-grade');
    const gradeNum = gradeEl ? (parseInt(gradeEl.value.replace(/[^0-9]/g, '')) || 0) : 0;
    const matched = gradeNum
      ? prices.filter(p => {
          if (!p.grade) return true;
          const gs = String(p.grade).split(',').map(g => Number(g.trim()));
          return gs.includes(gradeNum);
        })
      : prices;
    // URL grand 금액으로 정확한 price 항목 1개 특정
    const grandAmt = Number(new URLSearchParams(window.location.search).get('grand') || 0);
    const exact = grandAmt ? matched.find(p => p.amt === grandAmt) : null;
    // 정확한 항목 있으면 그것만, 없으면 2학기 제외 main 우선
    const main = matched.filter(p => !String(p.label || '').includes('2학기'));
    const target = exact || (main.length ? main[0] : matched[0]);
    const display = target ? Number(target.amt).toLocaleString('ko-KR') + '원' : '';
    const amtEl = document.getElementById('f-amount');
    if (amtEl && display) amtEl.value = display;
    // label 저장 — 특정된 항목 1개 기준
    _selectedPriceLabel = target ? (target.label || '') : '';
    // 상품명 업데이트 — label 기반 (학기관리/학년관리 표시)
    const prodEl = document.getElementById('f-product');
    if (prodEl) {
      const isJaeji = _currentTab === 'jaeji';
      const baseName = isJaeji ? '학생부 기재 관리 컨설팅' : '수행 관리 컨설팅';
      const semester = _selectedPriceLabel.includes('2학기') ? ' [ 2학기 학기관리 ]'
        : _selectedPriceLabel.includes('1학기') ? ' [ 1학기 학기관리 ]'
        : ' [ 학년관리 ]';
      prodEl.value = baseName + semester;
    }
    // label 저장 후 가입기간 재계산
    const startEl = document.getElementById('f-start');
    if (startEl && startEl.value) Sign2._calcExpiry();
  }


  /* ============================================================
   * 17. 가입 시작일 → 기간 자동계산 (sign.js 동일)
   * ============================================================ */
  function _calcExpiry() {
    const startEl  = document.getElementById('f-start');
    const periodEl = document.getElementById('f-period-display');
    if (!startEl) return;
    const val = startEl.value;
    if (!val) {
      if (periodEl) periodEl.value = '';
      return;
    }
    const d         = new Date(val);
    const startYear = d.getFullYear();

    if (_currentTab === 'gyogwa') {
      // 교과+정시: 1년 단위
      const endStr = `${startYear + 1}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
      if (periodEl) periodEl.value = `${val.replace(/-/g,'.')} ~ ${endStr} (1년)`;
    } else if (_currentTab === 'jaeji') {
      // 기재관리 — label 기반 판단
      // 2학기: ~ 다음년도 1/31 / 1학기: ~ 8/31 / 학년관리: ~ 다음년도 1/31
      let endStr;
      if (_selectedPriceLabel.includes('2학기')) {
        endStr = `${startYear + 1}.01.31`;
      } else if (_selectedPriceLabel.includes('1학기')) {
        endStr = `${startYear}.08.31`;
      } else {
        // 학년관리 — 다음년도 1/31
        endStr = `${startYear + 1}.01.31`;
      }
      if (periodEl) periodEl.value = `${val.replace(/-/g,'.')} ~ ${endStr}`;
    } else if (_currentTab === 'suhaeng') {
      // 수행관리 — label 기반 판단
      // 2학기: ~ 12/31 / 1학기: ~ 8/31 / 학년관리: ~ 12/31
      let endStr;
      if (_selectedPriceLabel.includes('2학기')) {
        endStr = `${startYear}.12.31`;
      } else if (_selectedPriceLabel.includes('1학기')) {
        endStr = `${startYear}.08.31`;
      } else {
        // 학년관리 — 12/31
        endStr = `${startYear}.12.31`;
      }
      if (periodEl) periodEl.value = `${val.replace(/-/g,'.')} ~ ${endStr}`;
    }
  }


  /* ============================================================
   * Public API
   * ============================================================ */

  /* ============================================================
   * 아이패드 전용 서명 페이지 진입 확인
   *     URL에 ?sign_session=xxx&doc=xxx 파라미터가 있으면 서명 전용 모드
   * ============================================================ */
  function checkTabletMode() {
    const params = new URLSearchParams(window.location.search);
    const sessId = params.get('sign_session');
    const docType = params.get('doc');
    if (!sessId) return false;

    _currentTab = (docType && TERMS_DATA[docType]) ? docType : 'jaeji';
    _renderTabletUI();
    return true;
  }

  function _renderTabletUI() {
    document.body.innerHTML = `
      <div class="sg-tablet-wrap">
        <div class="sg-tablet-header">
          <div class="sg-tablet-brand">마이더스K교육컨설팅</div>
          <div class="sg-tablet-title">개별 컨설팅</div>
        </div>
        <div class="sg-tablet-guide">아래 서명란에 손가락으로 서명해 주세요</div>
        <div class="sg-tablet-canvas-area" id="sg-canvas-area">
          <div class="sg-canvas-placeholder" id="sg-canvas-placeholder">
            <span>✍ 여기에 서명하세요</span>
          </div>
          <canvas id="sg-canvas" width="700" height="200"></canvas>
        </div>
        <div class="sg-tablet-btns">
          <button class="sg-tablet-btn sg-tablet-btn-clear"   onclick="Sign2._clearCanvas()">지우기</button>
          <button class="sg-tablet-btn sg-tablet-btn-submit"  onclick="Sign2._submitFromTablet()">서명 완료</button>
          <button class="sg-tablet-btn sg-tablet-btn-refresh" onclick="location.reload()">새로고침</button>
        </div>
        <div class="sg-tablet-confirm" id="sg-tablet-confirm">
          <div class="sg-confirm-icon">✓</div>
          <div class="sg-confirm-text">서명이 전송되었습니다</div>
        </div>
      </div>`;

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
      .sg-tablet-btn-refresh{background:#455367;color:#fff}
      .sg-tablet-confirm{display:none;text-align:center;margin-top:24px;padding:20px;background:#edf7f1;border-radius:10px}
      .sg-tablet-confirm.visible{display:block}
      .sg-confirm-icon{font-size:40px;color:#1a6e3c;margin-bottom:8px}
      .sg-confirm-text{font-size:16px;font-weight:700;color:#1a6e3c}
    `;
    document.head.appendChild(style);
    _initCanvas();
  }

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
          doc_type:   'ind',
        }),
      });
      if (!res.ok) throw new Error('저장 실패');

      document.getElementById('sg-tablet-confirm')?.classList.add('visible');
      document.getElementById('sg-canvas-area')?.classList.add('submitted');
    } catch (e) {
      alert('서명 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
      console.error('[Sign2] submitSignature 실패:', e);
    }
  }

  return {
    init,
    checkTabletMode,
    _blockAzone,
    useLocalSignature,
    clearSignature,
    printDocument,
    _calcExpiry,
    _refillAmount,
    // 태블릿 내부 호출용
    _clearCanvas:      clearSignature,
    _submitFromTablet: submitSignatureFromTablet,
  };

})();
