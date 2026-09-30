/**
 * 인성 목록 시각 글자 — «낼»은 콜에 실린 날짜로 가른다 (기사님 «자동인데 계속 미리보기» · «그렇게 만든 원인을 찾아야지» · onedal-1f «가»).
 * 9시 이전 예약을 늘 «낼»로 그려, 새벽 시험의 04:06 상차 콜이 내일 콜이 되어 앱이 확정을 넘겼다. 날짜 칸은 `tests/callDay.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { insungTimeLabel } from '../packages/ui-simulators/src/insung/SimDispatchBoard';

const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m);

describe('insungTimeLabel', () => {
  it('새벽 03:43 — 오늘 04:06 은 오늘 · 내일 03:00 은 낼', () => {
    expect(insungTimeLabel(at(1, 4, 6).toISOString(), '04:06', at(1, 3, 43))).toEqual({ text: '오전4시6', isTomorrow: false });
    expect(insungTimeLabel(at(2, 3, 0).toISOString(), '03:00', at(1, 3, 43))).toEqual({ text: '낼3시', isTomorrow: true });
  });

  it('낮 — 내일 08:30 은 낼 · 오늘 저녁 19:00 · 오늘 낮 12:00', () => {
    expect(insungTimeLabel(at(2, 8, 30).toISOString(), '08:30', at(1, 14, 0))).toEqual({ text: '낼8시반', isTomorrow: true });
    expect(insungTimeLabel(at(1, 19, 0).toISOString(), '19:00', at(1, 14, 0))).toEqual({ text: '저녁7시', isTomorrow: false });
    expect(insungTimeLabel(at(1, 12, 0).toISOString(), '12:00', at(1, 10, 0))).toEqual({ text: '낮12시', isTomorrow: false });
  });

  it('시각 글자가 망가지면 없다', () => {
    expect(insungTimeLabel(undefined, '4시', at(1, 3, 0))).toBeNull();
  });
});
