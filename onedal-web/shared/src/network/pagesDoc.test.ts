import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TARGET_APPS } from '../index';
import { BASE_PAGE_BOOK, BASE_PAGES } from './pageFields';

/**
 * 📄 **기준 페이지 사전표는 사전 + 배차망 정의 표에서 뽑은 글이다 — 갈라질 수 없다.**
 * 뽑기 함수는 `scripts/lib/base-page-doc.mjs`(생성 스크립트 `pnpm gen:pages doc` 도 같은 함수)이고, 여기서 바로 가져와 견준다.
 * 막는 것: 정의 표를 고치고 사전표를 안 뽑는 것 · 배차망 × 자리에 «화면 줄 / 없음 + 근거 / 모름 + 모을 것» 어느 것도 없는 칸 · 화면 줄이 있는데 «없음»으로 적은 칸.
 * 못 잡는 것: 정의 표에 적힌 사실이 실물과 맞는지(시뮬레이터 글자 · 실물 첫날 확인 몫).
 */
const LIB = join(__dirname, '../../../scripts/lib/base-page-doc.mjs');
const DOC = join(__dirname, '../../../../설계/기준페이지_사전표.md');

async function sources() {
    const lib: any = await import(/* @vite-ignore */ LIB);
    const book = lib.readJsonBlock(join(__dirname, 'pageFields.ts'));
    const specs: Record<string, any> = Object.fromEntries(TARGET_APPS.map((net) => [net, lib.readJsonBlock(join(__dirname, `networkPages.${net}.ts`))]));
    const labels = lib.networkNames(specs);
    return { lib, book, specs, labels };
}

describe('기준 페이지 사전표', () => {
    it('배차망 × 자리마다 «화면 줄 / 없음 + 근거 / 모름 + 모을 것» 중 하나가 있다', async () => {
        const { lib, book, specs } = await sources();
        expect(lib.slotProblems(book, specs)).toEqual([]);
    });

    it('자리 열쇠와 차례가 TS 로 불러온 사전(기준 페이지 · 운행 단계 · 부속 팝업)과 같다', async () => {
        const { lib, book } = await sources();
        expect(lib.slotKeys(book)).toEqual([...BASE_PAGES, ...Object.keys(BASE_PAGE_BOOK.runStages), ...Object.keys(BASE_PAGE_BOOK.callOverlays)]);
    });

    it('사전 + 정의 표에서 다시 뽑은 글 = 설계/기준페이지_사전표.md — 다르면 cd onedal-web && pnpm gen:pages doc', async () => {
        const { lib, book, specs, labels } = await sources();
        expect(lib.renderBasePageDoc(book, specs, labels)).toBe(readFileSync(DOC, 'utf8'));
    });

    it('🔴 일부러 어긋나게 만든 사본은 잡힌다 — 모름 기록을 지우면 · 화면 줄이 있는 자리에 «없음»을 적으면 · 사전에 없는 자리를 적으면', async () => {
        const { lib, book, specs } = await sources();
        const fork = () => structuredClone(specs);

        const noNote = fork();
        delete noNote.hwamul24.slotNotes.RUN_DONE;
        expect(lib.slotProblems(book, noNote).join(' ')).toContain('hwamul24 자리 «RUN_DONE»');

        const falseNone = fork();
        falseNone.insung.slotNotes = { ...falseNone.insung.slotNotes, newList: { why: '없다', evidence: '캡처' } };
        expect(lib.slotProblems(book, falseNone).join(' ')).toContain('insung 자리 «newList» — 화면 줄이 있는데');

        const unknownSlot = fork();
        unknownSlot.isflex.slotNotes = { ...unknownSlot.isflex.slotNotes, nowhere: { toCollect: '?' } };
        expect(lib.slotProblems(book, unknownSlot).join(' ')).toContain('사전에 없는 자리');

        const bothKinds = fork();
        bothKinds.kakaopicker.slotNotes.pickup = { why: '없다', evidence: '캡처', toCollect: '모른다' };
        expect(lib.slotProblems(book, bothKinds).join(' ')).toContain('kakaopicker 자리 «pickup»');
    });

    it('🔴 정의 표 글이 바뀌면 다시 뽑은 글이 파일과 달라진다', async () => {
        const { lib, book, specs, labels } = await sources();
        const changed = structuredClone(specs);
        changed.isflex.slotNotes.RUN_DONE = { toCollect: '다른 글' };
        expect(lib.renderBasePageDoc(book, changed, labels)).not.toBe(readFileSync(DOC, 'utf8'));
    });
});
