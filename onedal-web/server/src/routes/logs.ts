import { Router } from "express";

/**
 * 🖥️ **관제웹이 스스로 남기는 로그를 받는다** (필드테스트 1회차 ④ · 2026-08-25)
 *
 * ── 왜 필요했나 ──
 * 2026-08-23 실주행 3시간 뒤, **관제웹이 그때 무엇을 하고 있었는지 알 방법이 없었다.**
 * GPS 를 언제 놓쳤는지 · 콜 카드가 떴는지 · 결재 버튼이 보였는지 전부 모른다.
 * `logRoadmapEvent` 는 `console.log` 한 줄이 전부고, 콘솔은 주행이 끝나면 사라진다.
 *
 * 기사님 기록(todo.md ④): *"A24폰 원달앱이 없었으면 1회차는 원인 불명으로 끝났다.
 * 같은 수준이 필요하다."*
 *
 * ── 왜 소켓이 아니라 HTTP 인가 ──
 * 🔴 **소켓이 끊긴 걸 소켓으로 보낼 수는 없다.** 우리가 가장 알고 싶은 것이
 *    *"주행 중 소켓이 몇 번 끊겼나"* 인데, 그 순간 소켓은 못 쓴다.
 *    끊긴 동안 관제웹이 메모리에 쌓아 두었다가 복구되면 한꺼번에 올린다.
 *
 * ── 왜 새 표를 안 만드나 ──
 * `initFileLogger` 가 `console.log` 를 가로채 파일로 쓴다. 여기서 찍기만 하면
 * **3일 보관·자동 정리·포트별 분리가 그대로 따라온다** (규칙 ③ — 있는 것을 쓴다).
 * 로그는 조회 대상이 아니라 `grep` 대상이라 DB 에 넣을 이유가 없다.
 */
const router = Router();

/** 한 번에 받을 수 있는 줄 수 — 넘치면 잘라서 받고 잘랐다고 말한다 (조용히 버리지 않는다) */
const MAX_LINES = 200;
/** 한 줄 길이 — 화면 덤프 같은 것이 통째로 들어와 파일을 채우지 않게 */
const MAX_LEN = 500;

interface ClientLogLine {
    /** 관제웹이 찍은 시각 (HH:MM:SS.mmm) — 서버 도착 시각과 다르다. 둘 다 남긴다 */
    at?: string;
    msg?: string;
}

router.post("/", (req, res) => {
    const body = req.body as { deviceId?: string; lines?: ClientLogLine[] };
    const lines = Array.isArray(body?.lines) ? body.lines : [];

    // 🔴 즉시 응답한다 — 로그 때문에 화면이 멈추면 안 된다 (규칙 ② «HTTP 를 물고 기다리지 않는다»)
    res.json({ ok: true, received: Math.min(lines.length, MAX_LINES) });

    if (lines.length === 0) return;
    const who = String(body?.deviceId ?? "관제웹").slice(0, 24);
    const shown = lines.slice(0, MAX_LINES);

    for (const l of shown) {
        const at = typeof l?.at === "string" ? l.at.slice(0, 12) : "--:--:--.---";
        const msg = String(l?.msg ?? "").replace(/[\r\n]+/g, " ").slice(0, MAX_LEN);
        if (!msg) continue;
        // 서버 자기 줄과 섞이지 않게 출처를 앞에 박는다
        console.log(`🖥️ [관제웹 ${who}] ${at} ${msg}`);
    }
    if (lines.length > MAX_LINES) {
        console.warn(`🖥️ [관제웹 ${who}] ⚠️ ${lines.length - MAX_LINES}줄을 잘랐습니다 (한 번에 ${MAX_LINES}줄까지)`);
    }
});

export default router;
