import { readFileSync } from 'fs';
import { join } from 'path';
import { arrivalReasonGroupsFor, REASON_NEEDS_MEMO } from '@onedal/shared';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const code = (p: string) => read(p).split('\n')
    .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

/**
 * 🔔 **새 콜이 들어오면 보이는 탭으로 데려온다** (기사님 실측 2026-08-19)
 *
 * 기사님: *"콜이 하나뿐이라 완료로 넘어가서 완료된 콜을 보고 어떻게 진행했는지 확인하고
 * 다시 1콜을 호출해서 잡았는데, 지금 보고 있는 탭이 완료 탭이어서 **콜이 왔는지도 모르고
 * 지나갔어.**"*
 *
 * 🔴 이건 화면 불편이 아니라 **콜을 잃는 사고**다. 안전취소 30초 안에 결재해야 하는데
 *    화면에 없으면 아무것도 못 한다. 조회 탭(완료됨·취소·방출)에 머무는 동안 새 콜이
 *    떠도 기사님은 모른다.
 *
 * ⚠️ 다만 **아무 때나 탭을 뺏지 않는다** — 새 콜이 **평가 중으로 들어올 때만** 데려온다.
 *    (규칙 ①의 연장 — 화면을 뺏는 것은 결재를 위해서만 정당하다)
 */
describe('새 콜 — 조회 탭에 있어도 놓치지 않는다', () => {
    it('🔴 새 콜이 뜨면 진행 중 탭으로 돌아온다', () => {
        const dash = code('../../../client-app/src/pages/Dashboard.tsx');
        expect(dash).toMatch(/order-evaluating/);
        expect(dash).toMatch(/setViewFilter\('ACTIVE'\)/);
    });
});

/**
 * 🗂️ **사유는 카테고리로 나눈다** (기사님 실측 2026-08-19)
 *
 * 기사님: *"모든 종류의 트러블이 하나에 모여 있어서 찾기 너무 어렵고 추가하기도 좀
 * 그렇다. 도로문제 / 상차지문제 / 기타 이런 식으로 카테고리로 나누어 표시하는 것이
 * 좋을 것 같은데. 어느 정도 높이가 시트마다 비슷해야 버튼 찾기도 좋으니까."*
 *
 * 칩을 한 줄에 쏟아 두면 **찾는 데 시간이 걸리고**, 목록을 늘릴 자리도 없다.
 * 묶어 두면 눈이 먼저 갈래를 고르고, 나중에 사유를 더해도 그 갈래 안에서 자란다.
 */
describe('사유 카테고리 — 갈래로 묶는다', () => {
    it('🔴 상차지 도착: 도로 문제 · 상차지 문제 · 기타', () => {
        const g = arrivalReasonGroupsFor('ARRIVE_PICKUP');
        expect(g.map(x => x.label)).toEqual(['도로 문제', '상차지 문제', '기타']);
        expect(g[0].reasons).toEqual(expect.arrayContaining(['교통 지연', '사고', '진입 곤란']));
        expect(g[1].reasons).toEqual(expect.arrayContaining(['주소 다름', '점심시간', '문 잠김']));
    });

    it('🔴 하차지 도착: 도로 · 하차지 · **짐 상태** · 기타', () => {
        const g = arrivalReasonGroupsFor('ARRIVE_DROPOFF');
        expect(g.map(x => x.label)).toEqual(['도로 문제', '하차지 문제', '짐 상태', '기타']);
        expect(g[2].reasons).toEqual(expect.arrayContaining(['짐 무너짐', '결박 풀림', '파손 발견']));
    });

    it('완료 단계도 갈래가 있다', () => {
        expect(arrivalReasonGroupsFor('LOADED').map(x => x.label)).toEqual(['상차 문제', '기타']);
        expect(arrivalReasonGroupsFor('DELIVERED').map(x => x.label)).toEqual(['하차 문제', '기타']);
    });

    it('🔴 기타는 언제나 마지막 갈래이고 그 안에 하나뿐이다', () => {
        for (const step of ['ARRIVE_PICKUP', 'LOADED', 'ARRIVE_DROPOFF', 'DELIVERED']) {
            const g = arrivalReasonGroupsFor(step);
            expect(g[g.length - 1]).toEqual({ label: '기타', reasons: [REASON_NEEDS_MEMO] });
        }
    });

    it('사유가 없는 단계는 빈 목록 — 통화 단계에는 사유가 없다', () => {
        expect(arrivalReasonGroupsFor('CALL_PICKUP')).toEqual([]);
    });

    it('🔴 화면이 갈래로 그린다', () => {
        expect(code('../../../client-app/src/components/dashboard/StepSheetMock.tsx'))
            .toMatch(/arrivalReasonGroupsFor/);
    });
});
