/**
 * ⚙️ **판정 기준 «설정»** — 기사님이 판정 기준 탭에서 고치는 값들이 사는 곳.
 *
 * 🔴 **색을 정하는 곳이 아니다** (2026-08-29 정정). 색은 `judge.ts` 가 기준 다섯
 *    (`criteria.ts`)을 모아서 낸다. 이 파일은 그 계산이 쓰는 **값**만 들고 있다.
 *    예전 머리말이 «색을 정하는 곳 — 여기 하나뿐이다» 라고 적혀 있었다.
 *
 * 기사님(2026-08-15): *"나는 KEEP 버튼의 내용보다는 **파란색, 녹색이면 너가 만든 코드를 믿고
 * 바로 잡을 거야**."* → 색이 곧 결정이다. 색을 틀리는 것이 이 시스템의 가장 큰 사고다 (규칙 ⑤-3).
 *
 * 🔴 **왜 `shared` 인가**: 서버가 색을 내고 관제웹이 같은 색을 설명한다. 두 곳이 각자 계산하면
 *    *"같은 콜, 다른 색"* 이 난다 — 실제로 그랬다. 2026-08-15 기준
 *      `OrderEvaluator`  똥 = 60분 이상 OR 30km 이상
 *      `recalculateKakaoRoute` 똥 = 30분 초과 OR 10km 초과   ← 자기 숫자를 갖고 있었다
 *    **같은 콜이 재탐색만 해도 색이 바뀌었다.**
 *
 * 🔴 **앱은 이 파일을 쓰지 않는다.** 앱은 색 판정을 하지 않고 `요금 ≥ 배송거리 × 단가` 만 본다
 *    (규칙 ⑤-1 — 돈은 앱이 이미 걸렀다. 서버가 다시 세지 않는다).
 *
 * 🔴 **카카오·DB·소켓을 모른다.** 값만 넣으면 색이 나오는 순수 함수라 **테스트가 값으로 증명**한다.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 판정 기준. **원천은 DB `user_judgment` 표다** — 로그인 때 세션에 실린다.
 * 이 상수는 기본값이자 폴백이다 (검사·초기화 전).
 * 칸 목록은 `JUDGMENT_FIELDS`, 왕복은 `judgmentFromRow`/`judgmentToRow` 가 맡는다.
 *
 * 기사님(2026-08-15): *"나중에 실지로 도로에 나가서 데이터를 모아서 쉽게 수정할 수 있도록
 * 사용자 설정 팝업에서 수정 가능하도록 하는 기능이 필요하겠다."* — 그래서 옮겼다.
 *
 * ⚠️ 예전 주석은 *"다음 단계에서 DB(`user_filters.judgment_config`)로 옮긴다"* 였다.
 *    **이미 옮겨졌고**, 게다가 그 칸 이름은 레포 어디에도 없다 (2026-08-29 정정)
 */
export interface JudgmentConfig {
    /**
     * 모르는 값을 채우는 **일반값** (규칙 ⑤-2).
     * 불리한 값이 아니다 — 모르면 나쁜 쪽으로 잡던 것이 꿀콜을 놓치게 했다.
     */
    /**
     * 🚚 **배송 주행을 모를 때 쓰는 속도** (기사님 확정 2026-08-26).
     *
     * 합짐으로 잡은 콜은 «혼자 갔을 때» 경로를 재지 않는다 — 재는 자리가 첫짐 분기
     * 안에만 있다. 그런데 **하차 약속이 `상차 완료 + 단독 배송주행 × 150%`** 로
     * 정의돼 있어, 값이 없으면 약속이 안 생기고 → 버퍼 축이 통째로 빠진다.
     * 2026-08-26 실측: 되돌아가는 37분이 점수를 하나도 못 깎고 🔵 가 나왔다.
     *
     * 앱이 이미 배송거리를 보내므로 **거리 ÷ 속도**로 채운다 (규칙 ⑤-2 — 일반값 +
     * «미확인» 표시). 통화로 신고하면 실측이 이긴다.
     *
     * 🔴 **속도가 하나가 아닌 이유** — 카카오 실측 45건:
     *    `0~3km 27.4 · 3~10km 24.9 · 10~25km 46.1 · 25km+ 56.0 km/h`
     *    짧으면 시내, 길면 국도라 두 배 넘게 벌어진다. 평균 하나로 환산하면
     *    짧은 콜을 두 배 빠르게, 긴 콜을 두 배 느리게 잰다.
     * ⚠️ 표본은 **접근 구간**(현위치→상차지)이다. 배송 구간 표본은 아직 1건뿐이라
     *    실주행이 쌓이면 다시 봐야 한다.
     */
    speed: {
        /** 10km 미만 — 시내. 실측 중앙값 24.9~27.4 */ shortKmh: number;
        /** 10~25km — 국도 섞임. 실측 46.1 */ midKmh: number;
        /** 25km 이상 — 고속·국도. 실측 56.0 */ longKmh: number;
    };
    unknown: {
        /** 상차 방법 미확인 — 찾기 + 상차 + **결박** */ pickupDwellMin: number;
        /** 하차 방법 미확인 — 찾기 + 하차 */ dropoffDwellMin: number;
        /**
         * ⏱️ **상차 시계 잠정** (두 시계 · 시간체계 ⑯ · 2026-08-21).
         *    잡은 시각 + 이만큼 = 무통보로 봐주는 상차 한계 (주선사의 시계).
         *    적요의 상차 시각 > 통화 약속 > 이 잠정값 순으로 대체된다.
         *    근거: 소숙 실측 — 35분부터 "늦음" 취급, 전부 통화로 방어 (§16-2 ④).
         *    ~~여유30 · 휴게30 · +60 완료 규칙~~ 은 이 값으로 대체되어 폐기됐다.
         */
        pickupOffsetMin: number;
    };
    /**
     * 요소별 가중치. **상대값**이다 — 3 과 1 은 "3배 중요"라는 뜻이고 합이 10 일 필요는 없다.
     * `0` 이면 그 요소를 **색에 반영하지 않는다** (표시는 계속한다).
     *
     * 기사님(2026-08-15): *"아직 나도 어떻게 가중치를 주어야 할지 잘 모르겠어 그래서 모두 1을
     * 준 상태이다. 나중에 실지로 도로에 나가서 데이터를 모아서…"* → 전부 1 = 단순 평균.
     */
    weights: {
        /** 우회 시급 — 요금 ÷ 한계 추가 소요 (기사님 확정 ②: 시간·거리 통합) */
        revenueDetour: number;
        /** 버퍼 소비 — 붙인 뒤 남는 최소 버퍼 */
        bufferCost: number;
        slots: number;
        /**
         * 🔒 **기존 콜 약속 보존** — 이 콜을 붙이면 이미 잡은 콜의 약속이 깨지는가.
         *    예전에는 «문지기»라 점수와 무관하게 색을 «사고»로 덮었고, **끌 수가 없었다.**
         *    경로만 보려는 검사에서도 끼어들어 색이 덮였다 (2026-08-29 실측: 57점인데 사고).
         *    → 가중치를 주되 **0 이 아니면 실패 시 색을 덮는 것은 그대로다** (안전은 안 뺀다).
         */
        promiseGuard: number;
        /** 🧪 **같이 못 실음** — 함께 실으면 안 되는 성질인가 (적재는 «공간», 이것은 «성질») */
        cargoCompat: number;
        /**
         * 🧭 **지리** — 가는 길 위에 있나. **기본 0 (안 봄)** — 기사님과 확정 2026-08-29.
         *
         * 합짐의 지리는 「돈」(우회 시급)이 이미 세고, 첫짐의 지리는 앱이 집기 전에
         * `progressKm` 로 이미 걸렀다. 여기서 또 깎으면 **같은 사실을 두 번 세는 것**이고
         * 잡을 수 있었던 콜을 놓친다 (규칙 ① · ⑤-1).
         *
         * 🔴 다만 「돈」이 못 보는 것이 있다 — 역주행은 시간이 같아도 **다음 콜 기회**를
         *    죽인다. 그걸 잴 값이 생기면 여기서 켠다. 자리와 이름은 **화면에 보인다.**
         */
        geography: number;
    };
    /** 채점의 기준 시급 — 우회 시급·시급 축이 이 값 대비 %로 점수가 된다 */
    target: {
        /** 원/시간. 문제지 캘리브레이션으로 확정 (기사님 2026-08-21) */
        hourlyKrw: number;
    };
    /**
     * ⏱️ **배달 데드라인 배율** (두 시계 · 시간체계 ⑯ · 2026-08-21).
     *    데드라인 = **상차 완료 + 배송 주행 × (ratioPct/100)** — 기산점은 상차 완료다.
     *    (~~잡은 시각 기산 + 픽업 20분 보정~~ 은 소숙 검증으로 기각 — §16-2)
     *    법이 아니라 관행 — 통화로 합의하면 데드라인이 미뤄진다(당겨질 수도).
     */
    deadline: { ratioPct: number };
    /** 총점이 몇 점 이상이면 무슨 색인가 */
    color: { honeyMin: number; normalMin: number };
    /**
     * ⏰ **여유 곡선** — 「약속」 기준이 여유(분)를 점수로 바꾸는 모양 (2026-08-29 화면으로 올림).
     *
     * ```
     * 여유 ≥ fullMin        →  100점
     * 여유 0분              →  zeroScore 점
     * 그 사이               →  직선
     * 여유 음수             →  0점
     * ```
     * 🔴 이 둘이 **「약속」 기준 전체**를 정한다. `fullMin` 을 낮추면 빠듯한 합짐도
     *    만점을 받고(공격적), `zeroScore` 를 낮추면 여유 0분짜리가 확 깎인다(보수적).
     */
    slack: { fullMin: number; zeroScore: number };
    /**
     * 📦 **박스 하나에 걸리는 시간(분)** — 정차 시간이 여기서 나오고,
     *    그게 「돈」 기준의 분모가 된다 (2026-08-29 화면으로 올림).
     *
     * 🔴 이 값이 틀리면 우회 시급이 통째로 틀린다 — 2026-08-29 #60(차종을 안 봐서
     *    정차가 전부 25분이던 것)과 **같은 자리**다.
     */
    dwellPerBox: { forkliftMin: number; manualMin: number };
    /**
     * 🧹 **검수 후작업(분)** — 통화 시트에서 「검수」를 누르면 하차에 붙는 시간.
     *
     * 🔴 **여섯 중 이게 제일 세다.** 다른 값은 몇 점씩 움직이는데 이건 **혼자 색을 뒤집는다** —
     *    60분이 여유를 먹고, 여유가 「약속」 점수를 정하고, 그게 색이 된다.
     */
    afterwork: { inspectMin: number };
}

export const DEFAULT_JUDGMENT: JudgmentConfig = {
    // 🧪 판정색 확정안 v2 (기사님 확정 2026-08-21) — 절대치 문턱(merge 4칸) 폐기,
    //    가중치 통합(revenueDetour), 목표 시급은 문제지 캘리브레이션으로 확정(3.0만).
    unknown: { pickupDwellMin: 15, dropoffDwellMin: 10, pickupOffsetMin: 30 },
    speed: { shortKmh: 25, midKmh: 46, longKmh: 56 },
    weights: { revenueDetour: 1, bufferCost: 1, slots: 1, promiseGuard: 1, cargoCompat: 1, geography: 0 },
    target: { hourlyKrw: 30_000 },
    deadline: { ratioPct: 150 },
    color: { honeyMin: 70, normalMin: 40 },
    // 🔴 아래 셋은 **코드에 박혀 있던 값을 그대로** 올린 것이다 (2026-08-29).
    //    값은 하나도 안 바꿨다 — 구조만 옮겼다. 같이 움직이면 «구조 때문인지 값
    //    때문인지» 못 가린다.
    slack: { fullMin: 30, zeroScore: 40 },
    dwellPerBox: { forkliftMin: 0.05, manualMin: 1 / 3 },
    afterwork: { inspectMin: 60 },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 표 — **DB 컬럼 · 화면 폼 · 기본값이 전부 여기서 나온다**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **값이 하나 늘면 이 표에 한 줄만 더한다.**
 *    DB 컬럼도, 관제웹 폼도, 기본값도 전부 이걸 읽는다 — 화면 코드와 서버 판정 코드는 안 고친다.
 *    (`PHASE_FIELDS` 가 이미 같은 패턴이다 — 표가 화면을 그린다)
 *
 * 기사님(2026-08-16): *"수정할 때마다 문서를 읽어야 할 건데.. **문서가 항상 최종본이 아닐 수
 * 있고**."* → 그래서 역할을 갈랐다:
 *      DB        지금 값이 얼마인가        ← 진실
 *      이 표      라벨 · 단위 · 범위 · **근거**  ← 관제웹 폼이 칸마다 띄운다
 *      docs      왜 그렇게 정했나 (경위)    ← 값은 안 적는다
 */
export interface JudgmentField {
    /** DB 컬럼 이름 = 폼의 키 */ col: string;
    /** `JudgmentConfig` 안의 자리 */ path: [keyof JudgmentConfig, string];
    group: '합짐' | '첫짐' | '모를 때' | '가중치' | '색 경계' | '데드라인' | '정차·여유';
    label: string;
    unit: string;
    min: number;
    max: number;
    /** SQLite 타입 — 정수인가 실수인가 */ int: boolean;
    /** 왜 이 값인가. **폼의 칸 아래 그대로 뜬다** */ why: string;
}

export const JUDGMENT_FIELDS: readonly JudgmentField[] = [
    // 🧪 합짐 절대치 문턱 4칸(merge_honey_max_* 등)은 **딱지로 강등되어 삭제됐다**
    //    (판정색 확정안 v2 · 기사님 확정 2026-08-21). 우회의 절대 크기는 감점이 아니라
    //    사실 표시("우회 +43분")로만 남는다 — 노하우 4콜 낙제의 원인이던 상수들이다.
    { col: 'unknown_pickup_dwell_minutes', path: ['unknown', 'pickupDwellMin'], group: '모를 때',
      label: '상차 미확인', unit: '분', min: 0, max: 120, int: true,
      why: '찾기 + 상차 + 결박 (기사님 2026-08-15)' },
    { col: 'unknown_dropoff_dwell_minutes', path: ['unknown', 'dropoffDwellMin'], group: '모를 때',
      label: '하차 미확인', unit: '분', min: 0, max: 120, int: true,
      why: '찾기 + 하차 — 결박이 없어 상차보다 짧다' },
    /**
     * 🔴 `마감 미확인 여유 90분` 을 **두 규칙으로 갈랐다** (기사님 2026-08-16).
     *    *"여유"* 는 입력값이 아니라 **마감에서 계산해 나오는 값**이다 — 상수로 두면 안 된다.
     *    상차지 여유(콜 대기)와 하차지 여유(배송)는 성격이 달라 하나로 퉁칠 수도 없다.
     */
    { col: 'unknown_pickup_offset_minutes', path: ['unknown', 'pickupOffsetMin'], group: '데드라인',
      label: '상차 시계 잠정', unit: '분', min: 0, max: 240, int: true,
      why: '잡은 시각 + 이만큼 = 무통보로 봐주는 상차 한계. 소숙 실측: 35분부터 늦음 취급 (잠정 — 도로에서 조정)' },

    // 🧪 옛 가중치 둘(추가 주행 · 우회 거리)은 **우회 시급 하나로 통합**됐다
    //    (기사님 확정 ② — 같은 40분 우회라도 요금이 가른다)
    { col: 'speed_short_kmh', path: ['speed', 'shortKmh'], group: '모를 때',
      label: '배송 속도 (10km 미만)', unit: 'km/h', min: 5, max: 120, int: true,
      why: '카카오 실측 중앙값 24.9~27.4 — 시내 구간' },
    { col: 'speed_mid_kmh', path: ['speed', 'midKmh'], group: '모를 때',
      label: '배송 속도 (10~25km)', unit: 'km/h', min: 5, max: 120, int: true,
      why: '카카오 실측 중앙값 46.1 — 국도가 섞인다' },
    { col: 'speed_long_kmh', path: ['speed', 'longKmh'], group: '모를 때',
      label: '배송 속도 (25km 이상)', unit: 'km/h', min: 5, max: 120, int: true,
      why: '카카오 실측 중앙값 56.0 — 고속·국도' },

    { col: 'weight_revenue_detour', path: ['weights', 'revenueDetour'], group: '가중치',
      label: '우회 시급', unit: '배', min: 0, max: 10, int: false,
      why: '요금 ÷ 한계 추가 소요. 0 이면 색에 반영하지 않는다 (표시는 계속한다)' },
    { col: 'weight_buffer_cost', path: ['weights', 'bufferCost'], group: '가중치',
      label: '버퍼 소비', unit: '배', min: 0, max: 10, int: false,
      why: '붙인 뒤 남는 최소 버퍼 — 통화로 약속이 굳은 운행에서 살아나는 축' },
    { col: 'weight_slots', path: ['weights', 'slots'], group: '가중치',
      label: '적재 용량', unit: '배', min: 0, max: 10, int: false,
      why: '**공간** — 몇 칸 남았나. 아래 «같이 못 실음»(성질)과 다른 축이다' },
    { col: 'weight_promise_guard', path: ['weights', 'promiseGuard'], group: '가중치',
      label: '기존 콜 약속 보존', unit: '배', min: 0, max: 10, int: false,
      why: '이미 잡은 콜의 약속이 깨지는가. 0 이면 **검사 자체를 끈다** — 경로만 보려는 검사에서 쓴다. 0 이 아니면 깨질 때 색이 «사고» 로 덮인다 (안전)' },
    { col: 'weight_cargo_compat', path: ['weights', 'cargoCompat'], group: '가중치',
      label: '같이 못 실음', unit: '배', min: 0, max: 10, int: false,
      why: '함께 실어도 되는 **성질**인가 (위험물+식료품 등). 적재(공간)와 다르다. 0 이면 검사를 끈다' },
    { col: 'weight_geography', path: ['weights', 'geography'], group: '가중치',
      label: '지리', unit: '배', min: 0, max: 10, int: false,
      why: '가는 길 위에 있나. **기본 0 (안 봄)** — 합짐의 지리는 우회 시급이, 첫짐의 지리는 앱 필터가 이미 본다. 같은 사실을 두 번 세지 않으려고 꺼 뒀다 (2026-08-29 확정). 역주행이 «다음 콜 기회»를 죽이는 것을 잴 값이 생기면 켠다' },
    { col: 'slack_full_min', path: ['slack', 'fullMin'], group: '정차·여유',
      label: '여유 만점 기준', unit: '분', min: 5, max: 120, int: true,
      why: '남는 여유가 이만큼이면 「약속」 기준이 만점. 낮추면 빠듯한 합짐도 만점을 받는다(공격적). 2026-08-29 까지 코드에 박혀 있던 30분을 그대로 올린 것' },
    { col: 'slack_zero_score', path: ['slack', 'zeroScore'], group: '정차·여유',
      label: '여유 0분일 때 점수', unit: '점', min: 0, max: 100, int: true,
      why: '여유가 딱 0분일 때 「약속」이 받는 점수. 낮추면 빠듯한 콜이 확 깎인다(보수적). 옛 상수 40점' },
    { col: 'dwell_forklift_min', path: ['dwellPerBox', 'forkliftMin'], group: '정차·여유',
      label: '지게차 — 박스당', unit: '분', min: 0.01, max: 5, int: false,
      why: '박스 하나를 지게차로 옮기는 시간. 정차 시간이 여기서 나오고 그게 「돈」의 분모가 된다. 옛 상수 0.05분(3초)' },
    { col: 'dwell_manual_min', path: ['dwellPerBox', 'manualMin'], group: '정차·여유',
      label: '수작업 — 박스당', unit: '분', min: 0.01, max: 5, int: false,
      why: '박스 하나를 손으로 옮기는 시간. 옛 상수 0.333분(20초). 다마스 30박스면 10분이 붙는다' },
    { col: 'afterwork_inspect_min', path: ['afterwork', 'inspectMin'], group: '정차·여유',
      label: '검수 후작업', unit: '분', min: 0, max: 240, int: true,
      why: '통화 시트에서 「검수」를 누르면 하차에 붙는 시간. 🔴 이 값 하나가 색을 뒤집을 수 있다 — 여유를 먹고, 여유가 「약속」 점수를 정한다. 기사님 확정 60분 (2026-08-19)' },
    { col: 'target_hourly_krw', path: ['target', 'hourlyKrw'], group: '가중치',
      label: '목표 시급', unit: '원/h', min: 10000, max: 100000, int: true,
      why: '우회 시급·시급 축의 기준. 노하우 실측 역산(4콜 14.1만÷4.5h≈3.1만) — 문제지 캘리브레이션으로 확정 (2026-08-21)' },

    { col: 'deadline_ratio_pct', path: ['deadline', 'ratioPct'], group: '데드라인',
      label: '데드라인 배율', unit: '%', min: 100, max: 300, int: true,
      why: '배송 주행 × 이 배율이 업계가 보는 상한 — 내비 시간의 150% (교육 영상 · 2026-08-20 정리)' },
    { col: 'color_honey_min', path: ['color', 'honeyMin'], group: '색 경계',
      label: '🔵 꿀', unit: '점 이상', min: 0, max: 100, int: true,
      why: '총점이 이 점수 이상이면 파란색' },
    { col: 'color_normal_min', path: ['color', 'normalMin'], group: '색 경계',
      label: '🟢 보통', unit: '점 이상', min: 0, max: 100, int: true,
      why: '그 미만은 🟡 — 파란색·녹색이면 기사님이 바로 잡으신다' },
] as const;

/** 표의 기본값을 DB 컬럼 이름으로 뽑는다 (`CREATE TABLE` 의 `DEFAULT` 와 시드가 이걸 쓴다) */
/**
 * ⏱️ **배달 데드라인 (ms)** — 기산점은 **상차 완료**다 (두 시계 · 시간체계 ⑯).
 * 배송 주행을 모르면 `null` (지어내지 않는다 · 규칙 ④).
 * 쓰는 곳: 시딩의 하차 추정 약속 · 격자의 ⚠️ · (예정) 합짐 버퍼 판정의 기본 제약.
 */
export function callDeadlineMs(
    loadedMs: number, soloDriveMin: number | null | undefined, cfg: JudgmentConfig,
): number | null {
    if (soloDriveMin == null || !Number.isFinite(soloDriveMin) || soloDriveMin <= 0) return null;
    return loadedMs + (soloDriveMin * cfg.deadline.ratioPct / 100) * 60_000;
}

export function judgmentDefaults(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const f of JUDGMENT_FIELDS) {
        out[f.col] = (DEFAULT_JUDGMENT[f.path[0]] as any)[f.path[1]];
    }
    return out;
}

/** DB 한 줄 → `JudgmentConfig`. 값이 없거나 이상하면 **기본값으로 메운다** */
export function judgmentFromRow(row: Record<string, any> | undefined | null): JudgmentConfig {
    const cfg: JudgmentConfig = JSON.parse(JSON.stringify(DEFAULT_JUDGMENT));
    if (!row) return cfg;
    for (const f of JUDGMENT_FIELDS) {
        const v = Number(row[f.col]);
        if (!Number.isFinite(v)) continue;
        (cfg[f.path[0]] as any)[f.path[1]] = Math.min(f.max, Math.max(f.min, v));
    }
    return cfg;
}

/** `JudgmentConfig` → DB 한 줄 */
export function judgmentToRow(cfg: JudgmentConfig): Record<string, number> {
    const out: Record<string, number> = {};
    for (const f of JUDGMENT_FIELDS) {
        const v = Number((cfg[f.path[0]] as any)[f.path[1]]);
        out[f.col] = Math.min(f.max, Math.max(f.min, Number.isFinite(v) ? v : 0));
    }
    return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 점수 — 🧪 **채점은 `judge.ts` 하나다** (2026-08-29 갈아탐 · 옛 `scoreDryRun` 은 철거)
//
// 옛 채점기(scoreSolo·scoreMerge·describeJudgment·rampDown)는 여기 살았다.
// 노하우 4콜 문제지 낙제(요율 재계산 · 절대치 감점)의 자리라 캘리브레이션 통과 후 철거.
// 색 이름 '꿀/보통/똥/사고' 와 경계(color.honeyMin/normalMin)는 그대로다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 콜을 부르는 이름 — **조합해서 만든다**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **콜 이름은 여기서만 만든다** (기사님 확정 2026-08-16).
 *
 * ```
 * 타겟명  +  첫짐(생략) / 합짐N  +  (후보)  +  콜
 * ```
 * | 타겟 | 첫짐 | 첫 합짐 | 두 번째 합짐 |
 * |---|---|---|---|
 * | 노선 | `노선콜` | `노선합짐1콜` | `노선합짐2콜` |
 * | 관내 | `관내콜` | `관내합짐1콜` | `관내합짐2콜` |
 * | 복귀 | `복귀콜` | `복귀합짐1콜` | `복귀합짐2콜` |
 *
 * 심사 전(안전취소에서 결재 안 난 콜)은 `후보` 를 넣는다 — `노선 합짐1 후보콜`.
 *
 * 🔴 **`본콜` 은 폐기했다.** 한 단어가 세 뜻으로 쓰이고 있었다 —
 *    `routeComposer` 는 *잡아 둔 첫 콜*, `kakaoService` 는 *첫짐*, 그리고
 *    `OrderEvaluator` 의 `본콜 좌표 누락` 은 실제로 **후보콜**이었다.
 *    그래서 기사님이 *"내가 KEEP 한 첫 콜에 문제가 있나?"* 로 잘못 읽으셨다 (2026-08-16).
 */
const TARGET_LABEL: Record<string, string> = { DEST: '노선', LOCAL: '관내', HOME: '복귀' };

export function callName(opts: {
    /** `callTarget` — 모르면 타겟명을 빼고 부른다 (지어내지 않는다) */
    target?: string | null;
    /** `getActiveCalls()` 순서. `0` = 첫짐 · `1` = 합짐1 · `2` = 합짐2 */
    index: number;
    /** 아직 결재가 안 난 콜인가 */
    candidate?: boolean;
}): string {
    const target = opts.target ? (TARGET_LABEL[opts.target] ?? '') : '';
    const slot = opts.index <= 0 ? '' : `합짐${opts.index}`;
    if (!opts.candidate) return `${target}${slot}콜` || '콜';
    // 후보는 띄어 쓴다 — `노선 합짐1 후보콜`
    return [target, slot, '후보콜'].filter(Boolean).join(' ');
}
