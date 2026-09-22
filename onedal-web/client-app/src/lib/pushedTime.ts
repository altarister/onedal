/**
 * ⏱️ **합짐이 앞에 끼면 뒤가 밀린다 — 그 시각을 미리 보여 준다** (기사님 확정)
 *
 * ── 왜 «미리» 인가 ──
 * 기사님이 *"심사 중에 미리 — 「잡으면 이렇게 밀린다」"* 를 고르셨다.
 * 🔴 **«감수하고 KEEP» 하시는 판단의 재료**이기 때문이다. 잡고 나서 알면 늦다.
 *
 * ── 무엇을 답하나 ──
 * «17:54 였는데 34분 밀리면 몇 시인가» 하나뿐이다. 화면이 그 둘을 나란히 적는다:
 * `1̶7̶:̶5̶4̶ → ~18:28  +34분`
 *
 * 🔴 **«~»(통화 전 추정)를 지운다면 그것도 거짓말이다** — 밀린 시각도 여전히 추정이다.
 *    붙어 있던 표시는 그대로 옮긴다 (규칙 ⑤-2).
 */

/** `~17:54` · `17:54` 를 분으로. 못 읽으면 `null` — 지어내지 않는다 (규칙 ④) */
export function parseClock(text: string): number | null {
    const m = text.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

/**
 * ⏱️ 시각을 그만큼 민다. **«~» 같은 표시는 그대로 살린다.**
 * 못 읽으면 원문 그대로 돌려준다 — 화면이 빈칸이 되느니 원래 값이 낫다.
 */
export function pushClock(text: string, minutes: number): string {
    const at = parseClock(text);
    if (at == null) return text;
    /* 🔴 자정을 넘어가도 시각은 시각이다 — 24시로 감는다 (하루 넘는 콜은 이 화면의 일이 아니다) */
    const moved = ((at + minutes) % 1440 + 1440) % 1440;
    const hh = String(Math.floor(moved / 60)).padStart(2, '0');
    const mm = String(moved % 60).padStart(2, '0');
    return text.replace(/\d{1,2}:\d{2}/, `${hh}:${mm}`);
}

/** 화면에 적는 차이 — 밀리면 `+34분`, 당겨지면 `-4분`. 0 이면 안 적는다 (규칙 ④) */
export function gapLabel(minutes: number): string {
    if (minutes === 0) return '';
    return `${minutes > 0 ? '+' : ''}${minutes}분`;
}

/**
 * 🎨 **밀리는 것은 나쁜 일이다 — 색을 가른다.**
 * 🔴 밀리면 나쁜 색, 당겨지면 좋은 색이다 — 「+34분」이 초록이면 **좋은 일로 읽힌다.**
 */
export function gapTone(minutes: number): 'good' | 'bad' | 'none' {
    if (minutes === 0) return 'none';
    return minutes > 0 ? 'bad' : 'good';
}
