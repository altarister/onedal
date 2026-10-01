import { useEffect, useRef, useState } from 'react';
import { TILE_MAX_ZOOM, fitViewOf, screenOf, tilesIn, type TileView } from '@onedal/shared';
import { useTheme } from '@onedal/ui/theme';

/**
 * 🗺️ **운영센터 지도 — 캔버스 한 장** (reviews/33 3단계). 배경은 OpenStreetMap 타일(키 없음 · 회색조로 연하게 · «© OpenStreetMap» 표기),
 *    점 · 이름표는 직접 그린다 — 관제웹 지도와 같은 방식(SDK 를 들이지 않는다 · 좌표 일반식은 shared `mapTile` 한 벌).
 *    보기는 점들을 다 담게 맞추고 +/− · «전체 보기» 버튼만 둔다(끌기 · 집기 없음 — 점이 몇 개뿐이다).
 *    타일은 보기가 바뀔 때만 받는다(브라우저 캐시) — OSM 타일 서버는 가벼운 사용만 허용한다.
 */
export interface MapDot { id: string; lat: number; lng: number; label: string; note: string; faded: boolean }

const tileCache = new Map<string, HTMLImageElement>();

export default function OpsMapCanvas({ dots, onPick }: { dots: MapDot[]; onPick?: (id: string) => void }) {
    const boxRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [zoomBy, setZoomBy] = useState(0);        // 맞춘 보기에서 몇 단계 더(+) · 덜(−)
    const [tilesReady, setTilesReady] = useState(0);

    useEffect(() => {
        const el = boxRef.current; if (!el) return;
        const ro = new ResizeObserver(es => { const r = es[0].contentRect; setSize({ w: Math.round(r.width), h: Math.round(r.height) }); });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const fit = fitViewOf(dots, size.w, size.h);
    const view: TileView | null = fit ? { ...fit, zoom: Math.max(3, Math.min(TILE_MAX_ZOOM, fit.zoom + zoomBy)) } : null;
    const viewKey = view ? `${view.zoom}|${view.centerNx.toFixed(6)}|${view.centerNy.toFixed(6)}` : '';

    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas || !size.w || !size.h) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = size.w * dpr; canvas.height = size.h * dpr;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const dark = theme === 'dark';
        ctx.fillStyle = dark ? '#0b0f17' : '#eef1f5';
        ctx.fillRect(0, 0, size.w, size.h);
        if (!view) return;

        /* 배경 타일 — 온 것만 그린다 · 아직 안 온 것은 받아지면 다시 그린다 */
        ctx.save();
        ctx.globalAlpha = dark ? 0.45 : 0.8;
        if (typeof ctx.filter === 'string') ctx.filter = dark ? 'grayscale(1) invert(1) brightness(0.9)' : 'grayscale(1)';
        for (const t of tilesIn(view, size.w, size.h)) {
            const key = `${t.z}/${t.tx}/${t.ty}`;
            let img = tileCache.get(key);
            if (!img) {
                img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => setTilesReady(n => n + 1);
                img.src = `https://tile.openstreetmap.org/${key}.png`;
                tileCache.set(key, img);
            }
            if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, t.left, t.top, t.size, t.size);
        }
        ctx.restore();

        /* 회원 점 + 이름표 + 마지막 시각 — 오래된 점(오늘이 아님)은 흐리게 */
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        for (const d of dots) {
            const { x, y } = screenOf(d, view, size.w, size.h);
            ctx.globalAlpha = d.faded ? 0.45 : 1;
            ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fillStyle = 'rgba(59,130,246,0.25)'; ctx.fill();
            ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = '#3b82f6'; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = dark ? '#0b0f17' : '#ffffff'; ctx.stroke();
            const text = `${d.label} · ${d.note}`;
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = dark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.92)';
            ctx.fillRect(x + 12, y - 10, tw + 10, 20);
            ctx.fillStyle = dark ? '#e5e7eb' : '#111827';
            ctx.fillText(text, x + 17, y);
        }
        ctx.globalAlpha = 1;

        /* 표기 의무 */
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = dark ? 'rgba(229,231,235,0.7)' : 'rgba(17,24,39,0.7)';
        ctx.fillText('© OpenStreetMap', size.w - 4, size.h - 7);
        ctx.textAlign = 'left';
    }, [viewKey, size.w, size.h, theme, tilesReady, dots]); // eslint-disable-line react-hooks/exhaustive-deps

    /** 점을 누르면 그 회원으로 — 가장 가까운 점이 18px 안일 때 */
    const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!view || !onPick) return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        let best: { id: string; d: number } | null = null;
        for (const d of dots) {
            const s = screenOf(d, view, size.w, size.h);
            const dist = Math.hypot(s.x - px, s.y - py);
            if (dist <= 18 && (!best || dist < best.d)) best = { id: d.id, d: dist };
        }
        if (best) onPick(best.id);
    };

    const btn = 'w-8 h-8 rounded-lg border border-border-card bg-surface/90 text-sm font-black hover:bg-surface-alt';
    return (
        <div ref={boxRef} className="relative w-full aspect-[4/3] md:aspect-[16/9] rounded-xl overflow-hidden border border-border-card">
            <canvas ref={canvasRef} onClick={pick} style={{ width: '100%', height: '100%' }} aria-label="회원 위치 지도" />
            {!fit && <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">위치를 보낸 운전석 폰이 없습니다</div>}
            {fit && (
                <div className="absolute top-2 right-2 flex flex-col gap-1">
                    <button type="button" className={btn} onClick={() => setZoomBy(z => z + 1)} aria-label="확대">+</button>
                    <button type="button" className={btn} onClick={() => setZoomBy(z => z - 1)} aria-label="축소">−</button>
                    <button type="button" className={`${btn} text-[10px]`} onClick={() => setZoomBy(0)} aria-label="전체 보기">전체</button>
                </div>
            )}
        </div>
    );
}
