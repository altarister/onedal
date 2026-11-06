import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { NETWORK_PAGES, STANDARD_SCREENS, fieldsOf, officeFieldsOf } from './networkPages';
import { OFFICE_FIELDS } from '../call/baseCallToOffice';
import { PAGE_FIELDS, SCREEN_PAGES, BASE_PAGES, BASE_PAGE_OF, basePageOf, type PageField, type ScreenPage } from './pageFields';
import { TARGET_APPS, type TargetAppType } from '../index';
import { pageFieldOf, pageFareOf, excludeScanTextOf, missingAlwaysOf } from './pageRead';
import { VEHICLE_OPTIONS } from '../cargo/vehicles';

/**
 * 📄 **배차망 화면 정의 표 — 서버가 믿고 읽을 수 있나** (onedal-46 3단계 조건).
 * 낱말은 pageFields 의 것만 · read 정규식은 JS 와 코틀린이 같은 뜻으로 읽는 문법만(플래그 · \p{} · 이름 묶음 · 소유 수량자 금지) · 공통 문제지가 JS 로도 같은 답.
 */
describe('배차망 화면 정의 표', () => {
    it('배차망은 TARGET_APPS 셋 · 화면은 SCREEN_PAGES · 칸은 PAGE_FIELDS 낱말만', () => {
        expect(Object.keys(NETWORK_PAGES).sort()).toEqual([...TARGET_APPS].sort());
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) {
            for (const [page, rows] of Object.entries(spec.pages)) {
                expect(SCREEN_PAGES, `${net} 화면 ${page}`).toContain(page);
                for (const r of rows) expect(PAGE_FIELDS, `${net} ${page} 칸 ${r.field}`).toContain(r.field);
            }
        }
    });

    it('read 는 JS 에서 깨지지 않고 공통 문법만 쓴다 · 1번 묶음이 있다', () => {
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) for (const [page, rows] of Object.entries(spec.pages)) for (const r of rows) {
            if (r.read === undefined) continue;
            const at = `${net} ${page} ${r.field}`;
            expect(() => new RegExp(r.read!), at).not.toThrow();
            expect(r.read, `${at} — \\p{} · 이름 묶음 · 소유 수량자 · 안쪽 플래그 금지`).not.toMatch(/\\p\{|\(\?<[A-Za-z]|\+\+|\*\+|\?\+|\(\?[imsx]/);
            /* \b · \w · \W · \B 금지 — JS(u 없음)는 한글을 낱말 글자로 안 보고 코틀린은 본다 · 같은 정규식이 둘에서 다른 답(«60분» 의 «0»과 «분» 사이를 JS 는 낱말 경계로 본다) */
            expect(r.read, `${at} — \\b · \\w · \\W · \\B 금지(한글 낱말 경계가 JS 와 코틀린에서 갈린다)`).not.toMatch(/\\[bBwW]/);
            expect(new RegExp(`${r.read}|`).exec('')!.length, `${at} — 1번 묶음`).toBeGreaterThanOrEqual(2);
        }
    });

    it('한 배차망 · 한 화면 · 한 칸(· 조각)에 읽는 법이 있는 줄은 하나 — 둘이면 서버와 원달앱이 다른 줄을 고를 수 있다', () => {
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) for (const [page, rows] of Object.entries(spec.pages)) {
            const readable = rows.filter(r => r.handling === 'READ' && r.read !== undefined).map(r => `${r.field}|${r.part ?? ''}`);   // 같은 칸이라도 조각(part)이 다르면 다른 줄
            expect(readable.filter((f, i) => readable.indexOf(f) !== i), `${net} ${page}`).toEqual([]);
        }
    });

    it('공통 문제지 — 서버가 쓰는 pageFieldOf · pageFareOf 로 읽어도 원달앱과 같은 답(같은 표 · 노드를 한 칸 띄어 이음)', () => {
        const sheet = JSON.parse(readFileSync(join(__dirname, 'pageReadCases.json'), 'utf8')) as { cases: Array<{ network: string; page: string; field: string; part?: string; texts: string[]; expect: string | null; fare?: number | null; why: string }> };
        for (const c of sheet.cases) {
            const at = `${c.network} ${c.page} ${c.field}${c.part ? '.' + c.part : ''} — ${c.why}`;
            expect(pageFieldOf(c.network as TargetAppType, c.page as ScreenPage, c.field as PageField, c.texts, c.part), at).toBe(c.expect);
            /* 💰 숫자로 바꾼 값 — 원달앱 PageFieldRead.fareOf 와 같은 규칙(쉼표 떼고 정수 · 0 이하 못 읽음) · 서버가 쓰는 함수 그대로 */
            if (c.fare !== undefined) expect(pageFareOf(c.network as TargetAppType, c.page as ScreenPage, c.texts), `${at} 요금 숫자`).toBe(c.fare);
        }
    });
});

/**
 * 🚫 **제외어를 찾는 칸** (기사님 «배차망별 칸에서만» · onedal-69 · onedal-46).
 * 인성 = 적요 + 결제 괄호 + 구분 · 화물24시 = 화물정보 + 결제방법 · 픽커 = 물품정보 + 유의사항. 주소 · 화주 이름 · 화면 머리 · 버튼 · 목록 잔상은 안 본다.
 * 칸마다 그 상세 화면 정의 줄의 읽는 법으로 읽는다(서버가 쓰는 pageFieldOf 그대로). 기사님 제외어 여섯(착불 · 수거 · 까대기 · 직접운반 · 왕복 · 대기)이 그 칸에서 걸린다.
 */
describe('제외어 찾는 칸 (excludeScan)', () => {
    it('배차망마다 칸 목록이 있고 · 칸마다 상세 화면 정의에 읽는 줄(READ + read)이 있다', () => {
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) {
            expect(spec.excludeScan.length, `${net} excludeScan`).toBeGreaterThan(0);
            for (const f of spec.excludeScan) {
                expect(PAGE_FIELDS, `${net} 칸 ${f}`).toContain(f);
                expect(spec.pages.newCall.some(r => r.field === f && r.handling === 'READ' && r.read !== undefined), `${net} newCall ${f} 읽는 법`).toBe(true);
            }
        }
    });

    it('공통 문제지 — 걸릴 낱말은 그 칸들에 있고 · 안 걸릴 낱말(주소 · 화주 · 머리 · 버튼)은 없다', () => {
        const sheet = JSON.parse(readFileSync(join(__dirname, 'pageReadCases.json'), 'utf8')) as { excludeCases: Array<{ network: TargetAppType; texts: string[]; hits: string[]; misses: string[]; why: string }> };
        expect(sheet.excludeCases.length).toBeGreaterThan(0);
        for (const c of sheet.excludeCases) {
            const scanned = excludeScanTextOf(c.network, c.texts);   // 서버 제외어 검사가 쓰는 함수 그대로
            for (const w of c.hits) expect(scanned, `${c.network} «${w}» 걸림 — ${c.why}`).toContain(w);
            for (const w of c.misses) expect(scanned, `${c.network} «${w}» 안 걸림 — ${c.why}`).not.toContain(w);
        }
    });
});

/**
 * 🏠 **주소 다듬기(addressCut)** — 아래 기준 답(BASE · 글자 그대로)과 견본마다 같은 답이어야 한다(판정 무변화를 묶는다).
 * 기준 답과 견본마다 대조한다 — 정규식을 «더 맞게» 고치면(예: 인성 `\([^)]*\)$`) 여기서 빨개진다.
 */
describe('주소 다듬기 (addressCut)', () => {
    const BASE: Record<string, (a: string) => string> = {
        insung: a => a.replace(/\(.*?\)$/g, '').trim(),
        hwamul24: a => a.split(',')[0].trim(),
        kakaopicker: a => a.trim(),
        isflex: a => a.trim(),
    };
    const SAMPLES = ['서울 강남구 역삼동 123 (역삼빌딩)', '가 (나) 다 (라)', '경기 군포 부곡동, 101동 1호', ' 용산 한남 ', '경기 광주시 경안동', '(앞괄호) 서울 중구', '', ',앞쉼표'];
    it('배차망마다 칸이 있고 · 공통 문법 · 기준 답과 같은 답', () => {
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) {
            expect(spec.addressCut === null || typeof spec.addressCut === 'string', `${net} addressCut`).toBe(true);
            if (spec.addressCut) expect(spec.addressCut, `${net} — 금지 문법`).not.toMatch(/\\p\{|\(\?<[A-Za-z]|\+\+|\*\+|\?\+|\(\?[imsx]|\\[bBwW]/);
            const cutOf = (a: string) => (spec.addressCut ? a.replace(new RegExp(spec.addressCut), '') : a).trim();
            for (const a of SAMPLES) expect(cutOf(a), `${net} «${a}»`).toBe(BASE[net](a));
        }
    });
});

describe('차종 낱말 (vehicleWords)', () => {
    it('대응한 우리 차종은 VEHICLE_OPTIONS 안(null = 우리 차종 없음) · 한 배차망에 같은 낱말은 하나 · 표가 있으면 까닭 한 줄도', () => {
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) {
            const words = spec.vehicleWords ?? [];
            for (const w of words) if (w.vehicle !== null) expect(VEHICLE_OPTIONS as readonly string[], `${net} ${w.word}`).toContain(w.vehicle);
            expect(new Set(words.map(w => w.word)).size, net).toBe(words.length);
            if (words.length) expect(spec.vehicleWordsWhy, net).toBeTruthy();
        }
    });
});

/**
 * 🖥️ **배차망 페이지 목록** (기사님 «모든 페이지 모든 팝업을 인지»).
 * 기준 값 · 덧칸 갈래는 정해진 낱말만 · 본 것은 근거가 있다 · 못 정한 것은 «모을 것»이 붙는다 · 목록 복귀는 지금 동작 그대로.
 */
describe('배차망 페이지 목록 (screens)', () => {
    const ROOT = join(__dirname, '../../../..');
    const all = Object.entries(NETWORK_PAGES).flatMap(([net, spec]) => spec.screens.map(s => ({ net, s })));
    /* 수락 뒤 픽커 캡처 폴더는 .gitignore 가 막는다 — 다른 기계에는 파일이 없다 */
    const ignored = (p: string) => p.startsWith('ex_images/카카오픽커/실물_2026/') || p.startsWith('ex_images/인성/인성설명서/');

    it('배차망마다 페이지가 있고 · 한 배차망 안에서 이름이 겹치지 않는다', () => {
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) {
            expect(spec.screens.length, net).toBeGreaterThan(0);
            const names = spec.screens.map(s => s.name);
            expect(names.filter((n, i) => names.indexOf(n) !== i), net).toEqual([]);
        }
    });

    it('기준 페이지는 STANDARD_SCREENS 낱말만 · null 은 «모을 것»이 붙는다', () => {
        for (const { net, s } of all) {
            if (s.standard === null) expect(s.toCollect, `${net} ${s.name}`).toBeTruthy();
            else expect(STANDARD_SCREENS, `${net} ${s.name}`).toContain(s.standard);
        }
    });

    it('알아보는 글자가 없으면(빈 match · 빈 갈래) «모을 것»이 붙는다 · 페이지와 덧칸 모두', () => {
        const empty = (m: { all?: string[]; any?: string[]; none?: string[]; shape?: unknown }) => !m.all?.length && !m.any?.length && !m.shape;
        for (const { net, s } of all) {
            for (const x of [s, ...s.overlays]) {
                if (x.match.length === 0 && !x.wordsFrom) expect(x.toCollect, `${net} ${s.name} · ${x.name}`).toBeTruthy();
                for (const m of x.match) expect(empty(m), `${net} ${s.name} · ${x.name} — 빈 갈래(all · any · shape 가 다 비면 무엇이든 맞는다)`).toBe(false);
                for (const m of x.match) if (m.shape) expect(() => new RegExp(m.shape!.read), `${net} ${x.name} shape`).not.toThrow();
            }
        }
    });

    it('덧칸 갈래는 POPUP · NOTICE · TOAST · BANNER 뿐', () => {
        for (const { net, s } of all) for (const o of s.overlays) expect(['POPUP', 'NOTICE', 'TOAST', 'BANNER'], `${net} ${s.name} · ${o.name}`).toContain(o.kind);
    });

    it('실물(REAL)로 본 것은 근거가 있다 · 근거가 비면 실물이 아니다', () => {
        for (const { net, s } of all) for (const x of [s, ...s.overlays]) {
            if (x.seen === 'REAL') expect(x.evidence.length, `${net} ${s.name} · ${x.name}`).toBeGreaterThan(0);
            if (x.evidence.length === 0) expect(x.seen, `${net} ${s.name} · ${x.name}`).toBe('UNKNOWN');
        }
    });

    it('캡처 근거 파일이 있다 · 근거에 날짜(YYYY-MM-DD)를 적지 않는다', () => {
        for (const { net, s } of all) for (const x of [s, ...s.overlays]) for (const e of x.evidence) {
            expect(e, `${net} ${x.name} — 날짜 대신 «폰 파일 시각»`).not.toMatch(/20\d{2}-\d{2}-\d{2}/);
            const path = e.split(' (')[0];
            if (path.startsWith('ex_images/') && !ignored(path)) expect(existsSync(join(ROOT, path)), `${net} ${x.name} — ${path}`).toBe(true);
        }
    });

    it('목록 복귀(listReturn)는 인성 완료 탭 · 화물24시 배차내역 목록뿐 — 지금 동작(LIST_COMPLETED)과 같다 · 픽커 내 오더는 아니다', () => {
        expect(all.filter(({ s }) => s.listReturn).map(({ net, s }) => `${net} ${s.name}`).sort()).toEqual(['hwamul24 배차내역 목록', 'insung 완료 탭']);
        expect(all.filter(({ s }) => s.listReturn).every(({ s }) => s.standard === 'MY_ORDERS')).toBe(true);
    });

    it('action 은 정해진 다섯 낱말만 · SKIP 은 토스트 · 팝업에만 · 채우기는 인성 팝업 셋뿐 · 픽커 «배정» 알림은 할 일 없음', () => {
        for (const { net, s } of all) for (const o of s.overlays) {
            if (o.action === undefined) continue;
            expect(['SKIP', 'FILL_PICKUP', 'FILL_DROPOFF', 'FILL_MEMO', 'ERROR'], `${net} ${o.name}`).toContain(o.action);
            if (o.action === 'SKIP') expect(['TOAST', 'POPUP'], `${net} ${o.name}`).toContain(o.kind);
            if (o.action.startsWith('FILL_')) expect(net, `${o.name} — 팝업으로 채우는 배차망은 인성뿐`).toBe('insung');
        }
        const assigned = NETWORK_PAGES.kakaopicker.screens.flatMap(s => s.overlays).find(o => o.kind === 'NOTICE' && o.name.includes('배정'));
        expect(assigned?.action).toBeUndefined();
    });

    it('질문 1 · 2 «가» — 픽커 «넘어가는 중» 기준 페이지가 있고 · 배차망 메뉴는 목록 복귀가 아니다', () => {
        expect(NETWORK_PAGES.kakaopicker.screens.some(s => s.standard === 'TRANSITION')).toBe(true);
        expect(all.filter(({ s }) => s.standard === 'NETWORK_MENU').every(({ s }) => !s.listReturn)).toBe(true);
    });
});

/**
 * 🧭 **화면 줄의 기준 페이지는 화면 종류에서 나온다** — 정의 표 줄에는 기준 페이지를 적지 않는다(사전 `BASE_PAGE_OF`).
 * 막는 것: 사전이 화면 종류를 빠뜨리거나 사전 밖 이름을 가리키는 것 · 기준 밖 화면 종류가 소속을 얻는 것 · 배차망에 기준 페이지 줄이 비는 것 · 결재 단추 줄이 둘로 갈라지는 것.
 */
describe('정의 표 — 화면 단추 글자', () => {
    type Buttons = { accept?: string; filterOut?: string; keep?: string; cancel?: string };
    const rowsOf = (net: TargetAppType, base: string) => NETWORK_PAGES[net].screens.filter(s => basePageOf(s.standard) === base && s.buttons);
    it('배차망마다 잡기 전 새 콜 화면(newCall) 단추 줄은 하나 — 수락 · 물러남 글자가 있다(원달앱이 누를지는 플러그인이 정한다)', () => {
        const want: Record<string, Buttons> = {
            insung: { accept: '확정', filterOut: '취소' }, hwamul24: { accept: '배차신청', filterOut: '돌아가기' }, kakaopicker: { accept: '수락하기', filterOut: '넘기기' },
            isflex: { accept: '수행하기', filterOut: '닫기' },
        };
        for (const net of TARGET_APPS) {
            const rows = rowsOf(net, 'newCall');
            expect(rows.length, net).toBe(1);
            expect(rows[0].buttons, net).toEqual(want[net]);
        }
    });
    it('내 콜 화면(myCall) 단추 줄은 배차망마다 0 또는 1 — 결재 단추가 두 갈래가 되지 않게 · 인성은 닫기 · 취소', () => {
        for (const net of TARGET_APPS) expect(rowsOf(net, 'myCall').length, net).toBeLessThanOrEqual(1);
        expect(rowsOf('insung', 'myCall')[0]?.buttons).toEqual({ keep: '닫기', cancel: '취소' });
    });
});

describe('정의 표 — 화면 줄의 기준 페이지', () => {
    const OUTSIDE = new Set<string>(['TRANSITION', 'NETWORK_MENU', 'OTHER_APP']);
    it('한 배차망 안에서 화면 줄 이름은 하나뿐 — 원달앱이 이름으로 화면 줄을 찾아 기준 페이지를 읽는다(ScreenWords.pageOf)', () => {
        for (const net of TARGET_APPS) {
            const names = NETWORK_PAGES[net].screens.map(s => s.name);
            expect(names.filter((n, i) => names.indexOf(n) !== i), net).toEqual([]);
        }
    });

    it('사전은 화면 종류를 하나도 빠뜨리지 않고 · 기준 밖(넘어가는 틀 · 배차망 메뉴 · 다른 앱)만 null · 값은 홈 + 새 네 이름', () => {
        expect(Object.keys(BASE_PAGE_OF).sort()).toEqual([...STANDARD_SCREENS].sort());
        for (const [std, base] of Object.entries(BASE_PAGE_OF)) {
            if (OUTSIDE.has(std)) expect(base, std).toBeNull();
            else expect(BASE_PAGES as readonly (string | null)[], std).toContain(base);
        }
        expect([...new Set(Object.values(BASE_PAGE_OF).filter(Boolean))].sort()).toEqual(['home', 'myCall', 'myList', 'newCall', 'newList']);
    });

    it('배차망마다 홈 · 새 콜 목록 · 새 콜 화면 · 내 콜 목록 · 내 콜 화면 줄이 하나 이상', () => {
        for (const net of TARGET_APPS) for (const base of BASE_PAGES) {
            expect(NETWORK_PAGES[net].screens.some(s => basePageOf(s.standard) === base), `${net} ${base}`).toBe(true);
        }
    });
});

/**
 * 🕳️ **자리 기록(`slotNotes`)의 모양** — 열쇠는 사전에서 파생한 자리뿐이고, 기록은 «없음 + 근거» 또는 «모름 + 모을 것» 하나다.
 * 배차망 × 자리마다 빠짐 없이 적혔는지(화면 줄 / 없음 / 모름 중 하나)는 `pagesDoc.test.ts` 가 묻는다.
 */
describe('정의 표 — 자리 기록 모양', () => {
    it('기록은 {why, evidence} 또는 {toCollect} 하나의 모양(열쇠가 사전의 자리인지는 pagesDoc.test.ts)', () => {
        for (const net of TARGET_APPS) {
            for (const [slot, note] of Object.entries(NETWORK_PAGES[net].slotNotes ?? {})) {
                const at = `${net} 자리 ${slot}`;
                expect(Object.keys(note).sort(), at).toEqual('why' in note ? ['evidence', 'why'] : ['toCollect']);
                for (const text of Object.values(note)) expect(String(text).trim(), `${at} 빈 글`).not.toBe('');
            }
        }
    });

    it('fieldsOf 는 그 배차망 · 그 페이지의 칸을 그대로 돌려준다', () => {
        expect(fieldsOf('insung', 'myCall').map(r => r.field)).toEqual(expect.arrayContaining(['pickup', 'dropoff', 'fare']));
        expect(fieldsOf('kakaopicker', 'myCall')).toBe(NETWORK_PAGES.kakaopicker.pages.myCall);
    });
});

/**
 * 🪟 **콜 한 건 화면 위 부속 팝업(`callOverlays`)** — 한 번 적고, 불러올 때 새 콜 화면 · 내 콜 화면 줄 덧칸 맨 앞에 붙는다.
 * 같은 붙이기 법을 생성 스크립트와 원달앱 짝 검사도 자기 쪽에서 구현한다 — 여기서는 사전 · 배차망 파일의 글자를 직접 읽어 불러온 결과와 견준다.
 * 못 잡는 것: 생성 스크립트 · 원달앱 쪽 구현이 같은지(원달앱 `NetworkPagesPairTest` 몫).
 */
describe('정의 표 — 부속 팝업(callOverlays)', () => {
    const jsonOf = (file: string) => JSON.parse(readFileSync(join(__dirname, file), 'utf8').match(/\/\*JSON\*\/([\s\S]*?)\/\*JSON\*\//)![1]);
    const book = jsonOf('pageFields.ts');
    const SLOT_ORDER = Object.keys(book.callOverlays);

    it('불러온 덧칸 = 글자 표를 같은 법(해당 줄 덧칸 맨 앞에 자리 차례로 붙이기)으로 읽은 결과', () => {
        for (const net of TARGET_APPS) {
            const raw = jsonOf(`networkPages.${net}.ts`);
            const front = SLOT_ORDER.flatMap((slot) => (raw.callOverlays ?? []).filter((o: any) => o.slot === slot));
            raw.screens.forEach((s: any, i: number) => {
                const base = book.baseOf[s.standard] ?? null;
                const want = base === 'newCall' || base === 'myCall' ? [...front, ...s.overlays] : s.overlays;
                expect(NETWORK_PAGES[net].screens[i].overlays, `${net} «${s.name}»`).toEqual(want);
            });
        }
    });

    it('같은 배차망 안에서 자리(slot)는 상차지 · 하차지 · 적요가 각각 하나 · 자리가 있는 덧칸은 상세를 채우는 일(FILL_*)이다', () => {
        for (const net of TARGET_APPS) {
            const parts = NETWORK_PAGES[net].callOverlays ?? [];
            if (!parts.length) continue;
            expect(parts.map(o => o.slot).sort(), net).toEqual([...SLOT_ORDER].sort());
            for (const o of parts) expect(o.action, `${net} ${o.slot}`).toMatch(/^FILL_/);
        }
    });

    it('인성 — 붙인 뒤 두 줄의 덧칸 차례가 팝업 셋이 맨 앞 · 그 줄만의 덧칸이 뒤', () => {
        const names = (screen: string) => NETWORK_PAGES.insung.screens.find(s => s.name === screen)!.overlays.map(o => o.name);
        const front = ['출발지 상세 팝업', '도착지 상세 팝업', '적요 상세 팝업'];
        expect(names('확정 전 상세')).toEqual([...front, '계산서 오더 안내 띠', '확정 확인 팝업', '이미 배차됨 팝업', '확정 실패 팝업']);
        expect(names('확정 뒤 상세')).toEqual([...front, '취소 확인 팝업', '취소 불가 팝업']);
    });

    it('팝업을 안 적은 배차망 · 새 콜 화면이나 내 콜 화면이 아닌 줄의 덧칸에는 자리(slot)가 붙지 않는다', () => {
        for (const net of TARGET_APPS) for (const s of NETWORK_PAGES[net].screens) {
            const base = basePageOf(s.standard);
            if (NETWORK_PAGES[net].callOverlays && (base === 'newCall' || base === 'myCall')) continue;
            expect(s.overlays.filter(o => 'slot' in o), `${net} «${s.name}»`).toEqual([]);
        }
    });
});

/**
 * 🧾 **늘 있음 / 있다 없다 — 분류 규칙대로 적혔나** (59 2단계 · 기사님 «모든 캡처에 있는 것 = 늘 있는 것, 일부에만 있는 것 = 있다 없다»).
 * 규칙은 networkPages.ts 머리 · 세 배차망 같다. 근거(seen/of)와 분류가 어긋나면 빨갛다.
 * 못 잡는 것: 센 숫자가 캡처와 맞는지(사람이 센다 — 근거 from 에 캡처 자리) · 캡처에 없던 모양.
 */
describe('🧾 칸의 늘 있음 / 있다 없다', () => {
    const rows = Object.entries(NETWORK_PAGES).flatMap(([net, spec]) =>
        Object.entries(spec.pages).flatMap(([page, rs]) => rs.map(r => ({ at: `${net} ${page} ${r.field}${r.part ? `.${r.part}` : ''}`, r }))));
    it('🔴 모름이 아니면 실물(REAL)이고 근거가 있다 · 분류가 근거 숫자와 맞다', () => {
        for (const { at, r } of rows) {
            if (!r.presence || r.presence === 'UNKNOWN') continue;
            expect(r.seen, `${at} — 실물로만 매긴다`).toBe('REAL');
            const e = r.presenceEvidence;
            expect(e && e.of > 0 && e.seen >= 0 && e.seen <= e.of && e.from.length > 0, `${at} 근거`).toBe(true);
            if (r.presence === 'ALWAYS') expect(e!.seen, `${at} 늘 있음 = 보인 콜 전부`).toBe(e!.of);
            if (r.presence === 'ONCE') expect(e!.seen, `${at} 한 번만`).toBe(1);
            if (r.presence === 'SOMETIMES') expect(e!.seen > 1 && e!.seen < e!.of, `${at} 있다 없다 = 일부(둘 이상 · 전부 아님)`).toBe(true);
        }
    });
    it('🔴 픽커 상세는 칸마다 분류가 있다(실물 캡처로 셌다)', () => {
        for (const r of NETWORK_PAGES.kakaopicker.pages.newCall) expect(r.presence, `kakaopicker newCall ${r.field}${r.part ? `.${r.part}` : ''}`).toBeTruthy();
    });
    it('픽커 상세 — 배송 시각은 늘 있음 · 픽업 시각은 있다 없다(기사님 물음 «~까지 픽업도 사라짐에 드나»의 답)', () => {
        const at = (part: string) => NETWORK_PAGES.kakaopicker.pages.newCall.find(r => r.field === 'clock' && r.part === part)?.presence;
        expect(at('dropoff')).toBe('ALWAYS');
        expect(at('pickup')).toBe('SOMETIMES');
    });
});

/**
 * 🧾 **늘 있던 칸이 없으면 리뉴얼 신호** (58 ②) — 표의 ALWAYS · 읽는 법 있는 칸만 본다.
 * 못 잡는 것: 읽는 법이 없는 늘 있음 칸(퀵 꼬리표 · km 머리 · 최종 수익 · 배송비 — 표식 글자가 필요).
 */
describe('🧾 늘 있던 칸이 없나', () => {
    const ACC = '픽업지 경기 성남시 수정구 신촌동 물품 정보 소형 세 변의 합 100cm ∙ 5kg 이하 최종 수익 10,830 넘기기 수락하기';
    const PHOTO = '[사진]\n퀵 비즈\n서울 광진구 자양2동 배송 9.7km\n18:28까지 배송\nNC이스트폴';
    it('🔴 실물 16:51 픽커 — 접근성 + 판독 줄이면 빠진 것 없음 · 판독 줄이 없으면 배송 시각이 없다', () => {
        expect(missingAlwaysOf('kakaopicker', 'newCall', `${ACC}\n${PHOTO}`)).toEqual([]);
        expect(missingAlwaysOf('kakaopicker', 'newCall', ACC)).toEqual(['clock.dropoff']);
    });
    it('물품 정보 이름표가 바뀌면(리뉴얼) 그 칸이 빠졌다고 말한다', () => {
        expect(missingAlwaysOf('kakaopicker', 'newCall', `${ACC.replace('물품 정보', '배송 물품')}\n${PHOTO}`)).toEqual(['itemSize']);
    });
});

/**
 * 🎯 **옛 칸으로 넘기는 칸** (계획서 F2-a · 기사님 «가») — 표에서 뺀 칸 = 문제지의 자료로 정한다(검사에 배차망 이름을 두지 않는다).
 * 뺀 칸 = «옛 칸에 없던 값»(notInOldYet) − «표는 넘기지만 그 사례만 값이 다른 칸»(passedButDiffers) + «옛 길은 상세 글에서 읽는 칸»(oldReadsFromText).
 */
describe('🎯 옛 칸으로 넘기는 칸 (officeFields)', () => {
    type Case = { network: string; notInOldYet?: string[]; passedButDiffers?: string[]; oldReadsFromText?: string[] };
    const SHEET = JSON.parse(readFileSync(join(__dirname, 'callMergeCases.json'), 'utf8')) as { cases: Case[] };
    const all = (cases: Case[], key: 'notInOldYet' | 'passedButDiffers' | 'oldReadsFromText') => new Set(cases.flatMap((c) => c[key] ?? []));
    /* 등록된 배차망 전체 — 새 배차망이 TARGET_APPS 에 들어오면 표를 안 적은 날 여기서 빨갛다 */
    it.each([...TARGET_APPS])('%s — 뺀 칸 = 옛 칸에 없던 값 · 상세 글에서 읽는 칸', (net) => {
        const cases = SHEET.cases.filter((c) => c.network === net);
        const dropped = OFFICE_FIELDS.filter((f) => !officeFieldsOf(net).includes(f)).sort();
        const differs = all(cases, 'passedButDiffers');
        const expected = new Set([...all(cases, 'notInOldYet')].filter((f) => !differs.has(f)));
        all(cases, 'oldReadsFromText').forEach((f) => expected.add(f));
        expect(dropped).toEqual([...expected].sort());
    });
    it('🔴 모르는 배차망은 아무 칸도 안 넘긴다 — 새 배차망이 표를 안 적으면 다 막힌다', () => expect(officeFieldsOf('onecall')).toEqual([]));
});
