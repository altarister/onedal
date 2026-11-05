import type { BaseCall, CallEvidence, OfficeOrder, ServerCallFields } from '@onedal/shared';

/**
 * 🎯 **기본 콜 타입 — 네 배차망의 실제 글자가 칸에 들어가고, 지금 칸이 빠짐없이 갈 곳이 있다** (계획서 B2).
 * 🔴 ts-jest 가 타입까지 본다. OfficeOrder 에 칸이 늘거나 BaseCall 칸 이름이 바뀌면 이 파일이 안 돈다.
 * 예는 사례 원문을 손으로 옮긴 것이고 원달앱이 만든 값이 아니다.
 */
/** 채운 예 — pageReadCases.json 인성 «고양퀵서비스» 팝업 셋을 모은 한 콜. 시뮬레이터 글자이고 목록 줄이 없는 사례다 */
const insungExample: BaseCall = {
    id: 'ex-insung-1',
    targetApp: 'insung',
    dispatcherName: '고양퀵서비스',    // 머리 줄
    dispatcherPhone: '031-932-7722',  // 머리 줄
    stage: '신규',                     // «상태 : 신규»
    route: {
        pickup: { customerName: '가나상사', addressDetail: '경기 광주시 경안동 1-2', department: '물류팀', contactName: '김철수', phone1: '010-1234-5678', phone2: '031-000-0000' },  // [출발지상세]
        dropoff: { customerName: '다라상회', addressDetail: '서울 용산구 한남동 12', phone1: '010-9999-8888' },  // [도착지상세]
    },
    money: {
        lines: [
            { kind: 'income', won: 50000, label: '요금' },  // «요금 : 50,000(카드)(계산서)». 수수료를 뺀 값이다
            { kind: 'fee', rate: '23%', label: '수수료' },  // «수수료 : 23%». 탁송료는 빈 칸이라 줄이 없다
        ],
        paymentType: '카드',
        billingType: '계산서',
    },
    load: { vehicleType: '다마스', itemDescription: '박스 1개' },  // «차량 : 다마스» · «물품 : 박스 1개»
    time: {},  // 예약 앞글자가 없다. «03:57 상차»는 적요 글이다
    job: { tripType: '편도', orderForm: '보통', detailMemo: '까대기 있음 직접운반 대기 30분' },  // 구분 · 형태 · 적요 팝업
};

/** 위 콜의 기록 — 사례 원문 그대로 */
const insungEvidence: CallEvidence = {
    seen: [{ at: '읽은 시각', screen: 'newCall', read: 'text', rawText: "고양퀵서비스-031-932-7722\n전표\n상태 : 신규\n물품 : 박스 1개\n차량 : 다마스\n탁송료 :\n수수료 : 23%\n요금 : 50,000(카드)(계산서)\n구분 : 편도\n형태 : 보통\n적요상세 *카고 입니다. 세금계산서필 03:57 상차.\n[적요상세/정보]\n적요 상세\n적요 내용\n까대기 있음 직접운반\n대기 30분\n닫기\n[출발지상세]\n고객 가나상사\n위치: 경기 광주시 경안동 1-2\n부서 물류팀\n담당 김철수\n전화1 010-1234-5678\n전화2 031-000-0000\n[도착지상세]\n고객\n다라상회\n위치\n서울 용산구 한남동 12\n전화1 010-9999-8888" }],
};

/** 채운 예 — pageReadCases.json 픽커 «신촌동 → 자양2동» 한 콜. 실물이고 목록 줄이 없는 사례다 */
const pickerExample: BaseCall = {
    id: 'ex-picker-1',
    targetApp: 'kakaopicker',
    route: {
        pickup: { addressDetail: '경기 성남시 수정구 신촌동' },  // 사진 첫 정거장
        dropoff: { addressDetail: '서울 광진구 자양2동', customerName: 'NC이스트폴' },  // 사진 둘째 정거장 · 회색 상호
        pickupDistance: 18.9,    // «픽업 18.9km». 지금은 버리는 값을 끝 모습에서 담는다고 가정한 것이다
        deliveryDistance: 9.7,   // «배송 9.7km». 지금은 버리는 값을 끝 모습에서 담는다고 가정한 것이다
    },
    money: {
        lines: [
            { kind: 'income', won: 10830, label: '최종 수익' },  // 수수료 앞인지 뒤인지 모름
            { kind: 'deliveryFee', won: 9730, label: '배송비' },
            { kind: 'promo', won: 1100, label: '프로모션' },     // 10,830 = 9,730 + 1,100
        ],
    },
    load: { itemSize: '소형', itemDescription: '소형 세 변의 합 100cm ∙ 5kg 이하', sizeCm: 100, weightKg: 5 },  // 물품 정보. 이 글에서 크기 · 숫자를 뽑는 규칙이 있다고 가정한 것이다(지금 코드에는 없다)
    time: { dropoff: { text: '18:28까지 배송', by: '18:28' } },  // 사진 오른쪽 회색 글자
    job: { tagsText: '퀵 비즈' },  // 사진 첫 줄
};

/** 위 콜의 기록 — 사례 원문 그대로. 글자와 사진이 한 줄씩 온다 */
const pickerEvidence: CallEvidence = {
    seen: [
        { at: '읽은 시각', screen: 'newCall', read: 'text', rawText: "픽업지 경기 성남시 수정구 신촌동 물품 정보 소형 세 변의 합 100cm ∙ 5kg 이하 최종 수익 10,830 10,830 배송비 9,730P 9,730P 프로모션 1,100P 1,100P 넘기기 수락하기" },
        { at: '읽은 시각', screen: 'newCall', read: 'photo', rawText: "[사진]\n퀵 비즈\n경기 성남시 수정구 신촌동 픽업 18.9km\n서울 광진구 자양2동 배송 9.7km\n18:28까지 배송\nNC이스트폴\n물품 정보 소헝 세 변의 합 100cm · 5kg 이하\n최종 수익 10,830", changed: [{ field: 'time.dropoff.by', from: null, to: '18:28' }] },
    ],
};

/** 채운 예 — ex_images/인성플렉스/08_상세.xml 한 콜의 리더 값. 실물이고 목록 줄이 없는 사례다 */
const isflexExample: BaseCall = {
    id: 'ex-isflex-1',
    targetApp: 'isflex',
    route: {
        pickup: { addressDetail: '서울 강남구 역삼동' },  // tv_pick_up_point «@서울 강남구 @역삼동» 에서 «@»를 뗀 값 (IsflexAddress.clean)
        dropoff: { addressDetail: '서울 강남구 대치동' },  // tv_dest_point
        pickupDistance: 26.7,    // tv_pick_up_distance «26.7km»
        deliveryDistance: 2.3,   // tv_distance «약 2.3km»
    },
    money: {
        lines: [{ kind: 'income', won: 8500, label: '총 수입' }],  // tv_total_revenue «8,500원». 수수료 앞인지 뒤인지 모름
        paymentType: '착불',  // tv_cost_type. 상세에서 서버가 채운다
    },
    load: { vehicleType: '오토' },  // tv_delivery_type
    time: {},  // 이 콜은 예약이 없다
    job: { detailMemo: '1박스 3층 계단물건 있음' },  // tv_caution
};

/** 위 콜의 기록 — xml 의 리더 값을 차례대로 이은 것 */
const isflexEvidence: CallEvidence = {
    seen: [{ at: '읽은 시각', screen: 'newCall', read: 'text', rawText: "@역삼동 → 대치동\n출발지까지\n26.7km\n오토\n출발\n@서울 강남구 @역삼동\n약 2.3km\n도착\n서울 강남구 대치동\n적요상세\n1박스 3층 계단물건 있음\n착불\n총 수입\n8,500원\n닫기\n8,500원 \n수행하기" }],
};

/** 지금 OfficeOrder 칸이 가는 곳 — 칸이 빠지면 타입 검사가 잡는다 */
const officeOrderFieldMap: Record<keyof OfficeOrder, string> = {
    id: 'id (그대로)',
    type: 'CallReport.type',
    timestamp: 'CallReport.timestamp',
    rawText: 'CallReport.rawText (가장 늦은 상세) · CallEvidence.seen[].rawText (전부)',
    verdict: 'CallReport.verdict',
    isSimulated: 'CallReport.isSimulated',
    pickup: 'route.listRegion.pickup (목록 동 이름) · route.pickup.addressDetail (전체 주소)',
    dropoff: 'route.listRegion.dropoff (목록 동 이름) · route.dropoff.addressDetail (전체 주소)',
    pickupX: 'CallCoordinates (그대로)',
    pickupY: 'CallCoordinates (그대로)',
    dropoffX: 'CallCoordinates (그대로)',
    dropoffY: 'CallCoordinates (그대로)',
    pickupDistance: 'route.pickupDistance',
    deliveryDistance: 'route.deliveryDistance',
    fare: 'money.lines (total 또는 income) 🔴 정의 표 요금 줄이 종류를 정한다',
    vehicleType: 'load.vehicleType',
    itemSize: 'load.itemSize',
    tagsText: 'job.tagsText',
    postTime: 'time.postTime',
    scheduleText: 'time.pickup.text',
    reserved: 'time.pickup.reserved',
    reservedDay: 'time.pickup.day',
    reservedAt: 'time.pickup.at',
    dispatcherName: 'dispatcherName (그대로)',
    dispatcherPhone: 'dispatcherPhone (그대로)',
    receiptStatus: 'stage',
    itemDescription: 'load.itemDescription',
    commissionRate: 'money.lines (fee)',
    tollFare: 'money.lines (consign)',
    paymentType: 'money.paymentType',
    billingType: 'money.billingType',
    tripType: 'job.tripType',
    orderForm: 'job.orderForm',
    detailMemo: 'job.detailMemo',
    pickupDetails: 'route.pickup (배열 → 하나. 지금 읽는 곳은 [0] 뿐. 읽는 곳 없는 mileage · requestedTime 은 안 옮긴다)',
    dropoffDetails: 'route.dropoff (배열 → 하나. 읽는 곳 없는 mileage · requestedTime 은 안 옮긴다)',
    companyName: '갈 곳 없음 — 채우는 곳이 없다',
    pickupTime: '갈 곳 없음 — 시험 파서만 채운다',
    targetApp: 'targetApp (그대로)',
    capturedVia: '갈 곳 없음 — 원달앱이 안 보낸다',
    capturedMode: 'CallReport.capturedMode',
    openedBy: 'CallReport.openedBy',
};

const STAYS_OUTSIDE = '그대로 BaseCall 밖 — 서버 값';
/** 지금 ServerCallFields 칸이 가는 곳 — 전부 서버가 만든 값이라 그대로 둔다. isPreview 는 확정 때 지우는 결재 상태다(dispatchEngine.ts:539) */
const serverFieldMap: Record<keyof ServerCallFields, string> = {
    capturedDeviceId: STAYS_OUTSIDE, capturedAt: STAYS_OUTSIDE, goalCity: STAYS_OUTSIDE, isPreview: STAYS_OUTSIDE,
    kakaoCalculatedFare: STAYS_OUTSIDE, kakaoTimeExt: STAYS_OUTSIDE, routePolyline: STAYS_OUTSIDE,
    totalDistanceKm: STAYS_OUTSIDE, totalDurationMin: STAYS_OUTSIDE, kakaoSoloDistanceKm: STAYS_OUTSIDE,
    kakaoSoloDurationMin: STAYS_OUTSIDE, approachDurationMin: STAYS_OUTSIDE, osrmError: STAYS_OUTSIDE,
    sectionEtas: STAYS_OUTSIDE, sectionDriveMin: STAYS_OUTSIDE, sectionStops: STAYS_OUTSIDE, sectionEnds: STAYS_OUTSIDE,
    routeComputedAt: STAYS_OUTSIDE, arrivedPickupAt: STAYS_OUTSIDE, arrivedDropoffAt: STAYS_OUTSIDE,
    pickupEta: STAYS_OUTSIDE, dropoffEta: STAYS_OUTSIDE, rejectionReasons: STAYS_OUTSIDE, approvalReasons: STAYS_OUTSIDE,
    distanceKm: STAYS_OUTSIDE, isShared: STAYS_OUTSIDE, isExpress: STAYS_OUTSIDE,
};

describe('🎯 기본 콜 타입', () => {
    it.each<[string, BaseCall, CallEvidence]>([
        ['insung', insungExample, insungEvidence],
        ['kakaopicker', pickerExample, pickerEvidence],
        ['isflex', isflexExample, isflexEvidence],
    ])('%s 예는 상차 · 하차와 기록을 가진다', (network, call, evidence) => {
        expect(call.targetApp).toBe(network);
        expect(call.route.pickup.addressDetail).toBeTruthy();
        expect(call.route.dropoff.addressDetail).toBeTruthy();
        expect(evidence.seen.length).toBeGreaterThan(0);
    });
    it('지금 칸마다 갈 곳이 적혀 있다', () => {
        for (const goes of [...Object.values(officeOrderFieldMap), ...Object.values(serverFieldMap)]) expect(goes).toBeTruthy();
    });
});
