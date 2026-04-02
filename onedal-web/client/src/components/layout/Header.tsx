import { Button } from "../ui/Button";

export default function Header({ isConnected, onTestClick }: { isConnected: boolean, onTestClick: () => void }) {
    return (
        <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-md border-b border-white/10 px-4 py-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-black tracking-tighter bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        1DAL 레이더
                    </h1>
                </div>
                <div className="flex gap-3">
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={onTestClick} 
                        className="bg-fuchsia-600/20 text-fuchsia-400 border-fuchsia-500/30 hover:bg-fuchsia-600/30 font-bold"
                    >
                        테스트 콜
                    </Button>
                    <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                        <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-red-500"}`} />
                        <span className="text-xs font-bold text-slate-400">서버 접속됨</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
