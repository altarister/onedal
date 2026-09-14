import type { PresetRequires } from '@altari/core-simulator';

/**
 * 🧪 **테스트 시작 전 점검 줄을 만든다** — 설정 화면(`SetupPage`)이 그린다 (기사님 지시 2026-09-06 · 2026-09-14 넓힘)
 *
 * 2026-09-14 기사님: *"지금 여러 번 같은 지점에 오류가 계속되고 있어 … 먼발치에서 근본적인 원인을 찾아"*
 *
 * 🔴 **그날 콜이 안 잡힌 두 번은 조건이 틀어져 있었는데 점검은 초록이었다** — 점검이 «서버가 정한 값»만 봤다.
 *    · 14:41 폰이 옛 필터 · 직접 모드로 돌았다 → **폰 줄** (모드 · 필터 · 연락)
 *    · 14:54 폰에 실제로 적용된 상차 반경 4.55km(자동) → **상차 반경 줄** (원값이 아니라 실제 적용값)
 *    · 14:54 첫 문제가 기본 위치(경기 광주시)에서 나가 7.2km → **시작 위치 줄**
 *    그래서 «폰·시뮬레이터가 실제로 쓰는 값»을 비교하는 줄을 더했다. 폰 값의 비교는 서버(`core/phoneCheck.ts`)가 하고
 *    여기는 옮겨 적는다.
 * 🔴 **순수 함수로 뗐다** — 화면 안에 있으면 검사가 못 본다 (`tests/preflightRows.test.ts`).
 */

/**
 * 📍 **시뮬레이터가 위치를 받기 전에 쓰는 자리** — 배차 화면(`DispatchPage`)이 이 값을 쓴다.
 * 문제지 시작은 주소창에 위치를 안 싣기 때문에, 서버에서 «내 위치»가 오기 전에 나간 첫 문제는 여기서 거리를 잰다.
 * 🔴 **한 곳에 둔다** — 배차 화면과 점검이 다른 값을 보면 «점검은 맞다는데 첫 문제는 7km»가 된다 (규칙 ③).
 */
export const SIM_DEFAULT_START = { lon: 127.2553, lat: 37.4095, name: '경기 광주시' } as const;

/** 시뮬레이터 시작 위치와 서버의 내 위치가 이만큼 안이면 같은 자리로 본다 */
export const START_GAP_OK_KM = 1;

/** 서버 `core/phoneCheck.ts` 의 `PhoneCheck` 와 같은 모양 */
export interface PhoneCheckRow {
  name: string;
  appVersion: string | null;
  mode: { want: string; got: string | null; ok: boolean };
  filter: { state: 'same' | 'waiting' | 'stale' | 'unknown'; ok: boolean; ageSec: number | null };
  contact: { ageSec: number | null; ok: boolean };
}

export interface PreflightState {
  destinationCity: string | null;
  destinationRadiusKm: number | null;
  homeAddress: string | null;
  isSharedMode: boolean;
  activeCalls: number;
  bootedAt: string | null;
  map?: { features?: number; sido?: string[] };
  /** 알람 요금 하한 (서버 `alarmMinFare` · 관제웹 설정) */
  alarmMinFare?: number | null;
  /** 📱 폰마다 실제로 쓰는 모드·필터·연락 — 옛 서버는 안 싣는다(그때는 줄이 없다) */
  phones?: PhoneCheckRow[];
  /** 📐 폰에 실제로 가는 상차 반경 — 자동이면 줄어든 값 */
  pickupRadiusKmEffective?: number | null;
  radiusAuto?: boolean;
  /** 서버가 아는 «내 위치» (시뮬레이터가 거리를 재야 할 기준) */
  lastFix?: { x: number; y: number; isFallback?: boolean } | null;
}

export interface PreflightRow { what: string; want: string; got: string; ok: boolean }

const kmBetween = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
  const kx = 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110.574);
};

const filterText = (f: PhoneCheckRow['filter']) =>
  f.state === 'same' ? '최신'
  : f.state === 'waiting' ? `받는 중 · ${f.ageSec}초`
  : f.state === 'stale' ? `옛 필터 · ${f.ageSec}초째`
  : '모름 (폰이 지문을 안 보냄)';

export function preflightRows(
  req: PresetRequires | undefined,
  now: PreflightState,
  simStart: { lon: number; lat: number; name: string },
): PreflightRow[] {
  const rows: PreflightRow[] = [];

  /* 📱 폰 — 어느 문제지에나 필요하다 */
  if (now.phones) {
    if (now.phones.length === 0) rows.push({ what: '폰', want: '연결된 폰', got: '없음', ok: false });
    for (const p of now.phones) {
      rows.push({ what: '폰 모드', want: p.mode.want, got: p.mode.got ?? '대답 없음', ok: p.mode.ok });
      rows.push({ what: '폰 필터', want: '서버가 보낸 최신 필터', got: filterText(p.filter), ok: p.filter.ok });
      rows.push({
        what: '폰 연락', want: '1분 안',
        got: p.contact.ageSec == null ? '연락 없음' : `${p.contact.ageSec}초 전`, ok: p.contact.ok,
      });
    }
  }

  if (req) {
    if (req.destinationCity != null) rows.push({
      what: '도착 목표', want: req.destinationCity, got: String(now.destinationCity ?? '(없음)'),
      ok: now.destinationCity === req.destinationCity,
    });
    if (req.destinationRadiusKm != null) rows.push({
      what: '하차 주변', want: `${req.destinationRadiusKm}km`, got: `${now.destinationRadiusKm ?? '?'}km`,
      ok: Number(now.destinationRadiusKm) === req.destinationRadiusKm,
    });
    if (req.homeAddress) rows.push({
      what: '내 주소', want: req.homeAddress, got: String(now.homeAddress ?? '(없음)'),
      ok: String(now.homeAddress ?? '') === req.homeAddress,
    });
    /* 📐 원값이 아니라 **폰에 실제로 가는 값** — 자동이면 줄어든 값이 문제지 정답을 바꾼다 (14:54) */
    if (req.minPickupRadiusKm != null) {
      const eff = now.pickupRadiusKmEffective;
      rows.push({
        what: '상차 반경', want: `${req.minPickupRadiusKm}km 이상`,
        got: eff == null ? '(모름)' : `${Math.round(eff * 10) / 10}km${now.radiusAuto ? ' (자동)' : ''}`,
        ok: eff != null && eff >= req.minPickupRadiusKm,
      });
    }
    if (req.firstLoadOnly) rows.push({
      what: '판', want: '첫짐 · 활성 콜 0건',
      got: `${now.isSharedMode ? '합짐' : '첫짐'} · ${now.activeCalls}건`,
      ok: !now.isSharedMode && now.activeCalls === 0,
    });
    if (req.alarmMinFare != null) rows.push({
      what: '알람 하한', want: req.alarmMinFare.toLocaleString('ko-KR'), got: now.alarmMinFare == null ? '(없음)' : now.alarmMinFare.toLocaleString('ko-KR'),
      ok: now.alarmMinFare === req.alarmMinFare,
    });
    if (req.mapSido?.length) {
      const have: string[] = now.map?.sido ?? [];
      const miss = req.mapSido.filter(c => !have.includes(c));
      rows.push({
        what: '지도', want: `시도 ${req.mapSido.join('·')} 포함`,
        got: `동 ${now.map?.features ?? '?'}개`, ok: miss.length === 0,
      });
    }
    /* 📍 첫 문제가 나갈 자리 ↔ 서버의 내 위치 — 멀면 첫 문제의 «현위치→상차지» 거리가 거짓이다 (14:54 · 7.2km) */
    if (now.lastFix) {
      const gap = kmBetween(simStart, { lon: now.lastFix.x, lat: now.lastFix.y });
      rows.push({
        what: '시작 위치', want: `서버가 아는 내 위치에서 ${START_GAP_OK_KM}km 안`,
        got: `${simStart.name} · ${gap.toFixed(1)}km 떨어짐`, ok: gap <= START_GAP_OK_KM,
      });
    }
  }

  // 🔴 「고친 코드가 도는가」의 유일한 답이 bootedAt 이다 (루트 CLAUDE.md)
  rows.push({ what: '서버 기동', want: '고친 뒤에 뜬 것', got: String(now.bootedAt ?? '').slice(11, 19), ok: true });
  return rows;
}
