/**
 * 인성 시뮬레이터 설정 페이지 (/inseong)
 * 
 * 시뮬레이션 시작 전 기사 현위치, 목적지 방향, 반경, 최소요금을 설정합니다.
 * GameContext 의존성 없음.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// 주요 시/군/구 프리셋 (mockLocationData.json 기반)
const LOCATION_PRESETS = [
  { name: '경기 광주시', lon: 127.2553, lat: 37.4095 },
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

  const [selectedPreset, setSelectedPreset] = useState(0);
  const [maxPickupKm, setMaxPickupKm] = useState(15);
  const [minFare, setMinFare] = useState(30000);
  const [targetRegion, setTargetRegion] = useState('');
  const [intervalMs, setIntervalMs] = useState(5000);

  const handleStart = () => {
    const preset = LOCATION_PRESETS[selectedPreset];
    const params = new URLSearchParams({
      lon: preset.lon.toString(),
      lat: preset.lat.toString(),
      name: preset.name,
      maxKm: maxPickupKm.toString(),
      minFare: minFare.toString(),
      target: targetRegion,
      interval: intervalMs.toString()
    });
    navigate(`/inseong/dispatch?${params.toString()}`);
  };

  return (
    <div className="w-full h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
          <h1 className="text-white text-xl font-bold tracking-tight">🚚 배차 시뮬레이터</h1>
          <p className="text-blue-200 text-sm mt-1">시뮬레이션 환경을 설정하세요</p>
        </div>

        <div className="p-6 space-y-5">
          {/* 현재 위치 */}
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
              type="range"
              min={5}
              max={50}
              step={5}
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
              type="range"
              min={10000}
              max={100000}
              step={5000}
              value={minFare}
              onChange={e => setMinFare(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>1만원</span><span>10만원</span>
            </div>
          </div>

          {/* 콜 수신 간격 */}
          <div>
            <label className="block text-slate-300 text-sm font-semibold mb-2">
              ⏱ 콜 수신 간격: <span className="text-amber-400">{(intervalMs / 1000).toFixed(0)}초</span>
            </label>
            <input
              type="range"
              min={2000}
              max={15000}
              step={1000}
              value={intervalMs}
              onChange={e => setIntervalMs(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>2초</span><span>15초</span>
            </div>
          </div>

          {/* 시작 버튼 */}
          <button
            onClick={handleStart}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-4 rounded-xl text-lg shadow-lg shadow-blue-600/30 hover:shadow-xl hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all"
          >
            시뮬레이션 시작 →
          </button>
        </div>
      </div>
    </div>
  );
}
