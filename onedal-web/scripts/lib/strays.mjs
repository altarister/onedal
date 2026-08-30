import { execSync } from 'node:child_process';

/**
 * 🧟 **떠도는 것 찾기 — 내가 띄운 게 아직 도는가** (2026-08-29 · 사고 뒤 신설)
 *
 * ══ 왜 필요한가 ══
 *
 * 2026-08-29 16:00, 기사님이 실폰으로 시험하는데 **콜을 잡을 때마다 사라졌다.**
 * 원인은 **13:48 에 백그라운드로 띄운 `pnpm rehearsal` 이 2시간 20분째 살아 있던 것**이다.
 * 그 스크립트가 실폰과 **같은 기기 ID** 로 계속 신호를 보냈고, 서버는 그걸
 * *"리스트에서 콜이 사라졌다"* 로 읽어 **심사 0.8초 만에 강제 취소**했다.
 *
 * ```
 * 16:02:19.305  선점 — 관제웹에 「심사 중」
 * 16:02:20.139  🔴 강제 정리 → SAFE_CANCEL      ← 0.8초
 * 16:02:21.281  🛰️⚠️ 이중 발신 경고
 * ```
 *
 * 🔴 **서버는 이미 경고하고 있었다.** 아무도 안 보고 있었을 뿐이다.
 *    경고는 사고가 **난 뒤에** 뜬다 — 판을 깔 때 **미리** 막아야 한다.
 *
 * 같은 날 두 번째 사고도 같은 뿌리다 — 옛 서버가 **4000 을 쥔 채** 살아 있어
 * 새 서버가 못 올라왔고, 기사님은 **오늘 아침 코드로** 시험하고 계셨다.
 * 판정 로그의 「정차 미확인(일반값)」 딱지가 그 증거였다 (그날 오후에 없앤 것).
 *
 * → **"무엇이 실제로 돌고 있는가"는 `bootedAt` 만으로 부족하다.**
 *   *누가 신호를 보내는가* 와 *포트를 몇이 쥐고 있는가* 도 함께 봐야 한다.
 */

/** 판을 깔 때 살아 있으면 안 되는 것들 — 전부 콜·기기·포트를 건드린다 */
const TEST_TOOLS = ['rehearsal.mjs', 'drive.mjs', 'scenario.mjs', 'appLoop.mjs', 'lifecycle.mjs'];

const ps = () => {
    try { return execSync('ps -axo pid=,command=', { encoding: 'utf8' }); }
    catch { return ''; }
};

/**
 * 떠도는 시험 스크립트 목록. **자기 자신은 뺀다** — preflight 도 스크립트다.
 * `sh -c … | node scripts/rehearsal.mjs` 같은 껍데기까지 잡으려고 명령줄 전체를 본다.
 */
export function strayScripts() {
    const me = String(process.pid);
    return ps().split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => { const i = l.indexOf(' '); return { pid: l.slice(0, i), cmd: l.slice(i + 1) }; })
        .filter(p => p.pid !== me
            && !p.cmd.includes('preflight.mjs')
            && TEST_TOOLS.some(t => p.cmd.includes(`scripts/${t}`)))
        .map(p => ({ ...p, name: TEST_TOOLS.find(t => p.cmd.includes(`scripts/${t}`)) }));
}

/**
 * 그 포트를 **듣고 있는** 프로세스들. 붙어 있기만 한 연결은 빼야 한다 —
 * `lsof -i :4000` 은 브라우저·스크립트의 **접속**까지 잡아서 늘 여러 개로 보인다.
 * 🔴 둘 이상이면 **옛 서버가 안 죽은 것**이고, 그러면 새 코드가 안 돈다.
 */
export function portListeners(port) {
    try {
        return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' })
            .split('\n').map(s => s.trim()).filter(Boolean);
    } catch { return []; }          // lsof 는 결과가 없으면 종료 코드 1 이다
}

/** 그 PID 가 언제 떴나 — "2시간째 살아 있다"가 곧 증거다 */
export function startedAt(pid) {
    try {
        return execSync(`ps -p ${pid} -o lstart=`, { encoding: 'utf8' }).trim();
    } catch { return '?'; }
}
