import { Router } from "express";
import db from "../db";
import { getAllActiveUserIds, getUserSession } from "../state/userSessionStore";
import { isLiveServer, PROBE_EMAIL } from "../config/env";
import { originOf } from "../services/geoService";
import { getActiveCalls } from "../core/helpers";
import { mapCoverage } from "../services/geoService";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { effectiveRadii } from "@onedal/shared";
import { getUserDevicesSnapshot } from "./devices";
import { phoneCheckOf, sentFilterVersionOf } from "../core/phoneCheck";
import { BOOTED_AT } from "./health";
import { calculateSoloRoute } from "../services/kakaoService";
import { createSimCallQueue, pushSimCall, readSimCallInput, resetSimCalls, simCallsAfter, withdrawSimCall } from "../core/simCallQueue";
import { seqsToWithdraw, startScenario, stepScenario, skipScenarioRow } from "../core/simScenario";
import type { ScenarioState, ScenarioWorld, WorldOrder, WorldIntel, ScenarioRow } from "../core/simScenario";
import { ICHEON_ROUND_TRIP, ICHEON_FIVE_OK } from "../core/simScenarioIcheon";
import { GANGNAM_FIVE_OK } from "../core/simScenarioGangnam";

const router = Router();

/**
 * 🧪 **배차망 시뮬레이터 전용 문** (기사님 확정 2026-08-31).
 *
 * 시뮬(`onedal-sim` · :5173)이 콜을 출제할 때 **«현위치 → 상차지» 거리**를 화면에 적는데,
 * 그 현위치가 **URL 로 한 번 고른 뒤 움직이지 않는 고정 좌표**였다. 기사님은 달리는데
 * 숫자는 그대로라, 상차 반경 축이 **실제 지리와 무관한 값으로 채점**됐다 —
 * 실측(0831): 적요는 «7.2km»인데 실제는 11.4km 였고, 22.4km 뒤 상차지가 통과했다.
 *
 * 실제 인성은 배차망 서버가 그 거리를 **매번 계산해서** 화면에 띄운다. 시뮬도 같아야
 * 책상 판의 채점이 진짜가 된다 — 그래서 여기서 «지금 어디»를 내준다.
 *
 * 🔴 **개발 빌드에서만 열린다.** 기사님의 실시간 위치는 노출하면 안 되는 값이다
 *    (2026-08-09 에 무인증 `GET /api/scrap` 을 «정찰 정보 노출»로 지운 것과 같은 이유).
 *    운영에서는 404 — 시뮬레이터가 없는 곳에는 이 문도 없다.
 *
 * 🔴 **«라이브인가»를 혼자 판정하지 않는다** (0831 리뷰에서 잡힘).
 *    레포에는 이미 `isLiveServer()` 가 있고 그 주석이 이 함정을 적어 뒀다 —
 *    *"신호를 둘 본다… 한쪽만 보면 그 설정이 빠진 날 조용히 열린다."*
 *    처음엔 `NODE_ENV` 하나만 봤는데, PM2 설정에서 그게 빠지면 **기사님 실시간 좌표가
 *    무인증으로 열린다.** 2026-08-09 에 «정찰 정보 노출»로 지운 자리보다 민감한 값이다.
 */
const isDevBuild = () => !isLiveServer();

/**
 * 👤 **«사람» 세션만 센다** (2026-09-12).
 *
 * 아래 두 문은 *"로컬 판은 기사님 한 분이다 — 세션이 여럿이면 **고르지 않는다**"* 로
 * 지켜진다. 그 규칙의 뜻은 «둘이면 위험»이 아니라 **«누구 것인지 모르면 안 준다»** 다.
 *
 * 🔴 그런데 **실측 계정이 붙는 순간 세션이 둘이 되어** 시뮬레이터가 «세션이 여럿입니다»만
 *    받는다 — **내 도구가 남의 영역을 멈춘다.** 실측 계정은 사람이 아니므로 셈에서 뺀다.
 *    규칙을 약하게 만드는 것이 아니다: **사람이 둘이면 여전히 안 준다.**
 */
const humanUserIds = (): string[] => {
    const probe = db.prepare("SELECT id FROM users WHERE email = ?").get(PROBE_EMAIL) as { id: string } | undefined;
    return getAllActiveUserIds().filter(id => id !== probe?.id);
};

router.get("/driver-location", (_req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });

    /**
     * 로컬 판은 기사님 한 분이다 — 세션이 여럿이면 **고르지 않는다**(누구 위치인지 모르는
     * 값을 내주면 시뮬이 엉뚱한 거리로 출제한다 · 규칙 ④).
     */
    const userIds = humanUserIds();
    if (userIds.length !== 1) {
        return res.json({ ok: false, reason: userIds.length ? "세션이 여럿입니다" : "접속한 세션이 없습니다" });
    }
    const session = getUserSession(userIds[0]);
    /**
     * 📍 **화면이 보는 것은 «지금 기점»이다** — 서버가 경로를 그릴 때 쓰는 바로 그 값
     *    (2026-09-12 개편). 저장된 칸을 읽는 게 아니라 `originOf` 가 **지금 고른다**.
     *    그래야 «화면은 이천인데 서버는 집»이 생기지 않는다 (규칙 ③).
     */
    const loc = originOf(session);
    if (!loc) return res.json({ ok: false, reason: "현위치를 아직 모릅니다" });

    return res.json({
        ok: true,
        x: loc.x, y: loc.y,
        /** GPS 가 아니라 «내 주소»로 메운 값인가 — 시뮬이 화면에 그대로 밝힌다 */
        isFallback: loc.isFallback,
        at: session.lastFixAt ?? null,
        /**
         * 📍 **이 위치가 «어디서 왔나»** (2026-09-11 · 기사님 지시로 신설).
         *
         * 기사님: *"GPS 가 안 오는 건 PC 에서 테스트할 때 말고는 없는 상황이야.
         * 그럼 오른쪽에 내 위치 넣을 수 있게 할까?"*
         *
         * 🔴 **값은 한 칸(`lastFix`)이고 문만 셋이다** — 읽는 쪽은 늘 그 한 칸만 본다.
         *    갈라지는 것을 막는 것은 **«어디서 왔는지 화면이 말하는 것»**이다 (규칙 ⑤-2).
         *    지금까지는 «집 주소로 대신»이 **로그에만** 찍혀서, 기사님이 *"내 위치가
         *    대전으로 박혀있나봐"* 하고 한참 헤매셨다 (2026-09-11).
         *
         *   `gps`    폰이 보낸 진짜 위치
         *   `mock`   **시뮬레이터 모의 주행**
         *   `manual` 사람이 현황판에서 **손으로 찍은** 위치
         *   `home`   아무것도 없어 **설정의 집 주소로 대신**한 것
         *
         * 🔴 **여기서 다시 판단하지 않는다** (2026-09-12 · 현황판 담당 요청 ①).
         *    예전엔 `lastFixIsMock ? 'manual' : 'gps'` 로 **파생**했는데,
         *    그 플래그는 «지어낸 좌표인가»를 답하는 칸이라 **시뮬레이터로 달리는 중에도
         *    화면이 «손으로 찍음»이라고 말했다.** 한 칸이 두 사실을 답한 것이다 (규칙 ⑤-4 ⑤).
         *    이제 `lastFixSource` 가 **온 그대로** 들고 있고 여기는 그것을 옮긴다 (규칙 ③).
         * ⚠️ «집 주소로 대신»은 여전히 먼저다 — **좌표가 없다는 사실**이 출처보다 앞선다.
         */
        source: loc.source,
    });
});

/**
 * 📋 **올라온 콜을 그대로 읽는 문** (2026-09-12 · 현황판 담당 요청 ③).
 *
 * 담당: *"데이터는 이미 `intel` 에 다 있습니다. 제 화면은 이 규격을 기다리는 상태라
 * 서버가 채우면 제 쪽 수정 없이 바로 뜹니다."*
 *
 * 담당이 판단을 구한 둘에 이렇게 답했다:
 *
 * 🔴 **`type` 이 전부 `INTEL_BULK` 라 «잡은 콜»과 «버린 콜»이 안 갈린다** —
 *    1단계는 **«올라온 콜 전부»** 로 간다. 사유별 구분은 **앱이 «왜 버렸나»를 함께
 *    보내야** 성립하는 별건이다. 서버가 지금 있는 값으로 지어내면 **틀린 사유가
 *    화면에 뜬다** (규칙 ④ — 없는 것을 지어내지 않는다).
 *
 * 🔴 **주소가 `normalizeAddress` 를 거친 짧은 이름이다** (`분당구` → `구미동`) —
 *    **그대로 낸다.** 여기서 되돌리면 원장(`intel`)과 화면이 다른 말을 한다 (규칙 ③).
 *
 * 🔴 **라이브에서는 404 다.** 기사님께 올라온 콜 목록이 통째로 나가는 문이라
 *    `/driver-location`·`/preflight` 와 **같은 문지기**를 쓴다.
 * ⚠️ 지금 41행이지만 **4만 행이 될 날이 온다** — `limit` 에 상한을 건다.
 */
router.get("/intel", (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });

    /* 상한 200 · 기본 40 — 숫자가 아니면 기본으로 (지어내지 않고 되묻지도 않는다) */
    const asked = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Math.min(200, Math.max(1, Number.isFinite(asked) ? asked : 40));

    const rows = db.prepare(
        /**
         * 📋 **리스트 화면이 준 것을 그대로 낸다** (기사님 지시 2026-09-12).
         *    검산이 «못 잰 축»으로 적던 **차종·배송거리**가 여기서 나간다 —
         *    앱은 늘 보내고 있었고 서버 INSERT 가 버리던 것이다 (`db.ts` intel 주석).
         * 🔴 **망마다 다른 칸을 만들지 않는다** — 안 주는 망은 null 이고 `targetApp` 이 답한다.
         *    `scheduleText` 는 «급송·낼09시» 원문 그대로다. **여기서 해석하지 않는다** —
         *    무엇으로 나눌지는 실제로 오는 말을 세어 본 뒤 정한다 (규칙 ⑤-4 ②).
         */
        `SELECT id, type, pickup, dropoff, fare, timestamp, device_id, targetApp,
                itemSize, pickupDistanceKm, tagsText,
                vehicleType, deliveryDistanceKm, scheduleText, postTime, rawText,
                pickupX, pickupY, dropoffX, dropoffY, verdict
           FROM intel
          ORDER BY id DESC
          LIMIT ?`
    ).all(limit) as Array<Record<string, unknown>>;

    return res.json({
        ok: true,
        limit,
        /** 🔴 **«전부»가 아니라 «최근 N»이다** — 화면이 그렇게 말할 수 있게 총수를 함께 낸다 */
        total: (db.prepare("SELECT COUNT(*) as c FROM intel").get() as { c: number }).c,
        rows,
    });
});

/**
 * 🚚 **개별콜 — 현황판이 낸 콜을 들고 있다가 시뮬레이터에 넘긴다** (기사님 지시 2026-09-15 · `core/simCallQueue.ts` 머리)
 *
 * 🔴 **개발 빌드에서만 열린다** — 다른 sim 문들과 같은 문지기. 운영에는 시뮬레이터가 없다.
 * 🔴 **세션을 고르지 않는다** — 콜은 기사님 값이 아니라 시뮬레이터 화면에 뜰 가짜 콜이다. 누구의 것도 아니다.
 */
const simCalls = createSimCallQueue();

/** 📱 폰에 마지막으로 실어 보낸 회차 — 시나리오가 «폰이 기억을 비울 번호를 받았나»를 본다 */
let phoneRoundSent: number | null = null;

/**
 * 📱 **폰 «본 콜» 기억의 회차 — `/api/scrap` 응답 꼬리(`deviceControl.callMemoryRound`)에 싣는다** (`core/simCallQueue.ts` 머리).
 * 원달앱은 번호가 바뀐 것을 보면 `CallMemory` 를 비운다. 🔴 개발 빌드에서만 — 운영에는 시뮬레이터 회차가 없다.
 */
export function callMemoryRoundForPhone(): number | null {
    if (!isDevBuild()) return null;
    phoneRoundSent = simCalls.round;
    return simCalls.round;
}

router.post("/calls", (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    const read = readSimCallInput(req.body);
    if (!read.ok) return res.status(400).json({ ok: false, error: read.error });
    const now = Date.now();
    const queued = pushSimCall(simCalls, read.call, now);
    console.log(`🚚 [개별콜] #${queued.seq} 받음 — ${queued.pickup.region} → ${queued.dropoff.region} · ${queued.fare}`);
    return res.json({
        ok: true,
        seq: queued.seq,
        /** 시뮬레이터가 마지막으로 물은 뒤 몇 ms — 서버 시계로 잰다 (현황판 시계와 안 섞는다). 한 번도 안 물었으면 null */
        simPolledAgoMs: simCalls.lastPollAt === null ? null : now - simCalls.lastPollAt,
    });
});

router.get("/calls", (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    const raw = req.query.after;
    const after = raw === undefined ? null : Number(raw);
    if (after !== null && !(Number.isInteger(after) && after >= 0)) {
        return res.status(400).json({ ok: false, error: "after 는 0 이상의 정수다" });
    }
    return res.json({ ok: true, ...simCallsAfter(simCalls, after, Date.now()) });
});

/**
 * 🧪 **판 점검 — «지금 이 문제지를 채점할 수 있는 상태인가»** (기사님 지시 2026-09-06)
 *
 * 기사님: *"뭐가 우리 테스트에 가장 큰 문제야?"* → 그날 콜이 안 올라온 것이 **일곱 번**인데
 * **단 한 번도 «우리 시스템이 옳게 걸렀다»가 아니었다.** 전부 판이 오염돼 있었다 —
 * 문제지 이름이 안 맞아 랜덤이 흐르고, 현위치가 초월이라 상차가 118km 로 잡히고,
 * 재기동마다 도착 목표가 옛 값으로 돌아가고, 취소했는데 필터가 합짐 모드에 남았다.
 *
 * 🔴 **콜이 안 올라오면 둘 중 하나인데 구분할 방법이 없었다:**
 *      ㉮ 우리 시스템이 옳게 걸렀다 (채점 결과)
 *      ㉯ 판이 오염됐다             (잡음)
 *    매번 ㉯였고, 알아내는 데 판마다 20~30분이 갔다.
 *
 * 그래서 **문제지가 요구하는 상태와 지금 상태를 기계가 대조**하게 한다.
 * 옛 `pnpm preflight`(2026-09-14 에 지웠다)는 «비우기»였고 이건 «맞는가»다 — 둘은 다른 일이었다.
 *
 * 🔴 `/driver-location` 과 같은 문이다 — **개발 빌드에서만 열린다.**
 *    기사님의 현위치·필터가 나가는 값이라 운영에서는 404 다.
 */
router.get("/preflight", (_req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });

    const userIds = humanUserIds();
    if (userIds.length !== 1) {
        return res.json({ ok: false, reason: userIds.length ? "세션이 여럿입니다" : "접속한 세션이 없습니다" });
    }
    const userId = userIds[0];
    const session = getUserSession(userId);
    const f = session.activeFilter;
    const home = SettingsRepository.getHomeLocation(userId);

    return res.json({
        ok: true,
        bootedAt: BOOTED_AT.toISOString(),
        /** 도는 필터(메모리) — 설정(DB)이 아니다. 둘이 갈라지는 것이 오늘의 사고였다 */
        destinationCity: f?.destinationCity ?? null,
        destinationRadiusKm: f?.destinationRadiusKm ?? null,
        pickupRadiusKm: f?.pickupRadiusKm ?? null,
        /**
         * 📐 **폰에 실제로 가는 상차 반경** — 자동이면 줄어든 값 (`scrap.ts` 가 싣는 그 계산 · 2026-09-14).
         *    위 `pickupRadiusKm` 은 기사님이 정한 원값이다. 14:54 에 점검은 10km 로 봤는데 폰은 4.55km 로 걸렀다.
         */
        pickupRadiusKmEffective: effectiveRadii(f).pickupRadiusKm,
        radiusAuto: !!f?.radiusAuto,
        /**
         * 📱 **폰마다 «실제로 쓰는» 모드 · 필터 · 연락** (`core/phoneCheck` · 2026-09-14).
         *    14:41 에 폰이 옛 필터 · 직접 모드로 돌았는데 서버는 그 대답을 들고만 있었다.
         */
        phones: getUserDevicesSnapshot(userId).map(d => phoneCheckOf(d, sentFilterVersionOf(d.deviceId), Date.now())),
        /**
         * 🔔 알람 요금 하한 (DB `user_settings.picker_alarm_min_fare`) — 앱이 피기백 `pickerAlarmMinFare` 로 받는 값과 같은 원천(`routes/scrap.ts`).
         * 시뮬레이터 픽커 문제지 1·2 가 이 경계(9,900 / 10,000)를 시험한다 (카카오픽커_시뮬레이터.md §9-3 · 3단계 3-2).
         * ⚠️ 이름에 배차망을 안 넣는다 — 시뮬레이터 설정 화면은 배차망 이름을 모른다 (`onedal-sim/tests/boundaries.test.ts` 규칙 ④).
         */
        alarmMinFare: (db.prepare("SELECT picker_alarm_min_fare FROM user_settings WHERE user_id = ?").get(userId) as { picker_alarm_min_fare?: number } | undefined)?.picker_alarm_min_fare ?? null,
        destinationDongCount: f?.destinationKeywords?.length ?? 0,
        isSharedMode: !!f?.isSharedMode,
        dispatchPhase: f?.dispatchPhase ?? null,
        activeCalls: getActiveCalls(session).length,
        /** 시뮬이 거리를 재는 기준 — 여기가 틀리면 상차 반경이 통째로 헛것이 된다 (파생: originOf) */
        lastFix: (() => { const o = originOf(session); return o ? { x: o.x, y: o.y, isFallback: o.isFallback } : null; })(),
        homeAddress: home?.address ?? null,
        /** 충청 확장이 실렸는가 — 1,968 이면 실렸고 1,239 면 옛 지도다 */
        map: mapCoverage(),
    });
});

/**
 * 🎬 **시나리오콜 — «이천 왕복 하루»를 서버가 사건순으로 낸다** (기사님 지시 2026-09-15 · 설계서 `docs/기획/문제지_이천왕복.md` §7).
 *
 * 기사님: *"시뮬레이터에 내기 버튼을 클릭하면 서버가 그냥 콜리스트를 … 순서대로 뿌리면 되는거 아냐?"* —
 * 현황판 [시작] 한 번이면 여기 1초 타이머가 «세상»(메모리 콜 · 폰 판정 `intel` · 도는 필터)을 읽어
 * `core/simScenario.stepScenario` 에 넘기고, 낼 콜은 **개별콜과 같은 대기열**(`simCalls`)에 넣는다 — 시뮬레이터는 «🚚 개별콜» 탭으로 켠다.
 *
 * 🔴 **여기서 판단하지 않는다** — 옮기기만 한다. 판단은 순수 함수 하나(검사 `tests/core/simScenario.test.ts`).
 * 🔴 **개발 빌드에서만** — 기사님 콜·필터를 읽는 문이다 (`/preflight` 와 같은 문지기 · 사람 세션 하나일 때만).
 * 🔴 **시뮬레이터가 안 물으면 시작을 안 받는다** (onedal-49 2026-09-15) — 시뮬레이터는 «처음 물은 뒤»에 들어온 콜만 받아서,
 *    켜기 전에 시작하면 첫 줄 콜이 사라진다. 현황판 개별콜 칸(`sentNoteOf`)과 같은 10초 기준.
 * ⚠️ **메모리에만 둔다** — 서버를 다시 띄우면 시나리오도 멈춘다 (타이머와 함께 사라진다).
 */
const SCENARIO_TICK_MS = 1000;
const SIM_POLL_FRESH_MS = 10_000;
/**
 * 🎬 **문제 목록 — 이름표로 고른다** (기사님 2026-09-15 · 2026-09-19 확장).
 *    현황판 카드마다 이름표를 들고 시작한다 · 한 번에 하나만 돈다 (새로 시작하면 돌던 것을 멈춘다).
 */
const SCENARIOS: Record<'icheonRound' | 'icheonFive' | 'gangnamFive', { name: string; rows: ScenarioRow[] }> = {
    icheonRound: { name: '이천 왕복 하루', rows: ICHEON_ROUND_TRIP },
    icheonFive: { name: '이천 성공하는 5콜', rows: ICHEON_FIVE_OK },
    gangnamFive: { name: '강남 진입과 광주 복귀 5콜', rows: GANGNAM_FIVE_OK },
};
type ScenarioKey = keyof typeof SCENARIOS;
/** 모르는 이름표는 «이천 왕복 하루» — 옛 현황판(이름표 없음)도 그대로 돈다 */
const scenarioKeyOf = (v: unknown): ScenarioKey => (typeof v === 'string' && v in SCENARIOS ? v as ScenarioKey : 'icheonRound');
/**
 * 🔴 `state` 가 null 이면 **폰이 새 회차를 받기를 기다린다** — 시작하면 이전 콜을 리셋하는데(`resetSimCalls`),
 *    폰이 기억을 비우기 전에 첫 콜이 뜨면 «⏭️ 이미 본 콜»로 삼킨다 (01:5x 실측 — 같은 A1 이 두 번째 시작에서 판정 0줄).
 *    폰의 다음 `/api/scrap` 응답이 새 회차를 싣는 순간 첫 줄을 낸다.
 */
let scenario: { key: ScenarioKey; userId: string; round: number; state: ScenarioState | null; timer: ReturnType<typeof setInterval> } | null = null;

/** «세상» — 판단에 쓰는 칸만 옮긴다. 메모리 콜은 확정 사본(myOrders)이 도착 시각을 들고 있어 그쪽이 이긴다 */
function scenarioWorld(userId: string, now: number): ScenarioWorld {
    const session = getUserSession(userId);
    const byId = new Map<string, WorldOrder>();
    const put = (o: any) => {
        if (!o?.id) return;
        byId.set(o.id, {
            id: o.id, status: o.status, pickup: o.pickup, dropoff: o.dropoff, fare: o.fare,
            pickupX: o.pickupX, pickupY: o.pickupY, dropoffX: o.dropoffX, dropoffY: o.dropoffY,
            arrivedPickupAt: o.arrivedPickupAt, arrivedDropoffAt: o.arrivedDropoffAt,
        });
    };
    for (const o of session.pendingOrdersData.values()) put(o);
    for (const o of session.myOrders) put(o);
    const intel = db.prepare(
        /* 🔴 폰 기록은 좌표가 비어 있다 — 동 이름·요금도 옮긴다 (버그 대장 #128) */
        `SELECT id, pickup, dropoff, fare, pickupX, pickupY, dropoffX, dropoffY, verdict FROM intel ORDER BY id DESC LIMIT 50`,
    ).all() as WorldIntel[];
    const f = session.activeFilter;
    return {
        now, orders: [...byId.values()], intel,
        filter: { dispatchPhase: f.dispatchPhase, goalCities: f.goalCities, callTarget: f.callTarget, destinationKeywords: f.destinationKeywords },
    };
}

function tickScenario() {
    if (!scenario) return;
    const scenarioDef = SCENARIOS[scenario.key].rows;
    const now = Date.now();
    if (!scenario.state) {
        if (phoneRoundSent !== scenario.round) return;
        scenario.state = startScenario(scenarioDef, now);
        console.log(`🎬 [시나리오] 폰이 회차 ${scenario.round} 을 받았다 — 첫 줄을 낸다`);
    }
    const before = scenario.state;
    const r = stepScenario(scenarioDef, before, scenarioWorld(scenario.userId, now));
    if (r.send) {
        const q = pushSimCall(simCalls, r.send, now);
        r.state.rows[r.state.index] = { ...r.state.rows[r.state.index], seq: q.seq };   // 🫳 줄 ↔ 콜 번호 — 줄이 끝나면 거둔다
        console.log(`🎬 [시나리오] ${scenarioDef[r.state.index].id} 냄 #${q.seq} — ${r.send.pickup.region} → ${r.send.dropoff.region} · ${r.send.fare} · ${r.send.vehicleType ?? ''}`);
    }
    /* 🫳 끝난 줄의 콜은 거둔다 — «다른 기사가 가져갔다» (필터가 바뀐 뒤 잡혀 다음 줄을 오염시키지 않게 · 일곱 번째 바퀴 B2 → C3) */
    for (const seq of seqsToWithdraw(r.state.rows, simCalls.withdrawn)) {
        withdrawSimCall(simCalls, seq);
        console.log(`🫳 [시나리오] #${seq} 거둠 — 채점이 끝난 줄의 콜`);
    }
    r.state.rows.forEach((row, i) => {
        const was = before.rows[i];
        if (row.mark !== was.mark || row.note !== was.note) console.log(`🎬 [시나리오] ${row.id} ${row.mark} — ${row.note}`);
    });
    scenario.state = r.state;
    if (r.state.finished) {
        clearInterval(scenario.timer);
        console.log(`🎬 [시나리오] 끝 — ${r.state.rows.map(x => `${x.id} ${x.mark}`).join(' · ')}`);
    }
}

function stopScenario() {
    if (scenario) clearInterval(scenario.timer);
    scenario = null;
}

router.get("/scenario", (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    const now = Date.now();
    const key = scenarioKeyOf(req.query.key);
    const scenarioDef = SCENARIOS[key].rows;
    /** 🎬 이 카드의 문제가 지금 도는 문제인가 — 아니면 줄을 «기다림»으로만 보여 준다 */
    const mine = scenario?.key === key;
    const userIds = humanUserIds();
    const session = userIds.length === 1 ? getUserSession(userIds[0]) : null;
    const f = session?.activeFilter;
    const simPolledAgoMs = simCalls.lastPollAt === null ? null : now - simCalls.lastPollAt;
    /** 시작 조건 — 틀려도 막지는 않는다(시뮬레이터 연결만 막는다) · 기사님이 정한다 */
    const precheck = [
        { what: '기사님 세션', ok: userIds.length === 1, got: userIds.length === 1 ? '하나' : `${userIds.length}개` },
        { what: '목적지', ok: f?.destinationCity === '이천시', got: f?.destinationCity ?? '(없음)' },
        { what: '복귀', ok: (f?.callTarget ?? 'DEST') !== 'HOME', got: f?.callTarget === 'HOME' ? '켬' : '끔' },
        { what: '콜', ok: !!session && getActiveCalls(session).length === 0, got: session ? `${getActiveCalls(session).length}건` : '—' },
        { what: '시뮬레이터 연결', ok: simPolledAgoMs !== null && simPolledAgoMs <= SIM_POLL_FRESH_MS,
          got: simPolledAgoMs === null ? '한 번도 안 물었다' : `${Math.round(simPolledAgoMs / 1000)}초 전` },
    ];
    const st = mine ? scenario?.state ?? null : null;
    return res.json({
        ok: true, key, name: SCENARIOS[key].name, running: mine && !st?.finished,
        /** 이전 콜을 리셋하고 폰이 새 회차를 받기를 기다리는 중 */
        waitingPhone: mine && !st,
        index: st?.index ?? null, finished: st?.finished ?? false, startedAt: st?.startedAt ?? null,
        precheck,
        rows: scenarioDef.map((d, i) => ({
            id: d.id, stage: d.stage, kind: d.kind, say: d.say, why: d.why, guess: !!d.guess, blockBy: d.blockBy ?? null,
            when: 'arrive' in d.when ? `${d.when.arrive} ${d.when.stop === 'pickup' ? '상차' : '하차'}지에 서면` : '앞 줄 뒤',
            /* 🏷️ 동 이름을 앞에 — 폰 콜 목록은 동만 보여 줘서 «이천터미널»만으로는 목록 줄과 짝이 안 맞는다 (기사님 2026-09-15) */
            call: d.call ? `${d.call.pickup.region} ${d.call.pickup.name} → ${d.call.dropoff.region} ${d.call.dropoff.name} · ${d.call.fare.toLocaleString()} · ${d.call.vehicleType}` : null,
            ...(st ? st.rows[i] : { mark: 'wait', note: '' }),
        })),
    });
});

router.post("/scenario/start", (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    const userIds = humanUserIds();
    if (userIds.length !== 1) return res.status(400).json({ ok: false, error: userIds.length ? "세션이 여럿입니다" : "접속한 세션이 없습니다" });
    const now = Date.now();
    if (simCalls.lastPollAt === null || now - simCalls.lastPollAt > SIM_POLL_FRESH_MS) {
        return res.status(409).json({ ok: false, error: "시뮬레이터가 10초 안에 안 물었다 — «🚚 개별콜» 탭으로 켜세요" });
    }
    stopScenario();
    /* 🧹 이전 콜 리셋 — 서버 대기열을 비우고 회차를 올린다. 시뮬레이터는 목록을, 폰은 본 콜 기억을 이 번호로 비운다 */
    const round = resetSimCalls(simCalls);
    const key = scenarioKeyOf(req.body?.key);
    scenario = { key, userId: userIds[0], round, state: null, timer: setInterval(tickScenario, SCENARIO_TICK_MS) };
    scenario.timer.unref?.();
    console.log(`🎬 [시나리오] 시작 — ${SCENARIOS[key].name} (${SCENARIOS[key].rows.length}줄) · 이전 콜 리셋 회차 ${round} · 폰이 받기를 기다린다`);
    tickScenario();
    return res.json({ ok: true });
});

router.post("/scenario/skip", (_req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    if (!scenario) return res.status(409).json({ ok: false, error: "시나리오가 안 돌고 있다" });
    if (!scenario.state) return res.status(409).json({ ok: false, error: "폰이 기억을 비우기를 기다리는 중이다 — 폰 화면이 한 번 바뀌면 시작한다" });
    const scenarioDef = SCENARIOS[scenario.key].rows;
    const id = scenarioDef[scenario.state.index]?.id;
    scenario.state = skipScenarioRow(scenarioDef, scenario.state, Date.now());
    console.log(`🎬 [시나리오] ${id} 건너뜀`);
    tickScenario();
    return res.json({ ok: true });
});

router.post("/scenario/stop", (_req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    stopScenario();
    console.log(`🎬 [시나리오] 멈춤`);
    return res.json({ ok: true });
});

export default router;

/**
 * 🗺️ **실험실 전용 — 정거장 점들을 실도로 곡선으로 잇는다** (기사님 2026-09-07).
 *
 * 지도 실험실(`/mockup/map`)이 콜을 확정해 경로가 다시 짜일 때 한 번 부른다.
 * 다리(연속 두 점)마다 카카오 길찾기 1회 — 구간별 폴리라인을 따로 돌려줘야
 * 실험실이 콜 색대로 구간을 칠할 수 있다. 무료 쿼터(일 1만)의 티끌이다.
 * 운영에서는 다른 sim 문들과 같이 404 다.
 */
router.post("/route", async (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    try {
        const points = req.body?.points as Array<{ x: number; y: number }> | undefined;
        const valid = Array.isArray(points) && points.length >= 2 && points.length <= 24
            && points.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y));
        if (!valid) return res.status(400).json({ error: "points 는 2~24개의 {x,y} 배열이어야 합니다" });
        // 옵션 축 — 노선에서 고른 것(우선순위·회피)을 콜 실측·확정 경로가 따라간다 (기사님 2026-09-08)
        const priority = ["RECOMMEND", "TIME", "DISTANCE"].includes(req.body?.priority) ? req.body.priority as string : "RECOMMEND";
        const avoid = ["motorway", "toll"].includes(req.body?.avoid) ? req.body.avoid as string : undefined;

        const legs: Array<Array<{ x: number; y: number }>> = [];
        /** 구간별 실측 — 콜 리스트 카드(거리·시간·톨비)가 읽는다 (기사님 2026-09-08) */
        // 🔴 못 잰 구간은 **null** 이다 — 0 도 직선 근사도 아니다 (규칙 ④). `/chain` 과 같은 규약
        const legInfo: Array<{ distKm: number | null; durMin: number | null; tollWon: number | null; failed?: boolean }> = [];
        let distance = 0, duration = 0;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            // 같은 자리 두 점(하차 즉시 그 자리 상차)은 카카오를 부르지 않는다
            if (Math.hypot((a.x - b.x) * 88.6, (a.y - b.y) * 110.574) < 0.05) {
                legs.push([a, b]); legInfo.push({ distKm: 0, durMin: 0, tollWon: 0 }); continue;
            }
            // 🔴 구간 하나의 실패(예: 103 도착지점 탐색불가 — 도로 없는 자리)가 **전체를 죽이면 안 된다**
            //    (2026-09-08 실측: 한 구간 103 에 전체가 502 → 멀쩡한 구간까지 직선 폴백 + 반복 재시도)
            try {
                const r = await calculateSoloRoute(a.x, a.y, b.x, b.y, null, priority, 1, false, avoid);
                legs.push(r.polyline && r.polyline.length >= 2 ? r.polyline : [a, b]);
                legInfo.push({
                    distKm: +(r.distance / 1000).toFixed(1),
                    durMin: Math.round(r.duration / 60),
                    tollWon: (r.raw as { fare?: { toll?: number } } | undefined)?.fare?.toll ?? null,
                });
                distance += r.distance; duration += r.duration;
            } catch (legErr) {
                /**
                 * 🔴 **못 쟀으면 «못 쟀다»고 한다 — 직선 km 를 지어내지 않는다** (규칙 ④ · 2026-09-09).
                 *
                 * 예전엔 직선거리를 넣고 `durMin: 0` 을 붙였다. **0분은 «즉시 도착»으로 읽힌다** —
                 * 그 값이 시급(요금 ÷ 분)에 들어가면 색이 통째로 틀린다. 같은 파일의 `/chain`
                 * 은 이미 `null` 로 두고 있었으니 **한 서버가 같은 질문에 두 답**을 하던 셈이다.
                 * 실물도 카카오가 실패하면 `kakaoSoloDurationMin` 을 null 로 남긴다.
                 */
                console.warn(`⚠️ [sim/route] 구간 ${i} 실측 실패 — 못 쟀다로 남긴다:`, String((legErr as Error)?.message ?? legErr));
                legs.push([]);
                legInfo.push({ distKm: null, durMin: null, tollWon: null, failed: true });
            }
        }
        return res.json({ legs, legInfo, distance, duration });
    } catch (e) {
        return res.status(502).json({ error: String((e as Error)?.message ?? e) });
    }
});

/**
 * 🛣️ **실험실 전용 — 길 찾기: 카카오 «모든 옵션»을 실시간으로, 합치지 않고 그대로**
 * (기사님 2026-09-08: *"길찾기를 합하지 말고 카카오 모든 옵션을 뿌려주면? — 카카오 호출하자는 이야기"*).
 *
 * 미리 만든 길 파일과 달리 **누르는 그 시각의 소요시간**이 나온다 — 밤 출발이면 밤의 길.
 * 옵션 5종(추천·최단시간·최단거리·고속도로 피하기·톨게이트 피하기) × 대안 경로, 중복 병합 없음.
 * 점은 ~0.4km 간격으로 솎는다. 운영에서는 다른 sim 문들과 같이 404.
 */
router.post("/roads", async (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    try {
        const { origin, dest, waypoints } = req.body ?? {};
        const ok = (p: unknown): p is { x: number; y: number } =>
            !!p && Number.isFinite((p as { x: number }).x) && Number.isFinite((p as { y: number }).y);
        if (!ok(origin) || !ok(dest)) return res.status(400).json({ error: "origin/dest 는 {x,y} 여야 합니다" });
        // ➕ 경유지를 이어 붙인 경로 (기사님 2026-09-08 «두 단으로 가기») — 카카오가 «빠름» 축만 알아서
        //    남쪽으로 도는 길을 절대 안 준다. 경유점을 지나는 조건을 걸면 그 길이 나온다
        const wps: Array<{ x: number; y: number }> = Array.isArray(waypoints) ? waypoints.filter(ok).slice(0, 5) : [];
        const wpParam = wps.length ? `&waypoints=${wps.map(w => `${w.x},${w.y}`).join("|")}` : "";

        // 4개만, 대안 없이 (기사님 확정 2026-09-08: «추천·최단거리·최단시간·톨게이트 피하기 이렇게 4개만»)
        const COMBOS: Array<[string, string, string]> = [
            ["RECOMMEND", "", "추천"],
            ["DISTANCE", "", "최단거리"],
            ["TIME", "", "최단시간"],
            ["RECOMMEND", "toll", "톨게이트 피하기"],
        ];
        const rad = (x: number) => x * Math.PI / 180;
        const km = (a: [number, number], b: [number, number]) =>
            Math.hypot((b[0] - a[0]) * 111.32 * Math.cos(rad(a[1])), (b[1] - a[1]) * 110.574);
        const headers = { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY || ""}` };

        const roads: Array<{ option: string; name: string; distKm: number; durMin: number; tollWon: number | null; line: Array<[number, number]> }> = [];
        for (const [priority, avoid, label] of COMBOS) {
            const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin.x},${origin.y}&destination=${dest.x},${dest.y}${wpParam}`
                + `&priority=${priority}${avoid ? `&avoid=${avoid}` : ""}&alternatives=false&road_details=true&car_type=1`;
            const r = await fetch(url, { headers });
            if (!r.ok) continue;                              // 옵션 하나가 막혀도 나머지는 뿌린다
            const d = await r.json() as { routes?: Array<{ result_code: number; summary: { distance: number; duration: number; fare?: { toll?: number } }; sections?: Array<{ roads?: Array<{ name?: string; distance: number; vertexes?: number[] }> }> }> };
            (d.routes ?? []).filter(rt => rt.result_code === 0).forEach((rt, ai) => {
                const pts: Array<[number, number]> = [];
                const roadKm = new Map<string, number>();
                for (const sec of rt.sections ?? []) for (const road of sec.roads ?? []) {
                    if (road.name) roadKm.set(road.name, (roadKm.get(road.name) ?? 0) + road.distance);
                    const v = road.vertexes ?? [];
                    for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
                }
                const line: Array<[number, number]> = [];
                for (const p of pts) if (!line.length || km(line[line.length - 1], p) >= 0.4)
                    line.push([+p[0].toFixed(5), +p[1].toFixed(5)]);
                const top = [...roadKm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);
                roads.push({
                    option: ai === 0 ? label : `${label} 대안${ai}`,
                    name: top.join("·") || "이름 없는 길",
                    distKm: +(rt.summary.distance / 1000).toFixed(1),
                    durMin: Math.round(rt.summary.duration / 60),
                    tollWon: rt.summary.fare?.toll ?? null,
                    line,
                });
            });
        }
        return res.json({ roads });
    } catch (e) {
        return res.status(502).json({ error: String((e as Error)?.message ?? e) });
    }
});

/**
 * 🧭 **실험실 전용 — 정거장 전부를 한 번에, 구간별로 그대로** (기사님 확정 2026-09-08).
 *
 * 기사님 순서(②~⑥ · ⑫~⑭) 그대로다:
 *   재배치된 좌표들을 통째로 한 번 보내면 → **카카오가 구간마다 nkm/n분을 나눠서 준다.**
 *   그 값을 **합치지 않고 그대로** 돌려준다 — 우회는 «같은 구간의 전/후 차이»로 화면이 계산한다.
 *
 * 🔴 `calculateDetourRoute` 를 안 쓴다: 그것은 **총합 차이(merged−base)** 만 준다.
 *    기사님 정의는 «우회상차시간 = (출발지-첫콜상차) − (내위치-첫콜상차)» 처럼
 *    **구간별**이라, 총합만으로는 어디서 얼마나 늘었는지 답할 수 없다 (2026-09-08 정정).
 *
 * 요청: `{ stops: [{x,y,label?}, ...] }` — 첫 점이 출발지(보통 내 위치)
 * 응답: `{ legs: [{from,to,distKm,durMin,line}], totalKm, totalMin }` — legs[i] = stops[i]→stops[i+1]
 */
/** 폴리라인 솎기 — `/roads` 와 같은 0.4km 규약. 안 솎으면 8정거장에 154KB 가 나간다 (2026-09-08 리뷰) */
function thinLine(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
    const rad = (v: number) => v * Math.PI / 180;
    const km = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot((b.x - a.x) * 111.32 * Math.cos(rad(a.y)), (b.y - a.y) * 110.574);
    const out: Array<{ x: number; y: number }> = [];
    for (const p of pts) if (!out.length || km(out[out.length - 1], p) >= 0.4) out.push({ x: +p.x.toFixed(5), y: +p.y.toFixed(5) });
    const last = pts[pts.length - 1];
    if (last && out.length && km(out[out.length - 1], last) > 0.05) out.push({ x: +last.x.toFixed(5), y: +last.y.toFixed(5) });
    return out;
}

router.post("/chain", async (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    try {
        const stops = req.body?.stops as Array<{ x: number; y: number; label?: string }> | undefined;
        const valid = Array.isArray(stops) && stops.length >= 2 && stops.length <= 30
            && stops.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y));
        if (!valid) return res.status(400).json({ error: "stops 는 2~30개의 {x,y} 배열이어야 합니다" });

        const priority = ["RECOMMEND", "TIME", "DISTANCE"].includes(req.body?.priority) ? req.body.priority as string : "RECOMMEND";
        const avoid = ["motorway", "toll"].includes(req.body?.avoid) ? req.body.avoid as string : undefined;
        const origin = stops[0], dest = stops[stops.length - 1], waypoints = stops.slice(1, -1);

        const body = {
            origin: { x: String(origin.x), y: String(origin.y) },
            destination: { x: String(dest.x), y: String(dest.y) },
            waypoints: waypoints.map((w, i) => ({ name: `wp${i}`, x: String(w.x), y: String(w.y) })),
            priority, car_type: 1, ...(avoid ? { avoid: [avoid] } : {}),
        };
        const r = await fetch("https://apis-navi.kakaomobility.com/v1/waypoints/directions", {
            method: "POST",
            headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY || ""}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const d = await r.json() as {
            code?: number; msg?: string;
            routes?: Array<{ result_code: number; result_msg?: string; summary?: { distance: number; duration: number; fare?: { toll?: number } };
                sections?: Array<{ distance: number; duration: number; roads?: Array<{ vertexes?: number[] }> }> }>;
        };
        // 🔴 «경로 없음이 아닌 실패»(키 오류·좌표 뒤바뀜·쿼터 소진)를 삼키지 않는다 —
        //    전부 «이 경로는 불가능하다»로 읽히면 오진한다 (2026-09-08 리뷰)
        if (!r.ok || d.code !== undefined) {
            return res.status(502).json({ error: `카카오 오류: ${d.msg ?? `HTTP ${r.status}`}`, kakaoCode: d.code ?? null });
        }
        const route = d.routes?.[0];
        if (!route || route.result_code !== 0) {
            /**
             * 🔴 **구간 하나의 실패가 전체를 죽이지 않는다** — `/route` 와 같은 규약.
             * 전체 경로가 통째로 실패하면 **정거장 쌍마다 따로** 재서 살릴 구간은 살린다.
             * (2026-09-08 리뷰: 도로 밖 좌표 하나에 멀쩡한 구간까지 사라졌다)
             */
            const legs: Array<{ from: string | null; to: string | null; distKm: number | null; durMin: number | null; line: Array<{ x: number; y: number }>; failed: boolean }> = [];
            for (let i = 0; i + 1 < stops.length; i++) {
                const s1 = stops[i], s2 = stops[i + 1];
                try {
                    const one = await calculateSoloRoute(s1.x, s1.y, s2.x, s2.y, null, priority, 1, false, avoid);
                    legs.push({ from: s1.label ?? null, to: s2.label ?? null,
                        distKm: +(one.distance / 1000).toFixed(1), durMin: Math.round(one.duration / 60),
                        line: thinLine(one.polyline ?? []), failed: false });
                } catch {
                    legs.push({ from: s1.label ?? null, to: s2.label ?? null, distKm: null, durMin: null, line: [], failed: true });
                }
            }
            const okLegs = legs.filter(l => !l.failed);
            return res.json({
                legs, partial: true,
                note: `전체 경로 통째 실패(${route?.result_msg ?? "경로 없음"}) — 구간별로 다시 쟀다`,
                totalKm: okLegs.length ? +okLegs.reduce((t, l) => t + (l.distKm ?? 0), 0).toFixed(1) : null,
                totalMin: okLegs.length ? okLegs.reduce((t, l) => t + (l.durMin ?? 0), 0) : null,
                tollWon: null,
            });
        }
        // 🔴 구간을 **합치지 않는다** — 카카오가 나눠 준 그대로가 기사님이 쓰는 값이다
        const legs = (route.sections ?? []).map((sec, i) => {
            const line: Array<{ x: number; y: number }> = [];
            for (const road of sec.roads ?? []) {
                const v = road.vertexes ?? [];
                for (let k = 0; k + 1 < v.length; k += 2) line.push({ x: v[k], y: v[k + 1] });
            }
            return {
                // 🔴 라벨을 지어내지 않는다 — 클라가 이걸 구간 조인 키로 쓴다 (없으면 null)
                from: stops[i]?.label ?? null, to: stops[i + 1]?.label ?? null,
                distKm: +(sec.distance / 1000).toFixed(1), durMin: Math.round(sec.duration / 60),
                line: thinLine(line), failed: false,
            };
        });
        const sum = route.summary;
        return res.json({
            legs, partial: false,
            // 없는 값은 null 이다 — 0.0km 라고 단언하지 않는다 (규칙 ④)
            totalKm: sum ? +(sum.distance / 1000).toFixed(1) : null,
            totalMin: sum ? Math.round(sum.duration / 60) : null,
            tollWon: sum?.fare?.toll ?? null,
        });
    } catch (e) {
        return res.status(502).json({ error: String((e as Error)?.message ?? e) });
    }
});
