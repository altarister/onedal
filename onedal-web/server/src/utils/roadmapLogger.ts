/**
 * 🧹 직전과 같은 문구는 접는다 — 같은 줄이 로그를 덮는 계열 (reviews/22 ①-3 «같은 문구 연속 접기»).
 * 접기만 하면 «몇 번 났나»가 사라진다 — HTTP 실패처럼 반복 자체가 뜻인 줄이 있어,
 * 문구가 바뀌는 순간 접힌 횟수를 한 줄로 남긴다 (onedal-1f 의견).
 */
let lastRoadmapLine = "";
let foldedCount = 0;

export function logRoadmapEvent(platform: "서버" | "웹" | "앱", message: string, page: string = "") {
  const dedupeKey = `${platform}|${page}|${message}`;
  if (dedupeKey === lastRoadmapLine) { foldedCount++; return; }
  if (foldedCount > 0) {
    console.log(`[ROADMAP] (직전 줄이 ${foldedCount}번 더 반복됐다)`);
    foldedCount = 0;
  }
  lastRoadmapLine = dedupeKey;
  const now = new Date();
  const ts = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
  let emoji = "";
  switch (platform) {
    case "서버": emoji = "☁️서버"; break;
    case "웹": emoji = "🖥️관제웹"; break;
    case "앱": emoji = "📱앱"; break;
  }
  const pageStr = page ? ` [${page}]` : "";
  console.log(`[ROADMAP ${ts}] [${emoji}]${pageStr} ${message}`);
}
