/**
 * 인성 목록 시각 글자 — «낼»은 지금 시각 기준으로 가른다 (기사님 «자동인데 계속 미리보기» · onedal-1f «가»).
 * 9시 이전 예약을 늘 «낼»로 그려, 새벽 시험의 04:06 상차 콜이 내일 콜이 되어 앱이 확정을 넘겼다.
 */
import { describe, expect, it } from 'vitest';
import { insungTimeLabel } from '../packages/ui-simulators/src/insung/SimDispatchBoard';

const at = (h: number, m: number) => new Date(2026, 9, 1, h, m);

describe('insungTimeLabel', () => {
  it('새벽 03:43 — 지금보다 늦은 04:06 은 오늘 · 이른 03:00 은 낼', () => {
    expect(insungTimeLabel('04:06', at(3, 43))).toEqual({ text: '오전4시6', isTomorrow: false });
    expect(insungTimeLabel('03:00', at(3, 43))).toEqual({ text: '낼3시', isTomorrow: true });
  });

  it('낮 14:00 — 아침 08:30 은 낼 · 저녁 19:00 은 오늘', () => {
    expect(insungTimeLabel('08:30', at(14, 0))).toEqual({ text: '낼8시반', isTomorrow: true });
    expect(insungTimeLabel('19:00', at(14, 0))).toEqual({ text: '저녁7시', isTomorrow: false });
    expect(insungTimeLabel('12:00', at(10, 0))).toEqual({ text: '낮12시', isTomorrow: false });
  });

  it('시각 글자가 망가지면 없다', () => {
    expect(insungTimeLabel('4시', at(3, 0))).toBeNull();
  });
});
