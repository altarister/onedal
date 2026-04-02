import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";

export default function OrderFilterConfig() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-950 p-4 pb-32 text-slate-200">
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => navigate(-1)} className="text-2xl text-slate-400 hover:text-white">←</button>
                <h1 className="text-xl font-black">⚙️ 오더 필터 설정</h1>
            </div>

            <div className="space-y-6 max-w-lg mx-auto pb-8">
                {/* 단가 필터 */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">하한가 (최소 운임)</label>
                    <div className="flex items-center gap-2">
                        <input type="number" defaultValue={40000} className="w-full bg-black/50 border border-slate-700 rounded-lg p-3 text-xl text-emerald-400 font-black outline-none focus:border-emerald-500" />
                        <span className="text-slate-400 font-bold shrink-0">원 이상</span>
                    </div>
                </div>

                {/* 거리 반경 필터 */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">상차 반경 (내 위치 반경)</label>
                    <div className="flex items-center gap-2">
                        <input type="number" defaultValue={10} className="w-full bg-black/50 border border-slate-700 rounded-lg p-3 text-lg text-white font-bold outline-none focus:border-indigo-500" />
                        <span className="text-slate-400 font-bold shrink-0">km 이내</span>
                    </div>
                </div>

                {/* 도착지 설정 영역 */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">하차 목표 (시/군/자치구)</label>
                    <input type="text" defaultValue="용인시" className="w-full bg-black/50 border border-slate-700 rounded-lg p-3 text-lg text-white font-bold outline-none focus:border-indigo-500 mb-4" />
                    
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">목표 범위 주위 반경</label>
                    <div className="flex items-center gap-2">
                        <input type="number" defaultValue={10} className="w-full bg-black/50 border border-slate-700 rounded-lg p-3 text-lg text-white font-bold outline-none focus:border-indigo-500" />
                        <span className="text-slate-400 font-bold shrink-0">km 주변</span>
                    </div>

                    <div className="mt-4 bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20 flex gap-2 items-start">
                        <span className="text-indigo-400">💡</span>
                        <p className="text-[11px] text-indigo-300 font-medium leading-tight">
                            입력하신 목표 지역과 반경을 기반으로 서버가 하위 (읍/면/법정동) 콤마 배열을 연산하여 안드로이드 앱폰에 최적화 전송합니다. <br/>
                            <span className="text-indigo-500 font-bold block mt-1">(예: 용인시, 기흥구, 수지구, 상현동, 풍덕천동, 광교...)</span>
                        </p>
                    </div>
                </div>

                {/* 블랙리스트 키워드 */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">제외 단어 (블랙리스트)</label>
                    <textarea 
                        defaultValue="착불, 수거, 까대기" 
                        placeholder="쉼표(,)로 구분하세요"
                        className="w-full h-24 bg-black/50 border border-slate-700 rounded-lg p-3 text-sm text-red-300 font-bold outline-none focus:border-red-500 resize-none" 
                    />
                </div>
            </div>

            {/* 고정 하단 저장 버튼 */}
            <div className="fixed bottom-[74px] left-0 right-0 p-4 bg-slate-950/80 backdrop-blur-md border-t border-white/5 z-40">
                <div className="max-w-lg mx-auto">
                    <Button className="w-full h-14 text-lg tracking-wide rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] font-black" onClick={() => navigate(-1)}>
                        📲 1/2호기 즉시 동기화 적용
                    </Button>
                </div>
            </div>
        </div>
    );
}
