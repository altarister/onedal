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
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRESET_MENU, PRESETS, PRESET_REQUIRES } from '@altari/core-simulator';

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
  /**
   * ⏱ 기본 10초 (기사님 확정 2026-08-25).
   * 앱은 한 번에 콜 하나만 평가하고(`isHolding`) 그동안 리스트를 안 읽는다 —
   * 한 콜을 잡는 데 상세 진입·확정·적요까지 **약 12초**가 걸린다 (2026-08-25 실측).
   * 5초로 두면 처리하는 사이 다음 문제가 지나가 **평가조차 안 된다.**
   */
  const [intervalMs, setIntervalMs] = useState(10000);
  /**
   * 🧱 **채움 콜 수** — 시간을 만드는 «못 잡는 콜»을 몇 개나 흘릴지 (기사님 확정 2026-08-26).
   * 잡는 콜과 국면 전용 축은 여기서 안 줄어든다. 집 3개 · 차 20개.
   */
  // 채움 콜 수 기본 0 — 기사님 확정 2026-08-30. 필요할 때만 올린다
  const [fillers, setFillers] = useState(0);

  // ── 랜덤콜 ──
  const [maxPickupKm, setMaxPickupKm] = useState(15);
  const [minFare, setMinFare] = useState(30000);
  const [targetRegion, setTargetRegion] = useState('');

  // ── 시나리오콜 ──
  const [presetKey, setPresetKey] = useState(PRESET_MENU[0]?.key ?? '여주');
  // 🔁 기본 꺼짐 (기사님 확정 2026-08-25) — 한 바퀴만 돌려야 무엇을 놓쳤는지 셀 수 있다.
  //    켜 두면 놓친 문제가 다음 바퀴에 다시 와서 «놓쳤다»가 안 보인다.
  const [loop, setLoop] = useState(false);

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
      fillers: fillers.toString(),
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

  /**
   * 🔴 `items-center` 를 뺐다 — 가운데로 모으면 카드가 창보다 길 때 **위가 잘린다.**
   *    그리고 `overflow-hidden` 은 **sticky 를 죽인다** (자르는 상자 안에서는 못 붙는다).
   */
  return (
    <div className="w-full min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex justify-center p-4">
      <div className="w-full max-w-md self-start bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50">
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
                        {/**
                          * 🔴 **닫히면 한 줄, 고르면 전부** (기사님 2026-09-11: *"엄청 스크롤을
                          *    해야 하고 문제도 정확히 뽑기 어렵다"*).
                          *
                          * 전에는 **여덟 문제지가 전부 설명 전문을 펴 두어** 설정 화면이
                          * 폰 넉 장(2599px)이었다. 고르려면 긴 글 여덟 덩이를 지나쳐야 했고,
                          * 「문제지 시작」은 맨 아래라 매번 끝까지 스크롤해야 했다.
                          *
                          * 기사님이 목업에서 정하신 문법 그대로다 —
                          * *"결과물을 첫 줄만 보여 주고 클릭하면 다"* (2026-09-09).
                          */}
                        <div className="flex items-center gap-2">
                          {/**
                            * 🔴 **날짜를 제목에서 떼어 낸다** — 제목 끝의 `(2026-09-06)` 때문에
                            *    정작 **무슨 문제인지가 «...»로 잘렸다** (기사님: *"문제도 정확히
                            *    뽑기 어렵다"*). 날짜는 «언제 만든 판인가»라 뒤로 물러서도 된다.
                            * ⚠️ 쓰는 쪽(`presets.ts`)은 안 고친다 — 거기 제목은 커밋·문서와 함께 쓰는
                            *    이름이다. **읽는 쪽이 갈라서 그린다** (`Desc` 와 같은 원칙).
                            */}
                          <span className={`text-[13px] font-bold truncate ${on ? 'text-blue-300' : 'text-slate-200'}`}>
                            {m.title.replace(/\s*\(\d{4}-\d{2}-\d{2}[^)]*\)\s*$/, '')}
                          </span>
                          <span className="ml-auto text-[11px] text-slate-400 flex-shrink-0">{count}문제</span>
                          {/* 🔴 고른 것이 **한눈에** 보여야 한다 — 테두리 색만으로는 여덟 중에서 안 띈다 */}
                          <span className={`text-[11px] font-black flex-shrink-0 ${on ? 'text-blue-400' : 'text-slate-600'}`}>
                            {on ? '●' : '○'}
                          </span>
                        </div>
                        {on && (
                          <>
                            {/* 떼어 낸 날짜는 펼쳤을 때 여기서 말한다 — 없애지 않는다 */}
                            {(m.title.match(/\((\d{4}-\d{2}-\d{2}[^)]*)\)\s*$/) || [])[1] &&
                              <div className="text-[10px] text-slate-500 mt-1">
                                🗓 {(m.title.match(/\((\d{4}-\d{2}-\d{2}[^)]*)\)\s*$/) || [])[1]}
                              </div>}
                            <Desc text={m.desc} />
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 🧪 판 점검 — 고른 문제지가 요구하는 상태와 지금을 대조한다 (2026-09-06) */}
              <Preflight presetKey={presetKey}
                         api={new URLSearchParams(window.location.search).get('api')
                              || `http://${window.location.hostname}:4000`} />

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
              type="range" min={5000} max={60000} step={5000}
              value={intervalMs}
              onChange={e => setIntervalMs(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>5초</span><span>60초</span>
            </div>
          </div>

          {/* 🧱 채움 콜 수 — 시나리오 탭 전용 */}
          {tab === 'scenario' && (
            <div>
              <label className="block text-slate-300 text-sm font-semibold mb-2">
                🧱 채움 콜 수: <span className="text-amber-400">{fillers}개</span>
                <span className="ml-2 text-xs text-slate-500">
                  ≈ 출발 후 {(((fillers + 1) * intervalMs) / 1000).toFixed(0)}초 뒤 주행중 합짐
                </span>
              </label>
              <input
                type="range" min={0} max={20} step={1}
                value={fillers}
                onChange={e => setFillers(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>0개</span><span>🏠 집 3</span><span>🚗 차 20</span>
              </div>
              {/* 🔴 잡는 콜은 안 줄어든다 — 줄여도 시나리오가 안 깨지는 것이 요점이다 */}
              <p className="mt-2 text-xs text-slate-500">
                못 잡는 «채움» 콜만 줄입니다. 첫짐·합짐·주행중 합짐과 국면 전용 축은 그대로 남습니다.
              </p>
            </div>
          )}

        </div>

        {/**
          * 🔴 **시작 버튼은 아래에 붙어 있다** (기사님 2026-09-11: *"엄청 스크롤을 해야 하고"*).
          *    전에는 설정 맨 끝이라 **고칠 때마다 바닥까지 스크롤**해야 눌렀다.
          *    이제 위에서 문제지를 고르고 **그 자리에서 바로** 시작한다.
          */}
        <div className="sticky bottom-0 px-6 py-3 bg-slate-800/95 backdrop-blur-xl border-t border-slate-700/50">
          <button
            onClick={tab === 'scenario' ? handleStartScenario : handleStartRandom}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl text-base shadow-lg shadow-blue-600/30 hover:shadow-xl hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all"
          >
            {tab === 'scenario' ? '문제지 시작 →' : '시뮬레이션 시작 →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 🧪 **판 점검 — «지금 이 문제지를 채점할 수 있는 상태인가»** (기사님 지시 2026-09-06)
 *
 * 기사님: *"뭐가 우리 테스트에 가장 큰 문제야?"*
 * 그날 콜이 안 올라온 것이 **일곱 번**인데 **단 한 번도 «우리가 옳게 걸렀다»가 아니었다.**
 * 전부 판이 오염돼 있었다 — 현위치가 딴 데고, 재기동마다 도착 목표가 옛 값으로 돌아가고,
 * 취소했는데 필터가 합짐 모드에 남았고, `tsx watch` 가 못 잡아 옛 코드가 돌았다.
 *
 * 🔴 **콜이 안 올라오면 둘 중 하나인데 구분할 방법이 없었다:**
 *      ㉮ 우리 시스템이 옳게 걸렀다 (채점 결과)   ㉯ 판이 오염됐다 (잡음)
 *    매번 ㉯였고, 알아내는 데 판마다 20~30분이 갔다.
 *
 * 문제지 설명에 *"도착 목표를 «인천»으로"* 라고 **글로만** 적혀 있던 것을
 * **기계가 대조**하게 한다. `pnpm preflight` 는 «비우기»고 이건 «맞는가»다.
 */
/**
 * 📝 **`**굵게**` 를 진짜 굵게** (2026-09-11).
 *
 * 🔴 문제지 설명은 커밋 메시지처럼 마크다운으로 적혀 있는데 화면이 **글자 그대로** 찍었다 —
 *    `**오직 지도만 본다**` 가 별 네 개를 달고 나왔다. 읽는 속도를 그만큼 깎는다.
 *    쓰는 쪽(`presets.ts`)을 고치지 않는다 — 그 글은 **기사님이 읽는 문제 설명**이고
 *    강조가 뜻을 나른다. 읽는 쪽이 제대로 그리면 된다.
 */
function Desc({ text }: { text: string }) {
    return (
        <div className="text-[11px] text-slate-400 mt-1.5 leading-snug">
            {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                part.startsWith('**') && part.endsWith('**')
                    ? <b key={i} className="text-slate-200">{part.slice(2, -2)}</b>
                    : <span key={i}>{part}</span>)}
        </div>
    );
}

function Preflight({ presetKey, api }: { presetKey: string; api: string }) {
    const req = PRESET_REQUIRES[presetKey];
    const [now, setNow] = useState<any>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!req) return;
        let alive = true;
        const pull = async () => {
            try {
                const r = await fetch(`${api}/api/sim/preflight`);
                const d = await r.json();
                if (!alive) return;
                if (d?.ok) { setNow(d); setErr(null); }
                else setErr(d?.reason || '서버가 답하지 않습니다');
            } catch { if (alive) setErr('서버(4000)에 못 닿습니다'); }
        };
        pull();
        const t = setInterval(pull, 4000);
        return () => { alive = false; clearInterval(t); };
    }, [req, api, presetKey]);

    if (!req) return null;

    /** 한 줄 = 「무엇이 · 무엇이어야 하고 · 지금 무엇인가」 */
    const rows: Array<{ what: string; want: string; got: string; ok: boolean }> = [];
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
        // 🔴 오늘 두 번 당했다 — tsx watch 가 변경을 놓쳐 옛 코드가 돌았다.
        //    「고친 코드가 도는가」의 유일한 답이 bootedAt 이다 (루트 CLAUDE.md).
        rows.push({
            what: '서버 기동', want: '고친 뒤에 뜬 것', got: String(now.bootedAt ?? '').slice(11, 19),
            ok: true,
        });
    }

    const bad = rows.filter(r => !r.ok);
    return (
        <div className={`rounded-lg border p-3 text-[11px] leading-relaxed ${
            err ? 'border-amber-600 bg-amber-950/30'
                : bad.length ? 'border-red-600 bg-red-950/30' : 'border-emerald-700 bg-emerald-950/20'}`}>
            <div className="font-bold mb-1.5 text-[12px]">
                {err ? `⚠️ 판 점검 — ${err}`
                     : bad.length ? `🔴 판이 안 맞습니다 (${bad.length}개) — 이대로 돌리면 채점이 아니라 잡음입니다`
                                  : '✅ 판이 맞습니다 — 채점해도 됩니다'}
            </div>
            {!err && rows.map(r => (
                <div key={r.what} className="flex gap-1.5">
                    <span className="w-14 shrink-0 text-slate-400">{r.what}</span>
                    <span className="shrink-0">{r.ok ? '✅' : '🔴'}</span>
                    <span className={r.ok ? 'text-slate-300' : 'text-red-300'}>
                        {r.ok ? r.got : <>지금 <b>{r.got}</b> · <span className="text-slate-400">{r.want} 여야 한다</span></>}
                    </span>
                </div>
            ))}
            {!err && !now && <div className="text-slate-400">서버에 묻는 중…</div>}
        </div>
    );
}
