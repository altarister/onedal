/** 🧹 직전과 같은 문구는 접는다 — 같은 줄이 로그를 덮는 계열 (reviews/22 ①-3 «같은 문구 연속 접기») */
let lastRoadmapLine = "";

export function logRoadmapEvent(platform: "서버" | "웹" | "앱", message: string, page: string = "") {
  const dedupeKey = `${platform}|${page}|${message}`;
  if (dedupeKey === lastRoadmapLine) return;
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
