/**
 * 누가: pnpm gen:pages basecall 과 shared baseCallKotlin 검사
 * 언제: orderShapes.ts 의 기본 콜 타입을 고친 뒤
 * 어디서: onedal-web/scripts/lib
 * 무엇을: 기본 콜 타입(BaseCall · 기록)을 원달앱 코틀린 모양 글로 뽑는다
 * 왜: 플러그인이 채우는 칸 이름을 shared 한 곳에만 둔다 — 손으로 두 벌을 적으면 갈라진다
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
/* typescript 는 server 묶음에 있다 */
const ts = createRequire(join(here, '../../server/package.json'))('typescript');

export const SHAPES_PATH = join(here, '../../shared/src/call/orderShapes.ts');
export const KOTLIN_PATH = join(here, '../../../onedal-app/app/src/main/java/com/onedal/app/models/BaseCallShape.kt');
/** 원달앱이 채워 보내는 타입 — 잡은 뒤 값 · 판정 답 · 보고 봉투는 여기 없다 */
const ROOTS = ['BaseCall', 'CallEvidence'];

const pascal = (word) => word[0].toUpperCase() + word.slice(1);

export function renderBaseCallKotlin(source = readFileSync(SHAPES_PATH, 'utf8')) {
    const file = ts.createSourceFile('orderShapes.ts', source, ts.ScriptTarget.Latest, true);
    const interfaces = new Map(file.statements.filter(ts.isInterfaceDeclaration).map((d) => [d.name.text, d]));
    const classes = new Map();

    /** 칸 하나의 코틀린 타입 — 글자 묶음 별칭은 글자로 보낸다 */
    const kotlinType = (node, owner, field) => {
        if (ts.isParenthesizedTypeNode(node)) return kotlinType(node.type, owner, field);
        if (ts.isUnionTypeNode(node)) {
            const real = node.types.filter((t) => !(ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword));
            return real.length === 1 ? kotlinType(real[0], owner, field) : 'String';
        }
        if (ts.isArrayTypeNode(node)) return `List<${kotlinType(node.elementType, owner, field)}>`;
        if (ts.isTypeReferenceNode(node) && node.typeName.getText() === 'Array') return `List<${kotlinType(node.typeArguments[0], owner, field)}>`;
        if (node.kind === ts.SyntaxKind.StringKeyword) return 'String';
        if (node.kind === ts.SyntaxKind.NumberKeyword) return 'Double';
        if (node.kind === ts.SyntaxKind.BooleanKeyword) return 'Boolean';
        if (ts.isTypeLiteralNode(node)) {
            const name = `${owner}${pascal(field)}`;
            addClass(name, fieldsOf(node.members, name), null);
            return name;
        }
        if (ts.isTypeReferenceNode(node) && interfaces.has(node.typeName.getText())) {
            addInterface(node.typeName.getText());
            return node.typeName.getText();
        }
        return 'String';
    };
    const fieldsOf = (members, owner) => members.filter(ts.isPropertySignature).map((m) => ({
        name: m.name.getText(), optional: !!m.questionToken || (m.type.getText().includes('| null')), type: kotlinType(m.type, owner, m.name.getText()),
    }));
    const addClass = (name, fields, about) => { if (!classes.has(name)) classes.set(name, { fields, about }); };
    const addInterface = (name) => {
        if (classes.has(name)) return;
        const decl = interfaces.get(name);
        classes.set(name, null);   // 자기를 다시 부르는 길을 막는다
        const inherited = (decl.heritageClauses ?? []).flatMap((h) => h.types).flatMap((t) => {
            const base = t.expression.getText();
            if (base === 'Omit') {
                const dropped = t.typeArguments[1].getText().match(/'([^']+)'/g).map((w) => w.slice(1, -1));
                return fieldsOf(interfaces.get(t.typeArguments[0].getText()).members, name).filter((f) => !dropped.includes(f.name));
            }
            return fieldsOf(interfaces.get(base).members, name);
        });
        const doc = ts.getJSDocCommentsAndTags(decl)[0];
        classes.set(name, { fields: [...inherited, ...fieldsOf(decl.members, name)], about: doc ? ts.getTextOfJSDocComment(doc.comment)?.split('\n')[0] : null });
    };
    ROOTS.forEach(addInterface);

    const body = [...classes].map(([name, { fields, about }]) => {
        const rows = fields.map((f) => `    val ${f.name}: ${f.type}${f.optional ? '? = null' : ''},`).join('\n');
        return `${about ? `/** ${about} */\n` : ''}data class ${name}(\n${rows}\n)`;
    }).join('\n\n');
    return `package com.onedal.app.models

// 🔴 생성 파일 — shared/src/call/orderShapes.ts 의 기본 콜 타입에서 뽑는다. 손으로 고치지 말고 cd onedal-web && pnpm gen:pages basecall
// 플러그인이 채워 보내는 모양이다. 글자 묶음 별칭(MoneyKind · 결제 등)은 글자로 보낸다.

${body}
`;
}
