import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { APP_STEPS, nextOf, prevOf, stepFromQuery, type AppStep } from '../lib/joinFlow';
import { ContentSlot, JoinShell, SectionCard } from './JoinSteps';

/**
 * 📱 **앱 받기 — ④ 받기 → ⑤ 설치 → ⑥ 폰 연결** (reviews/29 «새 기사 한 분이 첫 콜까지» 5~8).
 *    🔴 APK 내려받기 주소(`/api/downloads/…`)와 최신 판은 서버가 준다 — 지금은 목업이라 버튼만 있다.
 */

const STEP_LABELS: Record<AppStep, string> = { download: '앱 받기', install: '설치', pair: '폰 연결' };

/** 예시 — 실제 값은 운영센터 «앱 배포»에서 올린 것을 서버가 준다. 기사 폰은 두 대다 — 앱마다 어느 폰인지 적는다 */
const APPS = [
    { id: 'scanner', name: '원달앱', phone: '배차망 폰', what: '배차망 앱(인성 · 화물24시 · 픽커)이 깔린 폰에 — 화면을 읽고 알림을 울린다', version: '2.9.12', size: '18 MB' },
    { id: 'dashboard', name: '관제앱', phone: '운전석 폰', what: '거치대의 폰에 — 콜 결재(KEEP/CANCEL) · 위치 · 판정 화면', version: '1.0', size: '24 MB' },
];

const INSTALL_STEPS = [
    { t: '«출처를 알 수 없는 앱» 허용', d: '설정 → 보안 → 이 브라우저(크롬)에서 설치 허용을 켭니다.' },
    { t: '안드로이드 13 이상: «제한된 설정 허용»', d: '앱 정보 → 오른쪽 위 ⋮ → 제한된 설정 허용. 이걸 안 켜면 접근성 스위치가 회색으로 막힙니다.' },
    { t: 'Play Protect 경고가 뜨면', d: '«무시하고 설치»를 누릅니다. 스토어 밖에서 받은 앱이라 뜨는 경고입니다.' },
    { t: '안드로이드 11 미만 폰', d: '카카오 픽커의 사진 읽기가 되지 않습니다. 인성 · 화물24시는 됩니다.' },
];

export default function JoinApps() {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const step = stepFromQuery(APP_STEPS, params.get('step'));
    const go = (s: AppStep | null) => { if (s) setParams({ step: s }); };

    return (
        <JoinShell title="앱 받기 · 설치 · 연결" subtitle="배차망 폰에는 원달앱, 운전석 폰에는 관제앱" steps={APP_STEPS} step={step} labels={STEP_LABELS}>
            {step === 'download' && (
                <>
                    {APPS.map(a => (
                        <SectionCard key={a.id}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-xs font-bold text-info mb-0.5">📱 {a.phone}</div>
                                    <div className="font-black text-base">{a.name} <span className="text-xs text-text-muted font-normal">v{a.version} · {a.size}</span></div>
                                    <p className="text-sm text-text-muted mt-1">{a.what}</p>
                                </div>
                                <Button type="button" size="sm" onClick={() => alert('목업입니다 — 실제 APK 는 운영센터에서 올린 것을 서버가 내려줍니다')}>받기</Button>
                            </div>
                        </SectionCard>
                    ))}
                    <p className="text-xs text-text-muted">각 폰에서 이 주소를 열어 그 폰의 앱만 받습니다. 받은 파일은 «다운로드» 폴더에 있습니다.</p>
                </>
            )}

            {step === 'install' && (
                <>
                    <ContentSlot kind="installGuide" placeholder="예: 설치 순서 영상 링크 · 폰 기종별 메모" />
                    <SectionCard title="설치할 때 걸리는 것">
                        <ol className="space-y-3">
                            {INSTALL_STEPS.map((s, i) => (
                                <li key={s.t} className="flex gap-3">
                                    <span className="shrink-0 w-6 h-6 rounded-full bg-surface-alt text-xs font-black flex items-center justify-center">{i + 1}</span>
                                    <div className="text-sm"><div className="font-bold">{s.t}</div><div className="text-text-muted">{s.d}</div></div>
                                </li>
                            ))}
                        </ol>
                    </SectionCard>
                </>
            )}

            {step === 'pair' && (
                <SectionCard title="폰을 계정에 연결하기">
                    <ol className="space-y-2 text-sm list-decimal pl-5">
                        <li>관제앱(또는 이 관제웹)에 <b>구글로 로그인</b>합니다 — 가입한 그 계정으로.</li>
                        <li>⚙️ 설정 → <b>기기</b> 탭 → «연결 번호 받기»를 누르면 <b>6자리 번호</b>가 뜹니다 (3분 동안 유효).</li>
                        <li>원달앱 → 설정 → <b>관제 계정 연동</b>에 그 번호와 폰 이름을 적고 «연결».</li>
                        <li>원달앱 첫 화면의 점검 칸이 전부 초록이면 끝 — 빨간 칸은 옆의 안내를 누르세요.</li>
                    </ol>
                    <p className="text-xs text-text-muted">승인 전에는 서버가 연결을 거절합니다 — 승인 뒤에 다시 누르면 됩니다.</p>
                </SectionCard>
            )}

            <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" disabled={!prevOf(APP_STEPS, step)} onClick={() => go(prevOf(APP_STEPS, step))}>이전</Button>
                {nextOf(APP_STEPS, step)
                    ? <Button type="button" className="flex-[2]" onClick={() => go(nextOf(APP_STEPS, step))}>다음</Button>
                    : <Button type="button" className="flex-[2]" onClick={() => navigate('/')}>관제 화면으로</Button>}
            </div>
            <p className="text-center text-xs text-text-muted"><Link to="/pending" className="underline">승인 대기 화면으로</Link></p>
        </JoinShell>
    );
}
