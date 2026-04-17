export function logRoadmapEvent(platform: "서버" | "웹" | "앱", message: string, page: string = "") {
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
