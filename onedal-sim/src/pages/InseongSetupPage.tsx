/**
 * 인성 시뮬레이터 설정 페이지 (/inseong)
 *
 * 시뮬레이션 시작 전 환경을 설정한다. GameContext 의존성 없음.
 *
 * 🔴 **탭이 둘이다** (기사님 2026-08-24):
 *   · **랜덤콜**   — 주소 사전에서 즉석 조합. 지금까지 하던 그대로다
 *   · **시나리오콜** — 정해진 문제지를 순서대로 흘린다. 채점이 되는 쪽이다
 *
 * 시나리오 탭이 생긴 이유: 문제지는 `?preset=` 쿼리로만 들어갈 수 있어서
 * **설정 화면을 거치면 날아갔다.** 그래서 폰에서 주소를 손으로 쳐야 했고,
 * 2026-08-23 주행에서 실제로 그것 때문에 문제지가 중간에 랜덤으로 바뀌었다.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRESET_MENU, PRESETS } from '@altari/core-simulator';

// 주요 시/군/구 프리셋 (mockLocationData.json 기반)
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

export function InseongSetupPage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<'random' | 'scenario'>('scenario');

  // ── 공통 ──
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [intervalMs, setIntervalMs] = useState(5000);

  // ── 랜덤콜 ──
  const [maxPickupKm, setMaxPickupKm] = useState(15);
  const [minFare, setMinFare] = useState(30000);
  const [targetRegion, setTargetRegion] = useState('');

  // ── 시나리오콜 ──
  const [presetKey, setPresetKey] = useState(PRESET_MENU[0]?.key ?? '여주');
  const [loop, setLoop] = useState(true);

  const location = LOCATION_PRESETS[selectedPreset];

  const handleStartRandom = () => {
    const params = new URLSearchParams({
      lon: location.lon.toString(),
      lat: location.lat.toString(),
      name: location.name,
      maxKm: maxPickupKm.toString(),
      minFare: minFare.toString(),
      target: targetRegion,
      interval: intervalMs.toString(),
    });
    navigate(`/inseong/dispatch?${params.toString()}`);
  };

  /**
   * 🎯 문제지는 상차·하차·요금이 **전부 고정**이라 넘길 것이 셋뿐이다.
   *    기사 위치·반경·최소요금은 넘기지 않는다 — 콜을 고르는 데 안 쓰이므로
   *    화면에 두면 «이게 판정에 영향을 준다»는 오해만 만든다 (기사님 2026-08-24).
   */
  const handleStartScenario = () => {
    const params = new URLSearchParams({
      preset: presetKey,
      loop: loop ? '1' : '0',
      interval: intervalMs.toString(),
    });
    navigate(`/inseong/dispatch?${params.toString()}`);
  };

  const tabBtn = (key: 'random' | 'scenario', label: string, hint: string) => (
    <button
      onClick={() => setTab(key)}
      className={`flex-1 py-3 px-2 rounded-lg transition text-left ${
        tab === key
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
          : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
      }`}
    >
      <div className="text-sm font-bold">{label}</div>
      <div className={`text-[11px] mt-0.5 ${tab === key ? 'text-blue-100' : 'text-slate-400'}`}>{hint}</div>
    </button>
  );

  return (
    <div className="w-full min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
          <h1 className="text-white text-xl font-bold tracking-tight">🚚 배차 시뮬레이터</h1>
          <p className="text-blue-200 text-sm mt-1">시뮬레이션 환경을 설정하세요</p>
        </div>

        <div className="p-6 space-y-5">
          {/* 탭 */}
          <div className="flex gap-2">
            {tabBtn('scenario', '🎯 시나리오콜', '정해진 문제지 · 채점됨')}
            {tabBtn('random', '🎲 랜덤콜', '즉석 조합 · 지금까지 하던 것')}
          </div>

          {/* ═══ 시나리오콜 ═══ */}
          {tab === 'scenario' && (
            <>
              <div>
                <label className="block text-slate-300 text-sm font-semibold mb-2">📋 문제지</label>
                <div className="space-y-2">
                  {PRESET_MENU.map(m => {
                    const count = PRESETS[m.key]?.length ?? 0;
                    const on = presetKey === m.key;
                    return (
                      <button
                        key={m.key}
                        onClick={() => setPresetKey(m.key)}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                          on
                            ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-600/10'
                            : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-bold ${on ? 'text-blue-300' : 'text-slate-200'}`}>
                            {m.title}
                          </span>
                          <span className="text-[11px] text-slate-400 flex-shrink-0">{count}문제</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 leading-snug">{m.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 되돌려 흘리기 */}
              <button
                onClick={() => setLoop(v => !v)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition ${
                  loop ? 'bg-emerald-600/20 border-emerald-500' : 'bg-slate-700/50 border-slate-600'
                }`}
              >
                <div className="text-left">
                  <div className={`text-sm font-semibold ${loop ? 'text-emerald-300' : 'text-slate-300'}`}>
                    🔁 되돌려 흘리기
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    다 내면 처음으로 — 주행이 문제지보다 길 때 켠다
                  </div>
                </div>
                <span className={`text-xs font-bold ${loop ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {loop ? 'ON' : 'OFF'}
                </span>
              </button>
            </>
          )}

          {/* ═══ 랜덤콜 ═══ */}
          {tab === 'random' && (
            <>
              {/* 기사 현재 위치 — 랜덤콜에만 있다. 상차지를 이 자리 반경에서 고르기 때문 */}
              <div>
                <label className="block text-slate-300 text-sm font-semibold mb-2">📍 기사 현재 위치</label>
                <select
                  value={selectedPreset}
                  onChange={e => setSelectedPreset(Number(e.target.value))}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                >
                  {LOCATION_PRESETS.map((p, i) => (
                    <option key={i} value={i}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* 하차 목적지 방향 */}
              <div>
                <label className="block text-slate-300 text-sm font-semibold mb-2">🎯 하차 목적지 방향</label>
                <div className="grid grid-cols-4 gap-2">
                  {TARGET_REGION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setTargetRegion(opt.value)}
                      className={`py-2 rounded-lg text-sm font-medium transition ${
                        targetRegion === opt.value
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 상차 반경 */}
              <div>
                <label className="block text-slate-300 text-sm font-semibold mb-2">
                  📏 상차 반경: <span className="text-blue-400">{maxPickupKm}km</span>
                </label>
                <input
                  type="range" min={5} max={50} step={5}
                  value={maxPickupKm}
                  onChange={e => setMaxPickupKm(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>5km</span><span>50km</span>
                </div>
              </div>

              {/* 최소 요금 */}
              <div>
                <label className="block text-slate-300 text-sm font-semibold mb-2">
                  💰 최소 요금: <span className="text-emerald-400">{(minFare / 10000).toFixed(1)}만원</span>
                </label>
                <input
                  type="range" min={10000} max={100000} step={5000}
                  value={minFare}
                  onChange={e => setMinFare(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>1만원</span><span>10만원</span>
                </div>
              </div>
            </>
          )}

          {/* 콜 수신 간격 — 두 탭 공통 */}
          <div>
            <label className="block text-slate-300 text-sm font-semibold mb-2">
              ⏱ 콜 수신 간격: <span className="text-amber-400">{(intervalMs / 1000).toFixed(0)}초</span>
            </label>
            <input
              type="range" min={2000} max={30000} step={1000}
              value={intervalMs}
              onChange={e => setIntervalMs(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>2초</span><span>30초</span>
            </div>
          </div>

          {/* 시작 */}
          <button
            onClick={tab === 'scenario' ? handleStartScenario : handleStartRandom}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-4 rounded-xl text-lg shadow-lg shadow-blue-600/30 hover:shadow-xl hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all"
          >
            {tab === 'scenario' ? '문제지 시작 →' : '시뮬레이션 시작 →'}
          </button>
        </div>
      </div>
    </div>
  );
}
