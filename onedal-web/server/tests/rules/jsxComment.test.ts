import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 🧹 **주석이 화면에 새어 나오는 것을 잡는다** (2026-09-12 · 기사님이 화면에서 잡으심).
 *
 * 기사님: *"설정창에 `/* 🎨 hex 가 아니라 테마 토큰 … *​/` 내용이 들어가 있어 지워"*
 *
 * 🔴 **JSX 자식 자리의 `/* … *​/` 는 주석이 아니라 «글자»다.** 감싸는 중괄호가 없으면
 *    리액트가 그대로 그린다 — `tsc` 도 통과하고 검사도 전부 초록인데 **기사님 화면에만 보인다.**
 *
 * 🔴 **같은 모양을 세 번 냈다** — 앞의 둘은 컴파일이 깨져 그 자리에서 알았지만
 *    (`{cur && (` 뒤 식 자리에 넣어 두 번), **이번엔 조용히 화면까지 갔다.**
 *    깨지는 쪽이 차라리 나았다. 그래서 규칙으로 잡는다.
 *
 * ⚠️ `eslint` 에 같은 일을 하는 규칙(`react/jsx-no-comment-textnodes`)이 있지만
 *    이 레포에는 **`react` 플러그인이 안 깔려 있다.** 플러그인을 새로 들이는 것보다
 *    이미 있는 `typescript` 파서로 **정확히** 보는 쪽이 싸다 — 정규식이 아니라
 *    **JsxText 노드**를 보므로 «문자열 안의 `/*`»나 «진짜 주석»에 걸리지 않는다.
 */

const CLIENT_SRC = join(__dirname, '../../../client-app/src');

function tsxFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) tsxFiles(p, out);
        else if (name.endsWith('.tsx')) out.push(p);
    }
    return out;
}

/** 화면에 그려지는 글자 자리(JsxText)에 주석 기호가 들어 있는 곳을 모은다 */
function leakedComments(file: string): string[] {
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const hits: string[] = [];
    const walk = (node: ts.Node) => {
        if (ts.isJsxText(node)) {
            const text = node.getText();
            if (text.includes('/*') || text.includes('*/')) {
                const { line } = src.getLineAndCharacterOfPosition(node.getStart());
                hits.push(`${file.slice(CLIENT_SRC.length + 1)}:${line + 1} — ${text.trim().slice(0, 60)}`);
            }
        }
        ts.forEachChild(node, walk);
    };
    walk(src);
    return hits;
}

describe('🧹 주석이 화면에 새지 않는다', () => {
    it('🔴 JSX 글자 자리에 `/* */` 가 없다 — 감싸는 중괄호를 잊으면 그대로 그려진다', () => {
        const leaks = tsxFiles(CLIENT_SRC).flatMap(leakedComments);
        expect(leaks).toEqual([]);
    });
});
