import { utimesSync } from 'node:fs';

/**
 * 🔄 **서버를 다시 띄운다 — 감시자를 깨워서** (2026-08-22 · 버그 대장 #40)
 *
 * 개발 서버는 `tsx watch src/index.ts` 로 돈다. 감시자(부모)가 소스 변경을 보면
 * **서버(자식)를 스스로 갈아치운다** — 코드를 고칠 때마다 벌어지는 그 일이다.
 * 그래서 재기동에 사람이 필요 없다: 파일의 **수정 시각만** 건드리면 된다.
 *
 * 🔴 왜 필요했나: 장부(`orders`)를 비워도 **세션 메모리의 옛 콜은 남는다.**
 *    예전에는 초기화가 *"재기동해 주세요"* 하고 기다렸고, 하필 그때 `pnpm dev` 가
 *    `&` 구조라 Ctrl+C 가 서버에 닿지 않아 — 지워진 콜 6건이 4시간 40분 동안
 *    관제웹에 유령으로 남았다. **장부를 비우는 쪽이 메모리도 함께 비운다.**
 */

/** 파일 **내용은 그대로 두고** 수정 시각만 갱신한다 (감시자를 깨우는 유일한 목적) */
export function bumpEntry(entry) {
    const now = new Date();
    utimesSync(entry, now, now);
    return now;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const health = (base) => fetch(`${base}/api/health`).then(r => r.json()).catch(() => null);

/**
 * 감시자를 깨우고 **부팅 시각(`bootedAt`)이 실제로 바뀔 때까지** 지켜본다.
 * 바뀐 것을 못 봤으면 성공했다고 말하지 않는다 — 그게 이 사고의 뿌리였다.
 *
 * @returns {{restarted: boolean, reason?: 'OFFLINE'|'TIMEOUT', bootedAt?: string}}
 */
export async function restartServer({ base, entry, log = console.log, timeoutMs = 20000 }) {
    const before = await health(base);
    if (!before) {
        log('  서버가 꺼져 있습니다 — 다음에 켤 때 빈 장부로 시작합니다.');
        return { restarted: false, reason: 'OFFLINE' };
    }

    log(`  🔄 서버를 다시 띄웁니다 (지금 bootedAt ${before.bootedAt})`);
    bumpEntry(entry);

    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        await sleep(500);
        const now = await health(base);
        if (now && now.bootedAt !== before.bootedAt) {
            log(`  ✅ 재기동 확인 (bootedAt ${now.bootedAt}) — 세션 메모리의 옛 콜이 사라졌습니다.`);
            return { restarted: true, bootedAt: now.bootedAt };
        }
    }

    // 감시자 없이 도는 서버(`node dist/index.js`)면 파일을 건드려도 안 바뀐다.
    log('\n  ⚠️ 부팅 시각이 안 바뀌었습니다 — 감시자(tsx watch) 없이 도는 서버입니다.');
    log('  장부는 비었지만 **화면에는 옛 콜이 남습니다.** 서버를 직접 다시 띄워 주세요.');
    return { restarted: false, reason: 'TIMEOUT' };
}
