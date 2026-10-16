import path from "path"
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs"
import { execSync } from "child_process"
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** 🧪 실폰 e2e 장면 표 — Vite 의 SPA 대체 미들웨어가 확장자 없는 주소를 관제웹 `index.html` 로 돌리기 전에 가로챈다(아래 phoneE2e) */
function e2eTestFallback(): Plugin {
  return {
    name: "e2e-test-fallback",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (phoneE2e(req, res)) return;
        next();
      });
    },
  };
}

/**
 * 🧪 `/e2e-test/phone/` — phone-e2e-test 장면 표. 문제지(problems.json)로 줄을 그리고 최신 결과지(out/result_*.json)로 체크를 얹는다.
 * 결과지를 만드는 곳은 make_result.py 하나다 — «새 판»도, 결과지 없이 누른 첫 체크도 그것을 부른다.
 */
const E2E = path.resolve(__dirname, "../../phone-e2e-test");
const E2E_OUT = path.join(E2E, "out");
function latestResult(): string | null {
  if (!existsSync(E2E_OUT)) return null;
  const f = readdirSync(E2E_OUT).filter((n) => /^result_\d{8}_\d{6}\.json$/.test(n)).sort().pop();
  return f ? path.join(E2E_OUT, f) : null;
}
function makeResult(): string {
  return execSync(`python3 "${path.join(E2E, "make_result.py")}"`).toString().trim();
}
function phoneE2e(req: import("http").IncomingMessage, res: import("http").ServerResponse): boolean {
  const url = (req.url ?? "").split("?")[0];
  if (!url.startsWith("/e2e-test/phone")) return false;
  const json = (v: unknown) => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(v)); };
  if (url === "/e2e-test/phone") { res.writeHead(302, { Location: "/e2e-test/phone/" }); res.end(); return true; }
  if (url === "/e2e-test/phone/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(readFileSync(path.join(E2E, "index.html"), "utf-8")); return true; }
  if (url === "/e2e-test/phone/problems.json") { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(readFileSync(path.join(E2E, "problems.json"), "utf-8")); return true; }
  if (url === "/e2e-test/phone/result") { const f = latestResult(); json(f ? { file: path.basename(f), ...JSON.parse(readFileSync(f, "utf-8")) } : { file: null }); return true; }
  if (url === "/e2e-test/phone/new" && req.method === "POST") { json({ file: path.basename(makeResult()) }); return true; }
  if (url === "/e2e-test/phone/mark" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      try {
        const { id, ok } = JSON.parse(body) as { id: string; ok: boolean | null };
        const f = latestResult() ?? makeResult();
        const r = JSON.parse(readFileSync(f, "utf-8"));
        if (!(id in r.checks)) { res.statusCode = 400; res.end(`결과지에 없는 줄 ${id}`); return; }
        r.checks[id] = ok;
        writeFileSync(f, JSON.stringify(r, null, 1));
        res.statusCode = 204; res.end();
      } catch (e) { res.statusCode = 400; res.end(String(e)); }
    });
    return true;
  }
  return false;
}

// https://vite.dev/config/
// Force restart vite dev server
/**
 * 🖥️ **관제웹 코드 판** — 뜰 때(개발) · 빌드할 때(배포)의 커밋. 관제웹이 소켓에 붙을 때 서버 로그로 알린다 (`lib/webCodeVersion`).
 *    개발 서버는 커밋이 뜬 뒤에 생기므로 관제웹이 «마지막 핫 교체»를 함께 싣는다.
 */
const WEB_COMMIT = (() => {
  try { return execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim(); } catch { return 'unknown'; }
})();

export default defineConfig({
  plugins: [e2eTestFallback(), react(), tailwindcss()],
  define: { __WEB_COMMIT__: JSON.stringify(WEB_COMMIT) },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    /**
     * 📱 **같은 와이파이의 폰에서도 열린다** (기사님 요청).
     * 기본값은 `127.0.0.1` 이라 맥에서만 열렸다 — 폰으로 보려면 LAN 주소가 필요하다.
     * ⚠️ 개발 서버에만 걸리는 값이다. 배포(EC2)는 Express 가 `dist/` 를 서빙하므로 무관하다.
     */
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
})
