import { useState, useEffect } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";

interface OrderFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function OrderFilterModal({ isOpen, onClose }: OrderFilterModalProps) {
    const { filter, updateFilter } = useFilterConfig();

    // 이 페이지는 폼 역할이므로 로컬 state로 관리 후 저장 시 소켓 발송
    const [minFare, setMinFare] = useState<string>("");
    const [pickupRadius, setPickupRadius] = useState<string>("");
    const [targetCity, setTargetCity] = useState<string>("");
    const [targetRadius, setTargetRadius] = useState<string>("");
    const [blacklist, setBlacklist] = useState<string>("");

    // 모달이 열릴 때마다 중앙 통제값으로 로컬 폼 상태 초기화
    useEffect(() => {
        if (isOpen && filter) {
            setMinFare(filter.minFare?.toString() || "");
            setPickupRadius(filter.pickupRadius?.toString() || "");
            setTargetCity(filter.targetCity || "");
            setTargetRadius(filter.targetRadius?.toString() || "");
            setBlacklist(Array.isArray(filter.blacklist) ? filter.blacklist.join(', ') : (filter.blacklist || ""));
        }
    }, [isOpen, filter]);

    if (!isOpen) return null;

    if (!filter) {
        return (
            <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-indigo-400 font-bold animate-pulse">동기화 대기 중...</span>
                </div>
            </div>
        );
    }

    const handleSave = () => {
        updateFilter({
            minFare: minFare ? parseInt(minFare, 10) : filter.minFare,
            pickupRadius: pickupRadius ? parseInt(pickupRadius, 10) : filter.pickupRadius,
            targetCity: targetCity || filter.targetCity,
            targetRadius: targetRadius ? parseInt(targetRadius, 10) : filter.targetRadius,
            blacklist: blacklist ? blacklist.split(',').map(s => s.trim()).filter(Boolean) : filter.blacklist
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            {/* 배경 은은한 느낌을 위해 모달창 주변 래퍼 */}
            <div className="w-full max-w-lg relative bg-[#070b14] border border-slate-700/50 rounded-2xl shadow-2xl p-5 overflow-hidden flex flex-col">
                {/* 모달 내부 자체 효과 */}
                <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-indigo-900/20 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-emerald-900/20 blur-[100px] rounded-full pointer-events-none" />

                {/* 헤더 바 */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-500/20 relative z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex border items-center justify-center rounded-full bg-slate-900/80 border-slate-700/50 text-slate-400 hover:text-white hover:border-indigo-400 hover:bg-indigo-900/40 transition-all shadow-lg active:scale-90"
                        >
                            ✕
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-emerald-300 tracking-tight">
                                통제 필터 설정
                            </h1>
                            <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase mt-0.5">Active Node</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-center px-2 py-1 rounded bg-indigo-950/40 border border-indigo-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                        <span className="text-[10px] font-bold text-indigo-300">ONLINE</span>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* 단가 및 거리 필터 (가로 배치) */}
                    <div className="flex gap-4">
                        {/* 하한가 */}
                        <div className="flex-1 group bg-slate-900/40 backdrop-blur-md p-3 rounded-xl border border-slate-800/60 shadow-lg hover:border-emerald-500/40 transition-colors">
                            <label className="text-[11px] font-black text-slate-400 tracking-wider flex items-center gap-1.5 mb-2">
                                <span className="text-emerald-400">💵</span> 하한가
                            </label>
                            <div className="relative flex items-center mb-1">
                                <input
                                    type="number"
                                    defaultValue={filter.minFare}
                                    onChange={(e) => setMinFare(e.target.value)}
                                    className="w-full bg-black/60 border border-slate-700/50 rounded-lg p-2.5 pr-10 text-xl text-emerald-300 font-black outline-none focus:bg-emerald-950/20 focus:border-emerald-400/60 transition-all font-mono tracking-tighter shadow-inner"
                                />
                                <span className="absolute right-2.5 text-[10px] text-emerald-500/70 font-bold pointer-events-none">원</span>
                            </div>
                        </div>

                        {/* 상차 거리 */}
                        <div className="flex-1 group bg-slate-900/40 backdrop-blur-md p-3 rounded-xl border border-slate-800/60 shadow-lg hover:border-indigo-500/40 transition-colors">
                            <label className="text-[11px] font-black text-slate-400 tracking-wider flex items-center gap-1.5 mb-2">
                                <span className="text-indigo-400">📍</span> 상차 반경
                            </label>
                            <div className="relative flex items-center mb-1">
                                <input
                                    type="number"
                                    defaultValue={filter.pickupRadius}
                                    onChange={(e) => setPickupRadius(e.target.value)}
                                    className="w-full bg-black/60 border border-slate-700/50 rounded-lg p-2.5 pr-10 text-xl text-white font-bold outline-none focus:bg-indigo-950/20 focus:border-indigo-400/60 transition-all shadow-inner"
                                />
                                <span className="absolute right-2.5 text-[10px] text-slate-500 font-bold pointer-events-none">KM</span>
                            </div>
                        </div>
                    </div>

                    {/* 하차 목표 전략 (가로 배치) */}
                    <div className="bg-gradient-to-br from-slate-900/60 to-[#0e1424]/80 backdrop-blur-md p-4 rounded-xl border border-slate-700/50 shadow-lg">
                        <div className="flex items-center gap-1.5 mb-3">
                            <span className="text-sm">🎯</span>
                            <h2 className="text-[12px] font-black text-white tracking-widest">하차 거점 전략</h2>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 pl-1">공략 시/군 단위</label>
                                <select
                                    value={targetCity || filter.targetCity}
                                    onChange={(e) => setTargetCity(e.target.value)}
                                    className="w-full bg-black/50 border border-slate-600/40 rounded-lg p-2.5 text-[15px] text-indigo-300 font-bold outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50 transition-all shadow-inner appearance-none"
                                >
                                    <option value="용인시">용인시</option>
                                    <option value="수원시">수원시</option>
                                    <option value="성남시">성남시</option>
                                    <option value="화성시">화성시</option>
                                    <option value="광주시">광주시</option>
                                    <option value="평택시">평택시</option>
                                </select>
                            </div>

                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 pl-1">허용 주위 반경</label>
                                <div className="relative flex items-center">
                                    <input
                                        type="number"
                                        defaultValue={filter.targetRadius}
                                        onChange={(e) => setTargetRadius(e.target.value)}
                                        className="w-full bg-black/50 border border-slate-600/40 rounded-lg p-2.5 text-[15px] text-indigo-300 font-bold outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50 transition-all shadow-inner"
                                    />
                                    <span className="absolute right-2.5 text-indigo-600 font-black pointer-events-none text-[10px]">KM</span>
                                </div>
                            </div>
                        </div>
                        <p className="text-[9px] text-indigo-400/60 mt-2 font-mono leading-tight bg-indigo-900/20 p-1.5 rounded text-center">
                            *입력 위치 반경의 읍면동 리스트를 자동 하달합니다.
                        </p>
                    </div>

                    {/* 블랙리스트 키워드 */}
                    <div className="group bg-[#150a0a]/50 backdrop-blur-md p-4 rounded-xl border border-red-900/30 shadow-lg hover:border-red-500/40 transition-colors">
                        <label className="text-[11px] font-black text-red-400/80 tracking-wider flex items-center gap-1.5 mb-2">
                            <span className="text-red-500">🚫</span> 블랙리스트
                        </label>
                        <textarea
                            defaultValue={filter.blacklist}
                            onChange={(e) => setBlacklist(e.target.value)}
                            placeholder="단어 쉼표(,) 구분"
                            className="w-full h-12 bg-black/60 border border-red-900/50 rounded-lg p-2 text-xs text-red-300 font-medium outline-none focus:bg-red-950/20 focus:border-red-500/60 transition-all resize-none shadow-inner leading-relaxed"
                        />
                    </div>

                    {/* 저장 버튼 (인라인으로 삽입) */}
                    <button
                        onClick={handleSave}
                        className="relative w-full h-14 mt-4 group overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 p-[1px] shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all active:scale-[0.98] outline-none"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative flex h-full w-full items-center justify-center bg-slate-950/20 backdrop-blur-md rounded-[11px]">
                            <span className="text-lg mr-1.5">💫</span>
                            <span className="text-[15px] font-black text-white tracking-widest drop-shadow-md">
                                즉시 동기화 적용
                            </span>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}
