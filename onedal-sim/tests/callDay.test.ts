/**
 * 📅 콜의 날짜는 생성기가 싣고, 화면은 짐작하지 않고 그 날짜로 «오늘·낼·모레»·남은 분을 그린다
 * (기사님 «그렇게 만든 원인을 찾아야지» · onedal-1f «가»). 생성기가 HH:MM 만 남기고 날짜를 버려
 * 인성 목록은 «9시 이전은 낼», 픽커는 «늘 오늘», 화물24시는 «오늘 날짜»로 제각각 짐작했다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayOffset, generateBaseCall, minutesLeft } from '@altari/core-simulator';
import { insungTimeLabel } from '../packages/ui-simulators/src/insung/SimDispatchBoard';
import { seededRandom } from './seededRandom';

const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m);
const iso = (d: number, h: number, m: number) => at(d, h, m).toISOString();

describe('callDay', () => {
  it('새벽 03:40 에 04:06 상차 → 오늘 · 23:50 에 다음 날 00:20 → 내일 · 모레', () => {
    expect(dayOffset(iso(1, 4, 6), at(1, 3, 40))).toBe(0);
    expect(dayOffset(iso(2, 0, 20), at(1, 23, 50))).toBe(1);
    expect(dayOffset(iso(3, 9, 0), at(1, 23, 50))).toBe(2);
    expect(dayOffset(undefined, at(1, 3, 40))).toBeNull();
  });

  it('남은 분 — 자정을 넘어도 맞다 · 날짜 없으면 null', () => {
    expect(minutesLeft(iso(2, 0, 20), at(1, 23, 50))).toBe(30);
    expect(minutesLeft(iso(1, 3, 30), at(1, 3, 40))).toBe(-10);
    expect(minutesLeft(undefined, at(1, 3, 40))).toBeNull();
  });
});

describe('insungTimeLabel — 콜 날짜로 가른다', () => {
  it('오늘 04:06 → 오전4시6 · 내일 00:20 → 낼0시20 · 모레 → 모레', () => {
    expect(insungTimeLabel(iso(1, 4, 6), '04:06', at(1, 3, 40))).toEqual({ text: '오전4시6', isTomorrow: false });
    expect(insungTimeLabel(iso(2, 0, 20), '00:20', at(1, 23, 50))).toEqual({ text: '낼0시20', isTomorrow: true });
    expect(insungTimeLabel(iso(3, 8, 30), '08:30', at(1, 14, 0))).toEqual({ text: '모레8시반', isTomorrow: true });
    expect(insungTimeLabel(iso(1, 19, 0), '19:00', at(1, 14, 0))).toEqual({ text: '저녁7시', isTomorrow: false });
  });

  it('날짜 없는 콜은 짐작하지 않고 오늘 꼴', () => {
    expect(insungTimeLabel(undefined, '08:30', at(1, 14, 0))).toEqual({ text: '오전8시반', isTomorrow: false });
    expect(insungTimeLabel(undefined, '4시', at(1, 3, 0))).toBeNull();
  });
});

describe('생성기가 상차·하차 날짜를 싣는다', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(at(1, 23, 50)); });
  afterEach(() => vi.useRealTimers());

  it('pickupAt·deliveryAt 이 HH:MM 과 같은 시각이다', () => {
    const call = generateBaseCall({ driverLon: 127.294, driverLat: 37.3772, maxPickupKm: 15, minFare: 30000 }, undefined, seededRandom(7));
    expect(call).not.toBeNull();
    const p = new Date(call!.pickupAt!);
    const d = new Date(call!.deliveryAt!);
    const hhmm = (x: Date) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
    expect(hhmm(p)).toBe(call!.pickupTime);
    expect(hhmm(d)).toBe(call!.deliveryTime);
    expect(d.getTime()).toBeGreaterThan(p.getTime());
  });
});
