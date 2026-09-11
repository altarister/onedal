/**
 * 🚚 **설정 한 장** (`/`) — 기사님 확정 2026-09-11
 *
 * 예전에는 배차망이 **가장 바깥**에서 갈렸다(`/` 분기 → `/inseong` · `/hwamul24`).
 * 그래서 **설정 화면이 두 벌**이 됐고 한쪽만 자랐다 — 화물24시에는 문제지 탭도,
 * 판 점검도, 채움 콜 수도 **없었다.** 문제지·주소·콜 생성은 이미 공용인데
 * 그 손잡이만 두 벌이던 셈이다 (규칙 ③ — 같은 값이 두 곳에 살지 않는다).
 *
 * 이제 갈라지는 것은 **배차 리스트 화면 한 장**뿐이고, 여기서는 헤더의 스위치로 고른다.
 *
 * 🔴 **시나리오 고르기 → 문제지 고르기 → 옵션 확인 → 시작까지 스크롤이 없어야 한다**
 *    (기사님 2026-09-11). 그래서 두 가지를 지킨다:
 *      ① 손잡이는 **칩 한 줄** — 슬라이더는 라벨·트랙·양끝 글자로 세 줄을 먹는다
 *      ② 긴 글은 **덮개로** — 펼치면 화면이 길어져 시작 버튼이 밀려난다
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRESET_MENU, PRESETS, PRESET_REQUIRES } from '@altari/core-simulator';
import type { PresetRequires } from '@altari/core-simulator';

/** 어느 배차망 화면으로 볼 것인가 — 갈라지는 것은 이것 하나다 */
export type NetKey = 'inseong' | 'hwamul24';

const NETS: Array<{ key: NetKey; name: string }> = [
  { key: 'inseong', name: '인성콜' },
  { key: 'hwamul24', name: '화물24시' },
];

// 주요 시/군/구 프리셋 (mockLocationData.json 기반) — 랜덤콜 전용
const LOCATION_PRESETS = [
  // 🏠 기사님 집 — 2026-08-23 설정의 home_x/home_y 실측값
  { name: '경기 광주시 초월읍(집)', lon: 127.2940, lat: 37.3772 },
  { name: '경기 광주시', lon: 127.2553, lat: 37.4095 },
  { name: '경기 이천시', lon: 127.4350, lat: 37.2720 },
  { name: '경기 여주시', lon: 127.6370, lat: 37.2980 },
  { name: '경기 수원시', lon: 127.0066, lat: 37.2636 },
  { name: '경기 성남시', lon: 127.1264, lat: 37.4201 },
  { name: '경기 용인시', lon: 127.1775, lat: 37.2411 },
  { name: '경기 화성시', lon: 126.9975, lat: 37.1996 },
  { name: '경기 평택시', lon: 127.0889, lat: 36.9920 },
  { name: '경기 안산시', lon: 126.8307, lat: 37.3219 },
  { name: '경기 고양시', lon: 126.8320, lat: 37.6584 },
  { name: '경기 파주시', lon: 126.7820, lat: 37.7590 },
  { name: '경기 김포시', lon: 126.7156, lat: 37.6152 },
  { name: '서울 강남구', lon: 127.0473, lat: 37.5174 },
  { name: '서울 마포구', lon: 126.9083, lat: 37.5664 },
  { name: '인천 중구',   lon: 126.6215, lat: 37.4738 },
  { name: '인천 서구',   lon: 126.6762, lat: 37.5449 },
];

const TARGET_REGION_OPTIONS = [
  { label: '전체', value: '' },
  { label: '경기', value: '경기' },
  { label: '서울', value: '서울' },
  { label: '인천', value: '인천' },
];

/**
 * ⏱ 눈금은 **쓰는 값만** 둔다 (2026-09-11).
 * 기본 10초 — 앱은 콜 하나를 평가하는 동안 리스트를 안 읽고, 한 콜을 잡는 데 약 12초가
 * 걸린다(2026-08-25 실측). 45초는 원달앱으로 끝까지(잡기 → 심사 → 결재 → 안전취소)
 * 한 바퀴 해 보는 자리다.
 */
const INTERVAL_CHOICES = [5000, 10000, 20000, 45000];
/** 🧱 채움 콜 — 집 3개(주행 40초) · 차 20개(주행 40분). 기본 0 (기사님 확정 2026-08-30) */
const FILLER_CHOICES = [0, 3, 10, 20];
const PICKUP_KM_CHOICES = [5, 10, 15, 30, 50];
const MIN_FARE_CHOICES = [10000, 30000, 50000, 100000];

/** 덮개에 띄울 것 — 제목과 본문 (긴 글은 전부 여기로 나간다) */
interface VeilContent {
  title: string;
  body: ReactNode;
}

export function SetupPage() {
  const navigate = useNavigate();

  const [net, setNet] = useState<NetKey>('inseong');
  const [tab, setTab] = useState<'scenario' | 'random'>('scenario');
  const [veil, setVeil] = useState<VeilContent | null>(null);

  // ── 공통 ──
  const [intervalMs, setIntervalMs] = useState(10000);

  // ── 시나리오콜 ──
  const [presetKey, setPresetKey] = useState(PRESET_MENU[0]?.key ?? '');
  // 🔁 기본 꺼짐 (기사님 확정 2026-08-25) — 한 바퀴만 돌려야 무엇을 놓쳤는지 셀 수 있다
  const [loop, setLoop] = useState(false);
  const [fillers, setFillers] = useState(0);

  // ── 랜덤콜 ──
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [maxPickupKm, setMaxPickupKm] = useState(15);
  const [minFare, setMinFare] = useState(30000);
  const [targetRegion, setTargetRegion] = useState('');

  const netName = NETS.find(n => n.key === net)?.name ?? '인성콜';

  /**
   * 🎯 문제지는 상차·하차·요금이 **전부 고정**이라 넘길 것이 넷뿐이다.
   *    기사 위치·반경·최소요금은 넘기지 않는다 — 콜을 고르는 데 안 쓰이므로
   *    화면에 두면 «이게 판정에 영향을 준다»는 오해만 만든다 (기사님 2026-08-24).
   */
  const start = () => {
    const params = tab === 'scenario'
      ? new URLSearchParams({
          net,
          preset: presetKey,
          loop: loop ? '1' : '0',
          interval: String(intervalMs),
          fillers: String(fillers),
        })
      : new URLSearchParams({
          net,
          lon: String(LOCATION_PRESETS[selectedPreset].lon),
          lat: String(LOCATION_PRESETS[selectedPreset].lat),
          name: LOCATION_PRESETS[selectedPreset].name,
          maxKm: String(maxPickupKm),
          minFare: String(minFare),
          target: targetRegion,
          interval: String(intervalMs),
        });
    navigate(`/dispatch?${params.toString()}`);
  };

  return (
    <div className="w-full h-dvh flex flex-col bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-slate-200 font-sans">

      {/**
        * 🔴 **헤더는 한 줄이다** (기사님 2026-09-11: *"해더가 두꺼워"*).
        *    배차망 스위치가 이 줄에 함께 산다 — 맨 위에 있으면서 **세로를 안 먹는다.**
        */}
      <header className="flex items-center gap-2 px-3 py-2 bg-[#0f2a5c] border-b border-blue-700/30">
        <span className="text-[13px] font-bold text-white tracking-tight whitespace-nowrap">🚚 배차 시뮬레이터</span>
        <div className="ml-auto flex rounded-md border border-[#3b5a94] overflow-hidden">
          {NETS.map((n, i) => (
            <button
              key={n.key}
              onClick={() => setNet(n.key)}
              aria-pressed={net === n.key}
              className={`px-2.5 py-1 text-[11px] font-bold transition ${i > 0 ? 'border-l border-[#3b5a94]' : ''} ${
                net === n.key
                  ? (n.key === 'hwamul24' ? 'bg-[#c62828] text-white' : 'bg-blue-600 text-white')
                  : 'text-blue-200/70 hover:text-blue-100'
              }`}
            >
              {n.name}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">

        {/* 탭 — 어느 쪽 판인지 한 줄로 말한다 */}
        <div className="flex gap-1.5">
          <TabButton on={tab === 'scenario'} onClick={() => setTab('scenario')}
                     name="🎯 시나리오콜" hint="문제지가 정한 콜 · 채점된다" />
          <TabButton on={tab === 'random'} onClick={() => setTab('random')} muted
                     name="🎲 랜덤콜" hint="즉석 조합 · 채점 없음" />
        </div>

        {tab === 'scenario' ? (
          <>
            {/**
              * 🔴 **줄에는 제목과 문제 수만** (기사님 2026-09-11).
              *    전에는 고른 문제지의 설명 전문이 그 자리에서 펼쳐져 화면이 길어졌다.
              *    **고르는 것은 줄 전체, 내용을 보는 것은 ⓘ** — 덮개로 올라온다.
              */}
            <div>
              <SectionLabel>📋 문제지<span className="ml-auto font-normal text-slate-500">ⓘ 를 누르면 내용</span></SectionLabel>
              <div className="flex flex-col gap-1">
                {PRESET_MENU.map(m => (
                  <PresetRow
                    key={m.key}
                    title={m.title}
                    count={PRESETS[m.key]?.length ?? 0}
                    on={presetKey === m.key}
                    onPick={() => setPresetKey(m.key)}
                    onInfo={() => setVeil({
                      title: m.title,
                      body: <PresetDetail desc={m.desc} requires={PRESET_REQUIRES[m.key]} />,
                    })}
                  />
                ))}
              </div>
            </div>

            <Preflight presetKey={presetKey} onOpen={setVeil}
                       api={new URLSearchParams(window.location.search).get('api')
                            || `http://${window.location.hostname}:4000`} />

            <div>
              <SectionLabel>⏱ 콜 수신 간격</SectionLabel>
              <Chips
                options={INTERVAL_CHOICES.map(v => ({ label: `${v / 1000}초`, value: v }))}
                value={intervalMs} onChange={setIntervalMs}
              />
            </div>

            <div>
              <SectionLabel>🧱 채움 콜 수<span className="ml-auto font-normal text-slate-500">못 잡는 콜로 시간을 만든다</span></SectionLabel>
              <Chips
                options={FILLER_CHOICES.map(v => ({
                  label: v === 3 ? '3 🏠' : v === 20 ? '20 🚗' : String(v), value: v,
                }))}
                value={fillers} onChange={setFillers}
              />
            </div>

            {/* 🔁 되돌려 흘리기 — 주행이 문제지보다 길 때만 켠다 */}
            <button
              onClick={() => setLoop(v => !v)}
              aria-pressed={loop}
              className={`flex items-center gap-2 w-full rounded-lg border px-2.5 py-2 text-[11.5px] transition ${
                loop ? 'border-emerald-500 bg-emerald-600/15 text-emerald-300'
                     : 'border-slate-600 bg-slate-700/40 text-slate-300'
              }`}
            >
              <span>🔁 되돌려 흘리기</span>
              <span className={`ml-auto text-[10px] font-bold ${loop ? 'text-emerald-400' : 'text-slate-500'}`}>
                {loop ? 'ON' : 'OFF'}
              </span>
            </button>
          </>
        ) : (
          <>
            {/* 기사 현재 위치 — 랜덤콜에만 있다. 상차지를 이 자리 반경에서 고르기 때문 */}
            <div>
              <SectionLabel>📍 기사 현재 위치</SectionLabel>
              <select
                value={selectedPreset}
                onChange={e => setSelectedPreset(Number(e.target.value))}
                className="w-full bg-slate-700/60 text-slate-100 rounded-lg px-2.5 py-2 text-[12px] border border-slate-600 outline-none focus:border-blue-500"
              >
                {LOCATION_PRESETS.map((p, i) => (
                  <option key={p.name} value={i}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <SectionLabel>🎯 하차 목적지 방향</SectionLabel>
              <Chips tone="blue"
                options={TARGET_REGION_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                value={targetRegion} onChange={setTargetRegion}
              />
            </div>

            <div>
              <SectionLabel>📏 상차 반경</SectionLabel>
              <Chips tone="blue"
                options={PICKUP_KM_CHOICES.map(v => ({ label: `${v}km`, value: v }))}
                value={maxPickupKm} onChange={setMaxPickupKm}
              />
            </div>

            <div>
              <SectionLabel>💰 최소 요금</SectionLabel>
              <Chips tone="blue"
                options={MIN_FARE_CHOICES.map(v => ({ label: `${v / 10000}만`, value: v }))}
                value={minFare} onChange={setMinFare}
              />
            </div>

            <div>
              <SectionLabel>⏱ 콜 수신 간격</SectionLabel>
              <Chips
                options={INTERVAL_CHOICES.map(v => ({ label: `${v / 1000}초`, value: v }))}
                value={intervalMs} onChange={setIntervalMs}
              />
            </div>
          </>
        )}
      </div>

      {/* 시작 — 언제나 바닥에 붙어 있다 (스크롤해서 찾지 않는다) */}
      <div className="px-3 py-2.5 bg-slate-900/90 border-t border-slate-700/50">
        <button
          onClick={start}
          className={`w-full rounded-xl py-3 text-[14px] font-bold text-white shadow-lg transition active:scale-[0.98] ${
            net === 'hwamul24'
              ? 'bg-gradient-to-r from-[#c62828] to-[#8e1b1b] shadow-red-900/40'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-900/40'
          }`}
        >
          {netName} 화면으로 시작 →
        </button>
      </div>

      {veil && <Veil content={veil} onClose={() => setVeil(null)} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  부품
// ══════════════════════════════════════════════════════════════════

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5 text-[10.5px] font-bold text-slate-400">
      {children}
    </div>
  );
}

function TabButton({ on, muted, name, hint, onClick }: {
  on: boolean; muted?: boolean; name: string; hint: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex-1 text-left px-2.5 py-2 rounded-lg transition ${
        on ? (muted ? 'bg-slate-600 text-white' : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20')
           : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
      }`}
    >
      <span className="block text-[11.5px] font-bold">{name}</span>
      <span className={`block text-[9.5px] mt-px ${on ? 'text-blue-100' : 'text-slate-400'}`}>{hint}</span>
    </button>
  );
}

/**
 * 🔴 **손잡이는 칩 한 줄이다** (기사님 2026-09-11).
 * 슬라이더는 라벨·트랙·양끝 글자로 **세 줄**을 먹어 시작 버튼을 화면 밖으로 밀어냈다.
 * 달리는 중에 누르기도 칩이 낫다 — 정확히 그 값을 한 번에 짚는다.
 */
function Chips<T extends string | number>({ options, value, onChange, tone = 'amber' }: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (v: T) => void;
  tone?: 'amber' | 'blue';
}) {
  return (
    <div className="flex gap-1">
      {options.map(o => {
        const on = value === o.value;
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`flex-1 rounded-md border py-1.5 text-[11px] font-bold tabular-nums transition ${
              on
                ? (tone === 'blue' ? 'bg-blue-700 border-blue-500 text-white' : 'bg-amber-700 border-amber-500 text-white')
                : 'bg-slate-700/40 border-slate-600 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 문제지 한 줄 — 고르기(줄 전체)와 자세히(ⓘ)를 **가른다** */
function PresetRow({ title, count, on, onPick, onInfo }: {
  title: string; count: number; on: boolean; onPick: () => void; onInfo: () => void;
}) {
  /**
   * 🔴 **날짜를 제목에서 떼어 낸다** — 제목 끝의 `(2026-09-06)` 때문에 정작 무슨 문제인지가
   *    «...»로 잘렸다. 날짜는 «언제 만든 판인가»라 덮개로 물러서도 된다.
   * ⚠️ 쓰는 쪽(`presets.ts`)은 안 고친다 — 거기 제목은 커밋·문서와 함께 쓰는 이름이다.
   */
  const short = title.replace(/\s*\(\d{4}-\d{2}-\d{2}[^)]*\)\s*$/, '');
  return (
    <div className={`flex items-center rounded-lg border overflow-hidden transition ${
      on ? 'border-blue-500 bg-blue-600/20' : 'border-slate-600 bg-slate-700/40'
    }`}>
      <button onClick={onPick} aria-pressed={on}
              className="flex-1 min-w-0 flex items-center gap-2 pl-2.5 py-2 text-left">
        <span className={`text-[11px] shrink-0 ${on ? 'text-blue-400' : 'text-slate-500'}`}>{on ? '●' : '○'}</span>
        <span className={`truncate text-[12px] font-bold ${on ? 'text-blue-200' : 'text-slate-200'}`}>{short}</span>
      </button>
      <span className="shrink-0 px-2 text-[10px] text-slate-400 tabular-nums">{count}문제</span>
      <button onClick={onInfo} aria-label={`${short} 자세히`}
              className="shrink-0 self-stretch w-8 border-l border-slate-600 bg-slate-800/50 text-[12px] text-slate-400 hover:bg-slate-700 hover:text-slate-100">
        ⓘ
      </button>
    </div>
  );
}

/**
 * 📝 **`**굵게**` 를 진짜 굵게** (2026-09-11).
 * 문제지 설명은 커밋 메시지처럼 마크다운으로 적혀 있는데 화면이 글자 그대로 찍으면
 * `**오직 지도만 본다**` 가 별 네 개를 달고 나온다. 쓰는 쪽(`presets.ts`)은 안 고친다 —
 * 그 글은 기사님이 읽는 문제 설명이고 강조가 뜻을 나른다. **읽는 쪽이 제대로 그린다.**
 */
function Marked({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <b key={i} className="text-slate-100">{part.slice(2, -2)}</b>
          : <span key={i}>{part}</span>)}
    </>
  );
}

/** 문제지 자세히 — 「차리기」(요구 상태)를 먼저, 설명을 그다음에 */
function PresetDetail({ desc, requires }: { desc: string; requires?: PresetRequires }) {
  const setup: Array<[string, string]> = [];
  if (requires?.destinationCity) setup.push(['도착 목표', requires.destinationCity]);
  if (requires?.destinationRadiusKm != null) setup.push(['하차 주변', `${requires.destinationRadiusKm}km`]);
  if (requires?.homeAddress) setup.push(['내 주소', requires.homeAddress]);
  if (requires?.firstLoadOnly) setup.push(['판', '첫짐 · 활성 콜 0건']);
  if (requires?.mapSido?.length) setup.push(['지도', `시도 ${requires.mapSido.join('·')} 포함`]);

  return (
    <div className="text-[11px] leading-relaxed text-slate-400 flex flex-col gap-2">
      {setup.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {setup.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="w-14 shrink-0 text-slate-500">{k}</span>
              <span className="text-slate-200 font-bold">{v}</span>
            </div>
          ))}
        </div>
      )}
      <div><Marked text={desc} /></div>
    </div>
  );
}

/**
 * 🫧 **덮개 — 긴 글은 화면을 밀어내지 않는다** (기사님 2026-09-11).
 * 문제지 자세히와 판 점검이 **같은 문법**을 쓴다. 스크롤 없이 시작까지 가려면
 * «펼치면 길어지는 것»이 화면 안에 있으면 안 된다.
 */
function Veil({ content, onClose }: { content: VeilContent; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-slate-950/75"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true"
           className="w-full max-h-[76%] overflow-y-auto rounded-t-2xl border-t border-slate-600 bg-slate-800 p-3.5">
        <div className="flex items-start gap-2 mb-2">
          <div className="text-[12.5px] font-bold text-slate-100 leading-snug">{content.title}</div>
          <button onClick={onClose}
                  className="ml-auto shrink-0 rounded-md border border-slate-600 bg-slate-700 px-2 py-0.5 text-[10.5px] text-slate-200">
            닫기
          </button>
        </div>
        {content.body}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  🧪 판 점검 — «지금 이 문제지를 채점할 수 있는 상태인가» (기사님 지시 2026-09-06)
// ══════════════════════════════════════════════════════════════════
/**
 * 기사님: *"뭐가 우리 테스트에 가장 큰 문제야?"*
 * 그날 콜이 안 올라온 것이 **일곱 번**인데 **단 한 번도 «우리가 옳게 걸렀다»가 아니었다.**
 * 전부 판이 오염돼 있었다 — 현위치가 딴 데고, 재기동마다 도착 목표가 옛 값으로 돌아가고,
 * 취소했는데 필터가 합짐 모드에 남았고, `tsx watch` 가 못 잡아 옛 코드가 돌았다.
 *
 * 🔴 **콜이 안 올라오면 둘 중 하나인데 구분할 방법이 없었다:**
 *      ㉮ 우리 시스템이 옳게 걸렀다 (채점 결과)   ㉯ 판이 오염됐다 (잡음)
 *    매번 ㉯였고, 알아내는 데 판마다 20~30분이 갔다.
 *
 * 🔴 **화면에는 한 줄만 산다** (2026-09-11) — 다섯 줄을 늘 펴 두면 시작 버튼이 밀려난다.
 *    어긋난 것이 있으면 그 줄이 빨간불이 되고, 무엇이 어긋났는지는 ⓘ 로 연다.
 */
interface PreflightState {
    destinationCity: string | null;
    destinationRadiusKm: number | null;
    homeAddress: string | null;
    isSharedMode: boolean;
    activeCalls: number;
    bootedAt: string | null;
    map?: { features?: number; sido?: string[] };
}

interface PreflightRow { what: string; want: string; got: string; ok: boolean }

function Preflight({ presetKey, api, onOpen }: {
  presetKey: string; api: string; onOpen: (v: VeilContent) => void;
}) {
  const req = PRESET_REQUIRES[presetKey];
  const [now, setNow] = useState<PreflightState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!req) return;
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch(`${api}/api/sim/preflight`);
        const d = await r.json();
        if (!alive) return;
        if (d?.ok) { setNow(d as PreflightState); setErr(null); }
        else setErr(d?.reason || '서버가 답하지 않습니다');
      } catch { if (alive) setErr('서버(4000)에 못 닿습니다'); }
    };
    pull();
    const t = setInterval(pull, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [req, api, presetKey]);

  // 문제지가 요구하는 상태가 없으면 «아무 상태에서나 돈다»는 뜻이다 — 줄도 없다
  if (!req) return null;

  /** 한 줄 = 「무엇이 · 무엇이어야 하고 · 지금 무엇인가」 */
  const rows: PreflightRow[] = [];
  if (now) {
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
    if (req.firstLoadOnly) rows.push({
      what: '판', want: '첫짐 · 활성 콜 0건',
      got: `${now.isSharedMode ? '합짐' : '첫짐'} · ${now.activeCalls}건`,
      ok: !now.isSharedMode && now.activeCalls === 0,
    });
    if (req.mapSido?.length) {
      const have: string[] = now.map?.sido ?? [];
      const miss = req.mapSido.filter(c => !have.includes(c));
      rows.push({
        what: '지도', want: `시도 ${req.mapSido.join('·')} 포함`,
        got: `동 ${now.map?.features ?? '?'}개`, ok: miss.length === 0,
      });
    }
    // 🔴 「고친 코드가 도는가」의 유일한 답이 bootedAt 이다 (루트 CLAUDE.md)
    rows.push({
      what: '서버 기동', want: '고친 뒤에 뜬 것', got: String(now.bootedAt ?? '').slice(11, 19), ok: true,
    });
  }

  const bad = rows.filter(r => !r.ok);
  const tone = err ? 'border-amber-600/70 bg-amber-950/30 text-amber-300'
                   : bad.length ? 'border-red-600/70 bg-red-950/30 text-red-300'
                                : 'border-emerald-600/60 bg-emerald-950/25 text-emerald-300';
  const summary = err ? err
    : !now ? '서버에 묻는 중…'
    : bad.length ? `${bad.length}개가 어긋났다 — 이대로면 채점이 아니라 잡음입니다`
    : rows.filter(r => r.what !== '서버 기동').map(r => r.got).join(' · ');

  return (
    <button
      onClick={() => onOpen({
        title: '🧪 판 점검 — 지금 채점할 수 있는 상태인가',
        body: (
          <div className="text-[11px] leading-relaxed flex flex-col gap-0.5">
            {err && <div className="text-amber-300">{err}</div>}
            {!err && !now && <div className="text-slate-400">서버에 묻는 중…</div>}
            {rows.map(r => (
              <div key={r.what} className="flex gap-2">
                <span className="w-14 shrink-0 text-slate-500">{r.what}</span>
                <span className="shrink-0">{r.ok ? '✅' : '🔴'}</span>
                <span className={r.ok ? 'text-slate-300' : 'text-red-300'}>
                  {r.ok ? r.got : <>지금 <b>{r.got}</b> · <span className="text-slate-400">{r.want} 여야 한다</span></>}
                </span>
              </div>
            ))}
          </div>
        ),
      })}
      className={`flex items-center gap-2 w-full rounded-lg border px-2.5 py-2 text-[11px] text-left ${tone}`}
    >
      <span className="shrink-0 font-bold">
        {err ? '⚠️ 판 점검' : bad.length ? '🔴 판이 안 맞습니다' : '✅ 판이 맞습니다'}
      </span>
      <span className="ml-auto truncate text-[10px] text-slate-400">{summary}</span>
      <span className="shrink-0 text-slate-500">ⓘ</span>
    </button>
  );
}
