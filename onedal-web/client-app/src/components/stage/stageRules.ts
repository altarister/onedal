/**
 * 🧠 **시트 규칙 — v23 Ⅲ표가 곧 이 함수다** (기사님 확정 2026-08-31).
 *
 * 무대의 시트가 언제 올라가고 내려가는지를 정하는 **유일한 자리**다.
 * 화면도 타이머도 소켓도 모르는 **순수 함수**라 폰 없이 검사된다 (`stageRules.test.ts`).
 *
 * 🔴 **왜 뺐나** — 2026-08-31 하루에 이 규칙을 **다섯 번** 뒤집었는데(유예 30초 → 자동올림,
 *    자막 줄, 덱 추종, 카운트다운) 전부 **손으로** 확인했다. 이 레포의 원칙은
 *    *"있는 검사가 안 불리면 없는 것"* 인데 여기는 **애초에 검사가 없었다.**
 *    그날 «짧은 구간에서 시트가 안 내려가던 것»은 검사가 있었으면 책상에서 잡혔다.
 *
 * 표의 뜻:
 *   · 손(드래그·탭)이 이긴다 — 만진 뒤 30초는 자동이 아무것도 못 바꾼다
 *   · 자동으로 올린 시트(KEEP·도착)는 «정차»에는 이기고 «주행»에는 진다
 *   · 자동은 **높이만** 바꾼다 — 콜·필터 상태는 건드리지 않으므로 안전하다 (v23 Ⅳ)
 */
/** 🪟 시트의 세 단 — 이름의 원천은 `StageSheet` 의 `SheetSnap` 이다 (규칙 ③) */
/* 🪧 심사 때 시트를 올리는 규칙은 여기 한 곳이 안다 (규칙 ③) */
import { snapOnJudging } from './sheetTransition';
export type Snap = 'peek' | 'list' | 'full';

/** 지금 무대가 받는 신호 — 전부 밖에서 재서 넣는다 */
export interface StageSignals {
    nowMs: number;
    /** 진행 중인 콜 수 */
    calls: number;
    /** 심사 중인 콜이 있나 (S4) */
    judging: boolean;
    /** 주행/정차 — GPS 속도의 히스테리시스 결과 */
    drive: 'drive' | 'idle';
    /**
     * 🪧 **지금 시트 높이** — 심사가 뜰 때 «올릴까»를 정하는 데 쓴다.
     *    규칙은 `snapOnJudging` 하나가 안다 (엿보기면 올리고, 나머지는 그대로).
     */
    snap?: 'peek' | 'list' | 'full';
    /**
     * 📍 **지금 곁(100m)에 있는 다녀온 정거장** — `orderId:pickup|dropoff` 꼴.
     *    유예 중 미룬 도착을 다시 물을 때 «아직 그 정거장 곁인가»를 답한다 (2026-09-15).
     */
    hereStops?: string[];
}

/** 규칙이 기억하는 것 — 이것도 밖에 두고 넣고 받는다 (숨은 상태 없음) */
export interface StageMemory {
    /** KEEP·도착이 올린 시트인가 — 정차에는 이기고 주행에는 진다 */
    autoRaised: boolean;
    /** 손이 이기는 유예의 끝 (ms). 0 이면 유예 없음 */
    userHoldUntil: number;
    /**
     * 🏁 **유예 중에 미룬 도착** — `orderId:pickup|dropoff`. 최신 하나만 든다 (2026-09-15 여섯 번째 바퀴 · onedal-49 합의).
     *    예전엔 미룬 뒤 유예가 끝나면 «신호»만 다시 물어 도착 마중이 사라졌다 (10:54:49 하차 도착).
     */
    pendingArrival?: string | null;
}

export const initialStageMemory = (): StageMemory => ({ autoRaised: false, userHoldUntil: 0, pendingArrival: null });

/** 손이 이기는 시간 — 만지면 이만큼은 자동이 아무것도 못 바꾼다 (v23 Ⅳ) */
export const USER_HOLD_MS = 30_000;

export type StageEvent =
    /** 신호가 바뀌었다 (주행/정차 · 판정 · 콜 수) */
    | { type: 'signal' }
    /** KEEP 직후 — 바로 통화해야 한다 (S5) */
    | { type: 'keep' }
    /**
     * 정거장 도착 — 신고 시트가 마중 나간다 (v23 Ⅲ-S7 · 화면규칙 S13).
     *
     * 🔴 **«그 콜»과 «그 단계»를 함께 든다** — v23 원문이 *"focus={그 콜, 그 단계}"* 다.
     *    이것이 없으면 시트만 올라오고 **무엇을 열지 아무도 모른다** (2026-09-12 사고).
     */
    | { type: 'arrive'; orderId?: string; stopType?: 'pickup' | 'dropoff' }
    /**
     * 🚪 **완료 행동 — 문을 닫는다** (v23 Ⅳ · 화면규칙 S14).
     *
     * v23 원문: *"통화 완료·시트 저장 → focus 해제 + 시트 자동 복귀
     * **(뒤로가기를 찾을 일 없음)**"*.
     * 🔴 이 길이 없으면 기사님이 **손으로 내리게 되고**, 그 순간 S11 유예(30초)가 걸려
     *    **다음 도착 마중이 조용히 사라진다** (기사님 실측: 도착 여섯 중 셋만 마중).
     *    손은 «내 뜻»이지만 **도착은 차가 한 일**이다 — 둘을 같은 것으로 치면 안 된다.
     */
    | { type: 'done' }
    /** 출발(버튼 또는 국면 전환) — 이제 달린다 */
    | { type: 'depart' }
    /** 지도 정거장·이름표 탭 (S6) */
    | { type: 'tap' }
    /** 손으로 끌었다 */
    | { type: 'drag'; to: Snap };

export interface StageResult {
    mem: StageMemory;
    /** 바꿀 높이. `null` 이면 그대로 둔다 */
    snap: Snap | null;
    /** 왜 그렇게 정했나 — 로그로 남아 GPS 궤적과 대조된다 */
    reason: string;
    /**
     * 손 유예에 걸려 **미룬** 결정인가. 호출부는 유예가 끝나면 다시 물어야 한다 —
     * 안 그러면 유예 중에 온 전환이 영영 사라진다 (0831 실측: 시트가 전체에 눌러앉음).
     */
    deferred: boolean;
}

const out = (mem: StageMemory, snap: Snap | null, reason: string, deferred = false): StageResult =>
    ({ mem, snap, reason, deferred });

/**
 * 🎬 **한 걸음** — 지금 신호와 기억, 그리고 방금 일어난 일로 다음 높이를 정한다.
 * 순서가 곧 우선순위다. 위에서 걸리면 아래는 안 본다.
 */
export function stageStep(mem: StageMemory, sig: StageSignals, ev: StageEvent): StageResult {
    // ── 손이 이긴다. 만진 뒤 30초는 자동(신호)이 아무것도 못 바꾼다
    const holding = sig.nowMs < mem.userHoldUntil;

    switch (ev.type) {
        case 'drag':
            // 손으로 끈 것이 곧 의사 표현이다 — 마중은 끝나고, 30초 유예가 시작된다
            return out({ ...mem, autoRaised: false, userHoldUntil: sig.nowMs + USER_HOLD_MS }, ev.to, '손');   // 미룬 도착은 든 채로

        case 'tap':
            // 지도에서 콜을 골랐다 — 손짓이므로 유예를 준다 (S6)
            return out({ ...mem, autoRaised: false, userHoldUntil: sig.nowMs + USER_HOLD_MS }, 'full', '탭');

        case 'keep':
            if (holding) return out(mem, null, 'KEEP(손 유예 중)', true);
            // 킵 직후 바로 통화 — 정차 전환이 끌어내리지 못하게 «자동 올림»으로 표시 (S5)
            return out({ ...mem, autoRaised: true }, 'full', 'KEEP');

        case 'arrive':
            /* 🏁 미루되 잊지 않는다 — 유예가 끝나면 «아직 곁이면» 도착으로 다시 올린다. 더 새 도착이 오면 그것 하나만 */
            if (holding) return out({ ...mem, pendingArrival: ev.orderId && ev.stopType ? `${ev.orderId}:${ev.stopType}` : mem.pendingArrival ?? null },
                null, '도착(손 유예 중)', true);
            // 신고하는 동안 정차 전환이 못 끌어내린다 — 달리기 시작하면 내려간다 (S7)
            return out({ ...mem, autoRaised: true, pendingArrival: null }, 'full', '도착');

        case 'done':
            /**
             * 🚪 **완료 행동이 문을 닫는다** (v23 Ⅳ · S14) — 통화 완료·저장을 누르면
             *    시트가 스스로 내려간다. 🔴 **유예를 걸지 않는다** — 손으로 끈 것이 아니라
             *    «일을 마친 것»이라, 다음 정거장 도착은 여전히 마중 나가야 한다.
             */
            return out({ ...mem, autoRaised: false, pendingArrival: null }, 'list', '완료');   // 일을 마쳤다 — 미룬 도착도 끝

        case 'depart':
            if (holding) return out(mem, null, '출발(손 유예 중)', true);
            // 달릴 참이다 — 마중은 끝난다. 주행 감지(10초)를 기다리면 그 사이 지도를 가린다
            return out({ ...mem, autoRaised: false }, 'peek', '출발');

        case 'signal':
        default: {
            if (holding) return out(mem, null, '손 유예 중', true);
            /* 🏁 유예가 끝났다 — 미룬 도착이 있고 **아직 그 정거장 곁이면** 도착으로 올린다. 떠났으면 조용히 잊는다 (한 번만 묻는다) */
            if (mem.pendingArrival) {
                const key = mem.pendingArrival;
                mem = { ...mem, pendingArrival: null };
                if (sig.hereStops?.includes(key)) return out({ ...mem, autoRaised: true }, 'full', '도착(유예 뒤)');
            }
            if (sig.judging) {
                /**
                 * 🪧 **심사가 뜨면 시트를 「나」로 올린다** (기사님 확정 2026-09-05 · 안 ⓑ).
                 *
                 * 🔴 예전에는 **내렸다**(peek) — «지도가 판정의 근거다»(S4)를 지키려던 것이다.
                 *    그런데 판정석이 **시트 맨 아래**로 오면서 내리면 **결재 버튼이 안 보인다.**
                 *    실물에 콜을 하나 올려 찍어 보고서야 드러났다.
                 * 🟢 **둘 다 지킨다** — 「나」는 58% 상한이라 **지도가 절반 남는다.**
                 *    후보 경로(노란 점선)를 보면서 아래에서 결재한다.
                 * ⚠️ 이미 「다」로 올려 두셨으면 그대로다 — 손이 이긴다 (`snapOnJudging`).
                 * 🔴 규칙은 `sheetTransition` 한 곳이 안다 — 여기서 다시 적지 않는다 (규칙 ③).
                 */
                return out({ ...mem, autoRaised: false }, snapOnJudging(sig.snap ?? 'peek'), '판정중');
            }
            if (sig.drive === 'drive') {
                // S3 — 달리면 지도가 주인공. 자동으로 올라간 시트도 여기서는 진다
                return out({ ...mem, autoRaised: false }, 'peek', '주행');
            }
            // 🪜 KEEP·도착으로 올라간 시트는 «정차»가 끌어내리지 못한다
            if (mem.autoRaised) return out(mem, null, '마중 유지');
            if (sig.calls > 0) return out(mem, 'list', '정차');   // S2 — 콜 목록
            return out(mem, 'peek', '콜없음');                     // S1
        }
    }
}
