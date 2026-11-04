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
 * 📋 `/shared/` — 프로젝트가 함께 쓰는 정의를 표로 본다. 주소는 파일 자리 그대로다(`/shared/cargo/vehicles`).
 * 메뉴는 `shared/src` 를 하위 폴더까지 돌아 만든다(검사 파일 · 묶음 파일 제외). 파일 머리의 6하원칙을 표 위에 보인다.
 * 보기 전용이다 — 파일에 쓰는 문이 없다. 개발 서버에만 있다(빌드에는 없다).
 */
const SHARED = path.resolve(__dirname, "../shared/src");
const SHARED_PAGE = path.join(SHARED, "preview");
const SHARED_ROW_LIMIT = 1000;
const SHARED_ASSETS: Record<string, string> = { "view.js": "text/javascript", "menu.js": "text/javascript", "preview.css": "text/css" };
const SIX_WORDS = ["누가", "언제", "어디서", "무엇을", "어떻게", "왜"];
/** 파일 머리의 6하원칙 — 첫 주석 안의 «누가: …» 줄들 */
function sixOf(text: string): { word: string; text: string }[] {
  const head = /^\s*\/\*\*([\s\S]*?)\*\//.exec(text)?.[1] ?? "";
  return SIX_WORDS.flatMap((word) => {
    const line = new RegExp(`^\\s*\\*\\s*${word}\\s*:\\s*(.+)$`, "m").exec(head);
    return line ? [{ word, text: line[1].trim() }] : [];
  });
}
/** 내보낸 값 하나를 화면으로 보낼 모양으로 — 함수는 빼고, 너무 긴 목록은 자른다 */
function sharedValue(value: unknown): { rows: unknown; total: number } | null {
  if (typeof value === "function" || value === undefined) return null;
  const plain = value instanceof Map ? Object.fromEntries(value) : value instanceof Set ? [...value] : value;
  if (Array.isArray(plain)) return { rows: plain.slice(0, SHARED_ROW_LIMIT), total: plain.length };
  if (plain && typeof plain === "object") {
    const entries = Object.entries(plain);
    return { rows: Object.fromEntries(entries.slice(0, SHARED_ROW_LIMIT)), total: entries.length };
  }
  return { rows: plain, total: 1 };
}
/** 메뉴 목록 — 하위 폴더까지 돈다. 위층 파일 먼저, 그다음 폴더 차례로. 확장자는 뗀다(주소가 곧 이름이다) */
function sharedFiles(dir: string, prefix: string): string[] {
  const names = readdirSync(dir, { withFileTypes: true });
  const files = names.filter((n) => n.isFile() && n.name.endsWith(".ts") && !n.name.endsWith(".test.ts") && !n.name.endsWith(".d.ts") && !(prefix === "" && n.name === "index.ts")).map((n) => prefix + n.name.slice(0, -3)).sort();
  const folders = names.filter((n) => n.isDirectory() && n.name !== "node_modules" && n.name !== "preview").map((n) => n.name).sort();
  return [...files, ...folders.flatMap((n) => sharedFiles(path.join(dir, n), `${prefix}${n}/`))];
}
/** 메뉴에 보일 한글 제목 — 파일 머리글의 첫 줄. 머리글이 없으면 빈 글자(메뉴가 파일 이름을 쓴다) */
function sharedTitleOf(name: string): string {
  const head = readFileSync(path.join(SHARED, `${name}.ts`), "utf-8").match(/\/\*\*\s*\n\s*\*\s*(.+)/);
  return head ? head[1].replace(/^[^\p{L}\p{N}]+/u, "").trim() : "";
}
/**
 * 내보낸 함수 · 타입 표 — 실행하지 않고 TypeScript 로 읽는다(타입은 실행하면 사라진다).
 * 함수의 리턴 타입은 적지 않은 것이 많아 소스 글자가 아니라 TypeScript 가 계산한 값을 쓴다.
 */
async function sharedCodeOf(file: string) {
  const { default: ts } = await import("typescript");
  const program = ts.createProgram([file], { noEmit: true, skipLibCheck: true, strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  const module = source && checker.getSymbolAtLocation(source);
  const functions: Record<string, string>[] = [];
  const aliases: Record<string, string>[] = [];
  const interfaces: { name: string; about: string; rows: Record<string, string>[] }[] = [];
  if (!source || !module) return { functions, aliases, interfaces };
  const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
  /* `/** */` 주석 → 같은 줄 뒤 `//`(interface 는 `{` 뒤) → (칸이 아니면) 바로 윗줄 `//`. 칸 위의 `//` 는 여러 칸을 묶는 소제목이라 읽지 않는다 */
  const firstLine = (symbol: import("typescript").Symbol) => {
    const node = symbol.declarations?.[0];
    const text = node?.getSourceFile().text ?? "";
    const trailing = node && ts.getTrailingCommentRanges(text, ts.isInterfaceDeclaration(node) ? node.members.pos : node.getEnd())?.[0];
    const above = node && !ts.isPropertySignature(node) ? ts.getLeadingCommentRanges(text, node.getFullStart())?.filter((c, i, all) => !/\n\s*\n/.test(text.slice(c.end, all[i + 1]?.pos ?? node.getStart()))) : undefined;
    const slash = trailing ?? above?.[0];
    const line = ts.displayPartsToString(symbol.getDocumentationComment(checker)).split("\n").map((l) => l.trim()).find(Boolean)
      ?? (slash && text.slice(slash.pos, slash.end).replace(/^\/\/\s*/, "").trim());
    return (line || "주석 없음").replace(/\*\*/g, "").replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "");
  };
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const signature = checker.getTypeOfSymbolAtLocation(symbol, source).getCallSignatures()[0];
    if (signature) functions.push({ "함수": exported.name, "기능": firstLine(symbol), "리턴 타입": checker.typeToString(signature.getReturnType(), source) });
    if (symbol.flags & ts.SymbolFlags.TypeAlias) {
      const node = symbol.declarations?.find(ts.isTypeAliasDeclaration);
      aliases.push({ "타입": exported.name, "기능": firstLine(symbol), "정의": node ? oneLine(node.type.getText()) : "" });
    }
    if (symbol.flags & ts.SymbolFlags.Interface) {
      const rows = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol)).map((prop) => {
        const node = prop.declarations?.[0];
        const owner = node?.parent && ts.isInterfaceDeclaration(node.parent) ? node.parent.name.text : "";
        const written = node && ts.isPropertySignature(node) && node.type ? oneLine(node.type.getText()) : checker.typeToString(checker.getTypeOfSymbolAtLocation(prop, source), source);
        return { "칸": prop.name, "타입": written, "필수": prop.flags & ts.SymbolFlags.Optional ? "" : "필수", "설명": firstLine(prop), "물려받은 곳": owner === exported.name ? "" : owner };
      });
      interfaces.push({ name: exported.name, about: firstLine(symbol), rows });
    }
  }
  return { functions, aliases, interfaces };
}
/** 찾을 파일 — 주소 글자는 낱말과 `/` 만 받는다(`..` 로 밖에 못 나간다) */
function sharedFileOf(name: string): string | null {
  if (!/^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(name) || name.includes("..") || name.endsWith(".test")) return null;
  const file = path.join(SHARED, `${name}.ts`);
  return existsSync(file) ? file : null;
}
function sharedPages(): Plugin {
  return {
    name: "shared-pages",
    configureServer(server) {
      server.middlewares.use("/shared", (req, res, next) => {
        const url = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "").replace(/\/+$/, "");
        const send = (type: string, body: string | Buffer) => { res.setHeader("Content-Type", `${type}; charset=utf-8`); res.setHeader("Cache-Control", "no-store"); res.end(body); };
        const json = (value: unknown) => send("application/json", JSON.stringify(value));
        const fail = (code: number, text: string) => { res.statusCode = code; res.end(text); };
        const page = (name: string) => send("text/html", readFileSync(path.join(SHARED_PAGE, name)));
        if (url === "") return page("index.html");
        if (url === "_/menu") return json(sharedFiles(SHARED, "").map((file) => ({ file, title: sharedTitleOf(file) })));
        if (url === "_/read" && req.method === "POST") {
          let text = "";
          req.on("data", (c) => { text += c; });
          req.on("end", async () => {
            try {
              const { app, page: screen, field, part, sample } = JSON.parse(text);
              const [pageReadFile, networkFile] = [sharedFileOf("network/pageRead"), sharedFileOf("network/networkPages")];
              const { pageFieldOf } = await server.ssrLoadModule(pageReadFile!);
              const { NETWORK_PAGES } = await server.ssrLoadModule(networkFile!);
              const rows: { field: string; part?: string; handling: string; read?: string }[] = NETWORK_PAGES[app]?.pages?.[screen] ?? [];
              const defined = rows.some((r) => r.field === field && (r.part ?? "") === (part ?? "") && r.handling === "READ" && r.read !== undefined);
              json({ defined, value: pageFieldOf(app, screen, field, sample ?? "", part ?? "") });
            } catch (e) { fail(400, String(e)); }
          });
          return;
        }
        if (url.startsWith("_/module/")) {
          const file = sharedFileOf(url.slice("_/module/".length));
          if (!file) return fail(404, "없는 파일");
          server.ssrLoadModule(file).then(async (loaded) => {
            const values = Object.entries(loaded).map(([name, value]) => ({ name, ...sharedValue(value) })).filter((v) => "rows" in v);
            json({ limit: SHARED_ROW_LIMIT, six: sixOf(readFileSync(file, "utf-8")), ...(await sharedCodeOf(file)), values });
          }).catch((e) => fail(500, String(e)));
          return;
        }
        if (url.startsWith("_/") && SHARED_ASSETS[url.slice(2)]) return send(SHARED_ASSETS[url.slice(2)], readFileSync(path.join(SHARED_PAGE, url.slice(2))));
        if (sharedFileOf(url)) return page("view.html");
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
  plugins: [e2eTestFallback(), sharedPages(), react(), tailwindcss()],
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
