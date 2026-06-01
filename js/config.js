/**
 * config.js — 마이더스K 단일 진실 공급원 (Single Source of Truth)
 * 
 * ⚠️ 이 파일을 직접 수정하지 마세요.
 *    관리자 변경값은 store.js → localStorage(mk_config)에 저장되며,
 *    런타임에 이 기본값을 덮어씁니다.
 *
 * 로드 순서: config.js → store.js → calc.js → ui.js → portfolio.js
 */

const MK_CONFIG = {

  /* ============================================================
   * 1. 앱 메타
   * ============================================================ */
  app: {
    brandName:   'MK MIDAS K',
    brandSub:    '학생부 관리 컨설팅',
    brandEn:     'Education Consulting',
    license:     '대구광역시 교육청 컨설팅부문 정식인가 제5513호',
    copyright:   '© 2025 마이더스K교육컨설팅',
    adminPin:    '1234',
  },

  /* ============================================================
   * 2. DC 할인율 설정
   *    관리자 페이지에서 변경 가능 / individual 0이면 버튼 숨김
   * ============================================================ */
  discount: {
    roadmap:    10,  // 로드맵 DC 할인율 (%) — 항상 표시
    selectDc:          0,   // 선택가 DC 할인율 (%) — 로드맵 1개만 선택 시 적용
    semesterDcAmt:      100, // 2학기 DC 차감 금액 (만원) — 로드맵DC(2개) 적용 시
    semesterDcAmtSingle: 50, // 2학기 DC 차감 금액 (만원) — 선택가DC(1개) 적용 시
    semesterAmt: {   // 2학기 금액 (표시 전용, 합산 제외)
      'rm-a': 0,
      'rm-b': 0,
    },
    individual: {    // 개별 항목별 할인율 — 모두 0이면 버튼 숨김
      'ind-a': 0,
      'ind-b': 0,
      'ind-c': 0,
      'ind-d': 0,
      'ind-e': 0,
    },
  },

  /* ============================================================
   * 3. 섹션 그룹 정의
   *    group 값은 calc.js / portfolio.js 에서 합산 키로 사용
   * ============================================================ */
  groups: {
    roadmap:    { label: '학년 관리 로드맵',  sbSection: true },
    individual: { label: '개별 컨설팅',      sbSection: true },
    strategy:   { label: '대입 전략 컨설팅', sbSection: true },
  },

  /* ============================================================
   * 3. 페이지 정의
   *    각 페이지는 사이드바 항목 1개 = 상세 페이지 1개
   * ============================================================ */
  pages: {

    /* ── 연간 관리형 개요 (합산 없음, 카드 뷰) ── */
    'rm-overview': {
      group:    'roadmap',
      sbIcon:   'ti-grid-dots',
      sbLabel:  '전체 보기',
      title:    '전체 보기',
      isOverview: true,   // 카드 그리드 페이지 플래그
    },

    /* ── 로드맵 A ── */
    'rm-a': {
      group:      'roadmap',
      sbIcon:     'ti-pencil',
      sbLabel:    'A. 세특 관리',
      title:      'A. 세특 관리',
      subtitle:   '생기부 기재 관리 (자기평가서 / 세특) — 심화 확장 스토리 구축',
      iconBg:     '#FFE3D4',
      iconColor:  '#C45000',
      iconClass:  'ti-pencil',
      ovCard: {                       // 연간관리형 카드 정보
        badge:    '프로그램 A',
        priceLabel: ['고1 230만원', '고2 250만원', '고3 200만원'],
        tree: [
          { label: '❶ 세특 강화 솔루션',    sub: '비인지 역량·교과회귀·고찰점 재구성' },
          { label: '❷ BEST 실적 관리',      sub: '항목별 2~3개 선별 / 국수영사과·창체' },
          { label: '❸ 심화 확장 스토리 구축', sub: 'N차 탐구 연결 / 전용 게시판 운영' },
        ],
        ovPrices: { 1: 2300000, 2: 2500000, 3: 2000000 },
      },
      prices: [
        { label: '고 1',                   amt: 2300000, grade: 1 },
        { label: '고 2',                   amt: 2500000, grade: 2 },
        { label: '고 3 (연간)',             amt: 2000000, grade: 3 },
        { label: '고 3 (1학기 또는 2학기)', amt: 1000000, grade: 3, note: '학기별 단독 선택' },
      ],
      programs: [
        {
          num: '❶',
          title: '세특 강화 솔루션',
          items: [
            '각종 활동 결과물을 학교 제출용 자기평가서 혹은 세특으로 기재 요약',
            '단순 요약이 아닌, 보고서에 숨어 있는 비인지적 역량, 교과회귀, 고찰점 강화 재구성',
          ],
        },
        {
          num: '❷',
          title: 'BEST 실적 관리 — 항목별 최대 2~3개',
          items: [
            '국/수/영/사/과 교과, 자율/동아리/진로/행특',
            '진로 관련 교과목 지원',
            '연결 주제는 기재관리 시 선별 추천',
          ],
        },
        {
          num: '❸',
          title: '심화 확장 스토리 구축',
          items: [
            'N차 심화 탐구 연결 (기재관리 시 선별)',
            '이전 활동을 심화 확장하는 수행 및 창체 활동 주제 + 보고서 설계도 제공',
            '학생부 분석 및 심화 확장 주제 추천 — 생기부 확정본 기준 작성',
            '연간관리 로드맵 회원 전용 게시판 운영',
          ],
        },
      ],
      conditions: [
        {
          title: '지원 교과 영역',
          type: 'tags+text',
          tags: ['국어','수학','영어','사회','과학','자율활동','동아리','진로','행특','진로과목'],
          text: '진로 관련 교과목 지원. 연결 주제는 기재관리 시 선별 추천.',
        },
        {
          title: '운영 방식',
          type: 'text',
          text: '학생이 실제 수행한 기록물에 대해서만 세특 기재 진행\n증빙 기록물(보고서) 없는 활동, 단순 신문 스크랩 등 지원 불가\n기재 요약본 제공 후 수정 요청은 원칙적으로 불가\n기록물 제출 시 \'학생명_과목명_활동주제\' 및 제출 기한 명시 필수\n평일 17시 이후 요청 → 다음날 처리 / 토 16시 이후 → 다음 첫 영업일',
        },
      ],
      notes: [
        { color: 'blue',  icon: 'ti-info-circle', text: '기재관리 개별 회원은 세특 전략 개별 컨설팅으로 진행 가능 (+40만원 추가). 심화 확장 스토리는 로드맵 회원 기본 제공.' },
        { color: 'red',   icon: 'ti-ban',         text: '보고서 미접수로 인한 세특 기재 불가 시, 가입 기간 경과 후에는 환불 및 다른 컨설팅으로 변경이 불가합니다.' },
      ],
    },

    /* ── 로드맵 B ── */
    'rm-b': {
      group:      'roadmap',
      sbIcon:     'ti-layout-list',
      sbLabel:    'B. 수행 관리',
      title:      'B. 수행 관리',
      subtitle:   '수행 조건 분석 / 방향성 코칭 / 보고서 설계도',
      iconBg:     '#FFD3E1',
      iconColor:  '#b01a4e',
      iconClass:  'ti-layout-list',
      ovCard: {
        badge:    '프로그램 B',
        priceLabel: ['고1 220만원', '고2 240만원', '고3 200만원'],
        tree: [
          { label: '❶ 수행 조건 분석',       sub: '제출 형식·핵심 기준 정리' },
          { label: '❷ 방향성 코칭 (옵션 A)', sub: '탐구 주제·자료 활용 방향 제시' },
          { label: '❸ 보고서 설계도 (옵션 B)', sub: '초안 형태·A+B 혼합 제공 가능' },
        ],
        ovPrices: { 1: 2200000, 2: 2400000, 3: 2000000 },
      },
      prices: [
        { label: '고 1',           amt: 2200000, grade: 1 },
        { label: '고 2',           amt: 2400000, grade: 2 },
        { label: '고 3 (연간)',     amt: 2000000, grade: 3 },
        { label: '고 3 (1학기 또는 2학기)', amt: 1000000, grade: 3, note: '학기별 단독 선택' },
      ],
      programs: [
        { num: '❶', title: '수행 조건 분석', items: ['수행 과제의 조건, 제출 형식, 활용 자료를 먼저 파악', '학생이 놓치기 쉬운 핵심 기준 정리'] },
        { num: '❷', title: '[옵션 A] 방향성 코칭', items: ['탐구 주제 선정, 자료 활용 방향', '보고서 전개 방식 등 학생 맞춤 수행 방향 제시'] },
        { num: '❸', title: '[옵션 B] 보고서 설계도 / 초안 제시', items: ['탐구 주제, 보고서 흐름, 실제 작성 가능 초안', '수행 조건에 따라 A, B, A+B 혼합형 제공'] },
      ],
      conditions: [
        { title: '지원 범위', type: 'tags+text', tags: ['국어','수학','영어','사회','과학','진로과목'], text: '교과 세특 전 영역. 주요교과 영역별 최대 2건 제공.' },
        { title: '운영 방식', type: 'text', text: '수행 공지를 밴드에 업로드하면 자동 지원. 수행관리와 주제 추천은 별도 과금.' },
      ],
      notes: [
        { color: 'red', icon: 'ti-ban', text: '보고서 대리 작성, 중간 첨삭 등 수행평가 공정성을 저해하는 지원은 불가합니다. (교육청 단속사항)' },
      ],
    },

    /* ── 로드맵 C ── */
    'rm-c': {
      group:      'roadmap',
      calcGroup:  'individual',  // 합산 계산 전용 — 사이드바는 roadmap 유지, 금액은 개별 버킷 합산 + 어떤 DC도 적용 안 함
      sbIcon:     'ti-bulb',
      sbLabel:    'C. 주제 추천',
      title:      'C. 주제 추천',
      subtitle:   '탐구 주제 + 보고서 설계도 / 세특구원자 플랫폼',
      iconBg:     '#E1D6FF',
      iconColor:  '#5b35c4',
      iconClass:  'ti-bulb',
      ovCard: {
        badge:       '프로그램 C',
        noAutoCheck: true,   // 학년 선택 시 자동 체크 안 함
        tree: [
          { label: '❶ 탐구 주제 + 설계도', sub: '도서·논문·참고자료 포함 패키지' },
          { label: '❷ 방향성 코칭',        sub: '학생 주도 활동 시 무료 지원' },
          { label: '❸ 세특구원자 플랫폼',   sub: '24시간 키워드 검색 / 할인 구독' },
        ],
        // ovPrices 없음 → 학년 자동 체크 완전 차단
      },
      prices: [
        {
          label:        '6개월 구독',
          amt:          342000,
          origAmt:      570000,   // 원가 (95,000 × 6)
          discountRate: 40,
          saveAmt:      228000,
          note:         '월 95,000원 × 6개월 → 40% 할인',
        },
        {
          label:        '1년 구독',
          amt:          570000,
          origAmt:      1140000,  // 원가 (95,000 × 12)
          discountRate: 50,
          saveAmt:      570000,
          note:         '월 95,000원 × 12개월 → 50% 할인',
        },
      ],
      priceRef: [
        { label: '건당 구매', ref: '7,500원/건' },
        { label: '월 구독',   ref: '95,000원/월' },
      ],
      programs: [
        { num: '❶', title: '탐구 주제 + 보고서 설계도 제공', items: ['탐구 동기, 과정, 도서·논문 등 참고자료 포함 패키지', '건당 5,500~7,500원 / 월구독 95,000원'] },
        { num: '❷', title: '방향성 코칭 (무료 제공)', items: ['학생이 주도적으로 결정한 활동에 한해 관련 자료 및 방향성 코칭 무료 지원', '수행 공지를 밴드에 올리면 자동 지원'] },
        { num: '❸', title: '세특구원자 플랫폼 활용', items: ['24시간 키워드 검색으로 탐구 주제 직접 선정', '주요대·메디컬 합격자 주제 업그레이드 제공', '컨설팅 회원 구독 할인 차등 적용'] },
      ],
      conditions: [
        { title: '과금 구조', type: 'text', text: '가입 시 별도 비용 없음\n세특구원자 플랫폼 단건 결제 방식으로 운영\n6개월 구독 40% 할인 / 연 구독 50% 할인' },
      ],
      notes: [
        { color: 'amber', icon: 'ti-alert-triangle', text: '탐구 주제에 과의존하는 것은 바람직하지 않습니다. 학생 스스로 고민하고 탐구하는 과정이 \'진정성\'의 핵심입니다.' },
      ],
    },

    /* ── 로드맵 D (autoCheck) ── */
    'rm-d': {
      group:      'roadmap',
      sbIcon:     'ti-users',
      sbLabel:    'D. 대면 컨설팅',
      title:      'D. 대면 컨설팅 (RPM)',
      subtitle:   'Roadmap · Planning · Mentoring / 성적 누적 분석 / 맞춤 상담',
      iconBg:     '#D4ECFF',
      iconColor:  '#0a4a8a',
      iconClass:  'ti-users',
      autoCheck:  true,    // 첫 진입 시 isDefault 항목 자동 체크
      ovCard: {
        badge:      '프로그램 D',
        fixed:      true,  // 연간관리형 카드에서 고정 체크 표시
        tree: [
          { label: '❶ RPM 컨설팅',   sub: '세특·창체 코칭 / 활동 방향 설계' },
          { label: '❷ 성적 누적 분석', sub: '전형별 가중치·목표대 포트폴리오' },
          { label: '❸ 맞춤 상담',     sub: '진로·진학 / 학부모 질의응답' },
        ],
      },
      prices: [
        { label: 'RPM 컨설팅',  amt: 600000, isDefault: true,  badge: '기본' },
        { label: '성적 누적 분석', amt: 700000, isDefault: true,  note: '초기 세팅비 10만원 포함' },
      ],
      programs: [
        { num: '❶', title: 'RPM 컨설팅', items: ['교과 & 창체 세특 코칭 — 활동 방향 설계', '동아리·진로·창체 주제 선정이 막힐 경우 구체적 실행 방안 제시'] },
        { num: '❷', title: '성적 누적 분석', items: ['내신/모의 성적 누적 및 전형별 가중치 관리', '부족 과목 학습 운영 전략', '목표 대학 포트폴리오 누적 관리'] },
        { num: '❸', title: '맞춤 상담', items: ['학생 맞춤 진로·진학 컨설팅', '학부모 질의응답 — 1:1 대면 시 상시 제공'] },
      ],
      conditions: [
        { title: '운영 방식', type: 'text', text: '1:1 대면 상시 제공\n성적 누적 관리 시스템 초기 세팅비 10만원 포함\n성적 입력 시 30만원 차감 기준으로 정산\n화상 상담, 전화 상담 포함' },
      ],
      notes: [],
    },

    /* ── 로드맵 E (autoCheck) ── */
    'rm-e': {
      group:      'roadmap',
      sbIcon:     'ti-settings',
      sbLabel:    'E. 기본 관리',
      title:      'E. 기본 관리',
      subtitle:   '학종 특강 / 입시 행정 관리',
      iconBg:     '#FFD3E1',
      iconColor:  '#8b1c3a',
      iconClass:  'ti-settings',
      autoCheck:  true,
      ovCard: {
        badge:      '프로그램 E',
        fixed:      true,
        tree: [
          { label: '❶ 학종 특강',      sub: '서류 평가·세특 디자인·빌드업 전략' },
          { label: '❷ 입시 행정 관리', sub: '스케줄·밴드·성적 기재 베이스 관리' },
        ],
      },
      prices: [
        { label: '학종 특강',  amt: 200000, isDefault: true, badge: '기본' },
        { label: '입시 행정',  amt: 800000, isDefault: true, badge: '기본' },
      ],
      programs: [
        { num: '❶', title: '학종 특강 (연 6회)', items: ['서류 평가 메커니즘', '세특 디자인 수업', '심화 탐구 빌드업 전략', '컨설팅 활용법'] },
        { num: '❷', title: '입시 행정 관리', items: ['상담 스케줄 관리', '컨설팅 밴드 운영 관리', '성적 입력 및 기재 베이스 관리'] },
      ],
      conditions: [
        { title: '운영 방식', type: 'text', text: '오프라인 / 온라인 / 자료 대체 가능. 특강은 연 6회까지. 평일 17시 이후·토 16시 이후는 다음 영업일 처리. 일요일·공휴일 지원 불가.' },
      ],
      notes: [],
    },

    /* ── 개별 A ── */
    'ind-a': {
      group:      'individual',
      sbIcon:     'ti-pencil',
      sbLabel:    'A. 기재 관리',
      title:      '[개별] A. 기재 관리',
      subtitle:   '자기평가서·세특 기재 요약 / 누적 관리',
      iconBg:     '#FFE3D4',
      iconColor:  '#C45000',
      iconClass:  'ti-pencil',
      prices: [
        { label: '1학기', amt: 1500000, grade: '1,2,3' },
        { label: '2학기', amt: 1500000, grade: '1,2,3' },
      ],
      programs: [
        { num: '❶', title: '기재 요약본 제공', items: ['항목별 BEST 실적 2~3개 선별', '학교 제출용 자기평가서 또는 세특 기재 요약본 제공', '국/수/영/사/과 및 창체 전 영역'] },
        { num: '❷', title: '누적 관리', items: ['접수 확인된 활동 내역 모두 누적 관리', '요청 시 한글/PDF 백업 파일 제공'] },
      ],
      conditions: [
        { title: '접수 규정', type: 'text', text: '\'학생명_과목명_활동주제\' 및 제출 기한 명시 필수\n당일 접수 및 제출 요구 지원 불가\n평일 17시 이후 접수 건은 다음날 처리' },
      ],
      notes: [
        { color: 'red', icon: 'ti-alert-triangle', text: '기재 기간 경과 후에는 환불 불가. 보고서 미접수 시 기재 불가.' },
      ],
    },

    /* ── 개별 B ── */
    'ind-b': {
      group:      'individual',
      sbIcon:     'ti-test-pipe',
      sbLabel:    'B. 수행 관리',
      title:      '[개별] B. 수행 관리',
      subtitle:   '수행 방향성 코칭 / 보고서 설계도',
      iconBg:     '#e4f7ef',
      iconColor:  '#0a5c35',
      iconClass:  'ti-test-pipe',
      prices: [
        { label: '고 1',         amt: 2200000, grade: 1 },
        { label: '고 2',         amt: 2400000, grade: 2 },
        { label: '고 3 (1학기)', amt: 1000000, grade: 3 },
      ],
      programs: [
        { num: '❶', title: '수행 방향성 코칭', items: ['수행 조건 분석 및 핵심 기준 정리', '탐구 주제 선정 및 보고서 방향 제시'] },
        { num: '❷', title: '결과물 초안 제시', items: ['보고서 설계도 및 실제 작성 가능 초안 형태 제공'] },
      ],
      conditions: [
        { title: '지원 범위', type: 'text', text: '주요교과(국수영사과) 영역별 최대 2건. 수행 공지를 밴드에 업로드하면 자동 지원.' },
      ],
      notes: [
        { color: 'red', icon: 'ti-ban', text: '보고서 대리 작성·첨삭은 불가합니다. (교육청 단속사항)' },
      ],
    },

    /* ── 개별 C ── */
    'ind-c': {
      group:      'individual',
      sbIcon:     'ti-telescope',
      sbLabel:    'C. 세특 전략',
      title:      '[개별] C. 세특 전략 컨설팅',
      subtitle:   '심화 확장 주제 + 스토리 / RPM1·RPM2',
      iconBg:     '#fff4e0',
      iconColor:  '#7a4f00',
      iconClass:  'ti-telescope',
      prices: [
        { label: '세특 전략 1회',        amt: 400000, note: '고2~고3' },
        { label: 'RPM1 / RPM2 (회당)',   amt: 200000 },
      ],
      programs: [
        { num: '❶', title: '세특 전략 컨설팅 (RPM1)', items: ['이전 활동 심화 확장 주제 + 스토리 추천', '경쟁력 있는 세특 완성을 위한 전략 설계'] },
        { num: '❷', title: '세특 전략 컨설팅 (RPM2)', items: ['전년 학생부 핵심 활동 분석', '연결되는 심화 확장 탐구 주제 추천'] },
      ],
      conditions: [
        { title: '대상 학년', type: 'text', text: '전년 생기부가 있는 고2~고3 학생 대상. 고1은 기재 정리 이후 연결 주제 추천.' },
      ],
      notes: [
        { color: 'blue', icon: 'ti-info-circle', text: '로드맵 회원은 기본 제공. 기재관리 개별 회원은 +40만원 추가.' },
      ],
    },

    /* ── 개별 D ── */
    'ind-d': {
      group:      'individual',
      sbIcon:     'ti-chart-line',
      sbLabel:    'D. 성적 누적',
      title:      '[개별] D. 성적 누적 컨설팅',
      subtitle:   '내신·모의 성적 누적 / 전형별 가중치 관리',
      iconBg:     '#f0eeff',
      iconColor:  '#4a2fc4',
      iconClass:  'ti-chart-line',
      prices: [
        { label: '성적 누적 분석', amt: 700000, note: '초기 세팅비 포함' },
      ],
      programs: [
        { num: '❶', title: '성적 누적 분석 시스템', items: ['내신/모의 성적 누적 및 전형별 가중치 관리', '부족 과목 학습 운영 전략', '목표 대학 포트폴리오 누적 관리'] },
      ],
      conditions: [
        { title: '운영 방식', type: 'text', text: '초기 세팅비 10만원 포함. 성적 입력 시 30만원 차감 기준으로 정산.' },
      ],
      notes: [],
    },

    /* ── 개별 E ── */
    'ind-e': {
      group:      'individual',
      sbIcon:     'ti-school',
      sbLabel:    'E. 컨설티칭',
      title:      '[개별] E. 컨설티칭',
      subtitle:   '수행평가 방향성 코칭 / 진로 컨설팅',
      iconBg:     '#fff0ec',
      iconColor:  '#8c3010',
      iconClass:  'ti-school',
      prices: [
        { label: '수행 방향성 코칭', amt: 500000, note: '학기별' },
        { label: '진로 컨설팅',      amt: 150000, note: '회당' },
      ],
      programs: [
        { num: '❶', title: '수행평가 방향성 코칭', items: ['수행평가 내용·맥락 이해 촉진', '질의응답 및 진행 방향 코칭 (학기별)'] },
        { num: '❷', title: '진로 컨설팅 (학종 대비)', items: ['전공·진로 변경 또는 진로 미확정 학생 전용', '학종 관점 진로 방향 설계'] },
      ],
      conditions: [
        { title: '운영 방식', type: 'text', text: '수행평가 방향성 코칭은 학기별 50만원. 보고서 작성 대행·점검·첨삭은 불가. (교육청 단속사항)' },
      ],
      notes: [
        { color: 'blue', icon: 'ti-info-circle', text: '진로 컨설팅은 진로 미확정 또는 전공 변경 학생 전용입니다.' },
      ],
    },

    /* ── 수시 컨설팅 ── */
    'sc-suisi': {
      group:      'strategy',
      sbIcon:     'ti-send',
      sbLabel:    '수시 컨설팅',
      title:      '수시 컨설팅',
      subtitle:   '원서 전략 수립 / 비교과 활동 기획서',
      iconBg:     '#e8f1fd',
      iconColor:  '#1a56c4',
      iconClass:  'ti-send',
      prices: [
        { label: '수시 원서 전략',    amt: 450000, note: '1회 / 고3', grade: 3 },
        { label: '비교과 활동 기획서', amt: 300000, note: '고1 / 주제 5개 + 브리핑', grade: 3 },
      ],
      programs: [
        { num: '❶', title: '수시 원서 전략 컨설팅', items: ['학생부 기반 지원 대학·학과 전략 수립', '전형별 유불리 분석 및 최종 조합 설계'] },
        { num: '❷', title: '고1 비교과 활동 기획서', items: ['진로 목표 맞춤 탐구 주제 5개 + 참고자료', '1:1 대면 브리핑 포함'] },
      ],
      conditions: [
        { title: '유의사항', type: 'text', text: '수시 예비 상담 이후 환불 불가\n기획서 배부 후에는 대면 미진행이어도 환불 불가' },
      ],
      notes: [],
    },

    /* ── 면접 컨설팅 ── */
    'sc-interview': {
      group:      'strategy',
      sbIcon:     'ti-message-dots',
      sbLabel:    '면접 컨설팅',
      title:      '면접 컨설팅',
      subtitle:   '서류 기반 심층 면접 대비',
      iconBg:     '#e4f7ef',
      iconColor:  '#0a5c35',
      iconClass:  'ti-message-dots',
      prices: [
        { label: '일반 학과',       amt: 350000, note: '1회', grade: 3 },
        { label: '의치한약수 · SKY', amt: 400000, note: '1회', grade: 3 },
      ],
      programs: [
        { num: '❶', title: '서류 기반 심층 면접 대비', items: ['학생부 기반 예상 질문 분석 및 질문지 작성', '1:1 대면 모의 면접 진행'] },
      ],
      conditions: [
        { title: '유의사항', type: 'text', text: '분석 및 질문지 작성 후 대면 미진행 시 20만원 차감\n의치한약수·SKY는 별도 금액 적용' },
      ],
      notes: [],
    },

    /* ── 정시 컨설팅 ── */
    'sc-jeongsi': {
      group:      'strategy',
      sbIcon:     'ti-calculator',
      sbLabel:    '정시 컨설팅',
      title:      '정시 컨설팅',
      subtitle:   '수능 기반 원서 전략 / 가채점 컨설팅',
      iconBg:     '#fff4e0',
      iconColor:  '#7a4f00',
      iconClass:  'ti-calculator',
      prices: [
        { label: '정시 원서 전략', amt: 350000, note: '가채점 포함 / 1회', grade: 3 },
        { label: '가채점 컨설팅', amt: 100000, note: '단독 신청', grade: 3 },
      ],
      programs: [
        { num: '❶', title: '정시 원서 전략 컨설팅', items: ['수능 성적 기반 지원 대학·학과 전략', '가채점 컨설팅 포함'] },
        { num: '❷', title: '가채점 컨설팅 (단독)', items: ['수능 가채점 기준 지원 가능 대학 분석', '별도 단독 신청 가능'] },
      ],
      conditions: [
        { title: '운영 방식', type: 'text', text: '정시 원서 전략에 가채점 컨설팅 포함. 가채점 단독 신청 시 10만원.' },
      ],
      notes: [],
    },

  }, // end pages

  /* ============================================================
   * 4. 연간관리형 전체 안내 노티스
   * ============================================================ */
  overviewNotice: '관리유예기간(다음 해 2월 15일)이 지나면 관리가 자동 종료됩니다. 갱신 희망 회원은 12월~1월 말 신청을 권장합니다.',
  // overviewNotices: 배열 방식 — { text, icon, color } 구조
  //   icon  : tabler icon class (ti-alert-triangle 등)
  //   color : 'orange' | 'blue' | 'red' | 'green'
  //   하위 호환: 배열 없으면 overviewNotice 단일값을 첫 항목으로 자동 변환
  overviewNotices: [],

  /* ============================================================
   * 5. 헬퍼: 런타임에 store 값으로 병합된 config 반환
   *    store.js 로드 후 MK_CONFIG.resolve() 호출
   * ============================================================ */
  resolve() {
    // store.js가 로드되어 있으면 저장된 관리자 변경값을 deep merge
    if (typeof Store !== 'undefined') {
      const saved = Store.loadConfig();
      if (saved) {
        const merged = _deepMerge(this, saved);
        // 신규 추가 페이지(config.js 기본값에 없는 페이지)는 저장값에서 직접 추가
        if (saved.pages) {
          Object.keys(saved.pages).forEach(id => {
            if (!this.pages[id]) merged.pages[id] = saved.pages[id];
          });
        }
        return merged;
      }
    }
    return this;
  },

}; // end MK_CONFIG


/* ============================================================
 * 내부 유틸 — deep merge (config 기본값 위에 저장값 덮어쓰기)
 * ============================================================ */
function _deepMerge(base, override) {
  const result = Object.assign({}, base);
  for (const key of Object.keys(override)) {
    if (
      override[key] &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      base[key] &&
      typeof base[key] === 'object'
    ) {
      result[key] = _deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}


/* ============================================================
 * 6. 페이지 순서 — 사이드바 / 렌더링 순서 보장
 * ============================================================ */
MK_CONFIG.pageOrder = [
  'rm-overview',
  'rm-a', 'rm-b', 'rm-c', 'rm-d', 'rm-e',
  'ind-a', 'ind-b', 'ind-c', 'ind-d', 'ind-e',
  'sc-suisi', 'sc-interview', 'sc-jeongsi',
];
