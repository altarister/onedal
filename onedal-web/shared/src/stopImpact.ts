/**
 * ⏱️ **밀림 — 한 콜을 잡으면 앞서 약속한 정거장이 몇 분 밀리나, 그리고 «누가» 밀었나**
 *
 * 🔴 **2026-09-11 에 지도 실험실(`client-app/src/pages/labPortMap.ts`)에서 여기로 올렸다**
 *    (이식 A3). 실물이 원천이 되고 실험실이 그것을 부른다.
 *
 * 순수 계산이다: 시각 둘과 정거장 순서만 받고 DOM·DB·시계를 모르므로
 * **화면에서도 서버에서도 같은 답**을 낸다 (규칙 ③ — 원천 하나).
 *
 * ⚠️ **아직 실물 화면에 이어지지 않았다.** 원인별 밀림을 실물에 담으려면 «어느 콜이
 *    밀었나»를 적을 자리가 필요한데, 그 다섯(스키마·값·시점·화면·읽는 곳)이 아직
 *    안 정해졌다 (규칙 ⑤-4). 정해지면 서버가 KEEP 때 이 함수를 불러 채운다.
 */

export type StopImpact = { causeCallId: number; causeLabel: string; min: number; at: number };

/**
 * 🧾 **이 확정이 그 정거장을 몇 분 밀었나 — 원인과 함께** (기사님 확정).
 *
 * 기사님: *"31분이 밀린 거라면 31분이 왜 밀린 건지 그 요소들만 딱 들어갔으면 좋겠어."*
 *
 * 분은 «확정 전이 말한 도착 시각»과 «확정 후가 말한 도착 시각»의 차이 — ⑯ 의 우회 정의
 * 그대로라 카카오를 더 부르지 않는다. 원인은 **이번에 끼워 넣은 정거장 중 그 정거장보다
 * 앞에 온 것**뿐이다. 뒤에 낀 것은 그 정거장을 못 민다.
 *
 * 🔴 **«분»이 아니라 «시각»을 받는다** (리뷰에서 잡힘).
 *    확정 전 경로와 확정 후 경로는 **잰 시각이 다르다** — 그 사이에 달렸으면 각자의 «0분»이
 *    다른 자리다. 분끼리 빼면 그 주행 시간이 통째로 섞인다.
 *    실측 예: 04:00 에 «+80분»(05:20), 30분 달린 뒤 04:30 에 «+65분»(05:35).
 *    분으로 빼면 −15분(빨라졌다)이지만 실제로는 **15분 늦어졌다.**
 *    `detourRows` 에서 한 번 잡은 것과 같은 클래스라, **단위를 시각으로 두어 못 틀리게 한다.**
 *
 * 🔴 **안 밀렸으면 안 적는다** — 0분을 쌓으면 이유 줄이 의미 없는 줄로 찬다.
 * 🔴 **못 잰 값이 섞이면 안 적는다** — 지어내지 않는다 (규칙 ④).
 *
 * 실물에서는 `step_arrive_*.system_reasons` 자리다.
 */
export function impactOfStop(opts: {
    /** 밀렸는지 볼 정거장 (`①하차` 같은 라벨) */
    stopLabel: string;
    /** 확정 «전» 경로가 말한 그 정거장 도착 **시각** (그 경로를 잰 시각 + 누적) */
    beforeAt: number | null | undefined;
    /** 확정 «후» 경로가 말한 그 정거장 도착 **시각** */
    afterAt: number | null | undefined;
    /** 확정 후 경로의 정거장 순서 */
    orderNow: Array<string | null>;
    /** 이번에 끼워 넣은 정거장들 */
    inserted: Array<{ label: string; name: string }>;
    causeCallId: number;
    at: number;
}): (StopImpact & { causeNames: string[] }) | null {
    const { stopLabel, beforeAt, afterAt, orderNow, inserted, causeCallId, at } = opts;
    if (beforeAt == null || afterAt == null) return null;
    const min = Math.round((afterAt - beforeAt) / 60000);
    if (min === 0) return null;
    const here = orderNow.indexOf(stopLabel);
    if (here < 0) return null;
    const causes = inserted.filter(x => {
        const i = orderNow.indexOf(x.label);
        return i >= 0 && i < here;
    });
    if (!causes.length) return null;
    const causeNames = causes.map(x => x.name);
    return { causeCallId, causeLabel: causeNames.join(' · '), min, at, causeNames };
}

/**
 * ✂️ **하차 밀림을 둘로 가른다** (기사님 지시: *"① 을 갈라 적어"*).
 *
 * 기사님이 화면에서 «82분이나 돌아간다는데 이것이 사실이야?» 라고 물으신 값이다.
 * 숫자는 맞았는데 **뜻이 둘 섞여** 있었다 — 실측(콜 넷):
 *
 * ```
 * ⑧ 탄현면 +82분  =  ⑥ 노온사동 상차가 밀린 41분   ← 앞 콜들을 먼저 처리하느라 늦게 출발
 *                    +  이 구간이 꺾인 41분        ← 노온사동→탄현면 직행 58분이 99분이 된다
 * ```
 *
 * 둘은 기사님께 다른 뜻이다 — **꺾이는 것은 기름과 시간을 진짜로 더 쓰는 것**이고,
 * 밀리는 것은 **약속 시각의 문제**다. 한 줄로 적으면 어느 쪽인지 알 수 없다.
 *
 * 🔴 «꺾인 몫»의 원인은 **상차와 하차 사이에 낀 정거장**뿐이다 — 상차 앞에 낀 것은
 *    출발을 밀었을 뿐 이 구간을 꺾지 않았다. 그래서 원인 목록도 차집합으로 가른다.
 */
export function splitDropImpact(
    vPick: (StopImpact & { causeNames: string[] }) | null,
    vDrop: (StopImpact & { causeNames: string[] }) | null,
): StopImpact[] {
    if (!vDrop) return [];
    const carried = vPick?.min ?? 0;
    const own = vDrop.min - carried;
    const rows: StopImpact[] = [];
    if (carried !== 0 && vPick) {
        rows.push({ ...vDrop, min: carried, causeLabel: `${vPick.causeLabel} 경유 — 출발이 밀렸다` });
    }
    if (own !== 0) {
        const between = vDrop.causeNames.filter(n => !(vPick?.causeNames ?? []).includes(n));
        rows.push({
            ...vDrop, min: own,
            causeLabel: between.length
                ? `${between.join(' · ')} 경유 — 이 구간이 꺾였다`
                : '이 구간이 길어졌다',
        });
    }
    return rows;
}
