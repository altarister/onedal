import { describe, expect, it } from 'vitest';
import * as presets from '../packages/core-simulator/src/presets';

/**
 * 🗺️ **정거장 주소에는 그 동 이름이 들어 있어야 한다**
 *
 * 문제지의 정거장은 칸이 둘이다 — `region`(목록 화면에 그려지는 동 이름)과 `addressDetail`(주소 전체).
 * 🔴 **상세 화면과 서버 판정은 `addressDetail` 만 본다.** 거기에 동 이름이 없으면 경유 필터가
 *    그 콜을 버린다 — 「도착지(인천 남동구 논현로) 경유 이탈」. 하차 목록에 그 동이 있어도
 *    주소 문자열에 글자가 없으면 못 맞춘다 (`shared/src/regionMatch.ts` 의 `anyRegionHit`).
 *
 * 🔴 **도로명도 함께 적는다** — 동 이름만 적으면 카카오가 동 중심점을 주고, 그 점이 도로 밖이면
 *    길찾기가 죽는다. 둘 다 담는 모양이 맞다: 「경기 오산시 가수동 황새로 211」.
 *
 * ── 🔴 못 잡는 것 ──
 * · **도로명이 빠진 것** — 동 이름만 적어도 이 검사는 통과한다. 그건 카카오가 동 중심점을 주고
 *   길찾기가 죽어야 드러나므로, 실제로 길찾기를 걸어 봐야 한다.
 * · **`region` 이 틀린 것** — 주소와 동 이름이 **함께 틀려도** 서로 맞으면 통과한다.
 *   법정동이 맞는지는 카카오 역지오코딩으로만 확인된다.
 * · **좌표가 주소와 다른 곳을 가리키는 것** — 글자만 보므로 좌표는 안 본다.
 * · **앱이 실제로 읽는 글자** — 여기는 문제지 값이고, 화면에 무엇이 그려지는지는 `pnpm lab` 몫이다.
 */
describe('🗺️ 정거장 주소 — region 글자가 addressDetail 안에 있다', () => {

    /** 문제지에서 내보낸 정거장 꼴의 값을 전부 모은다 — 이름을 손으로 나열하지 않는다 */
    const stops = Object.entries(presets as Record<string, unknown>)
        .flatMap(([name, v]) => collect(name, v));

    function collect(name: string, v: unknown, depth = 0): Array<{ name: string; region: string; addressDetail: string }> {
        if (depth > 4 || v == null || typeof v !== 'object') return [];
        const o = v as Record<string, unknown>;
        if (typeof o.region === 'string' && typeof o.addressDetail === 'string') {
            return [{ name, region: o.region, addressDetail: o.addressDetail }];
        }
        return Object.entries(o).flatMap(([k, x]) => collect(`${name}.${k}`, x, depth + 1));
    }

    it('🔴 정거장이 하나는 잡힌다 (모으는 셈이 죽으면 이 검사가 조용히 통과한다)', () => {
        expect(stops.length).toBeGreaterThan(5);
    });

    it('🔴 주소 전체에 그 동 이름이 들어 있다', () => {
        const missing = stops
            .filter(s => s.region && !s.addressDetail.includes(s.region))
            .map(s => `${s.name}: region=「${s.region}」 인데 주소는 「${s.addressDetail}」`);
        expect(missing).toEqual([]);
    });
});
