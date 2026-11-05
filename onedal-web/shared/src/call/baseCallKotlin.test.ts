// @ts-nocheck
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { KOTLIN_PATH, SHAPES_PATH, renderBaseCallKotlin } from '../../../scripts/lib/base-call-kotlin.mjs';

/**
 * 🎯 **원달앱 기본 콜 모양은 orderShapes 에서 뽑은 그대로다** (계획서 B3).
 * 타입을 고치고 안 뽑거나 코틀린을 손으로 고치면 빨갛다.
 */
describe('🎯 기본 콜 코틀린 짝', () => {
    it('다시 뽑은 글 = 파일', () => {
        expect(readFileSync(KOTLIN_PATH, 'utf8')).toBe(renderBaseCallKotlin());
    });
    it('🔴 타입에 칸이 늘면 뽑는 글도 는다', () => {
        const more = readFileSync(SHAPES_PATH, 'utf8').replace('export interface CallJob {', 'export interface CallJob {\n    newField?: string;');
        expect(renderBaseCallKotlin(more)).toContain('val newField: String? = null');
    });
    it('🔴 원달앱이 안 보내는 값은 뽑지 않는다 — 잡은 뒤 값 · 판정 답', () => {
        const text = renderBaseCallKotlin();
        for (const name of ['NetworkProgress', 'CallSettlement', 'BaseCallFacts', 'NetworkLineRules', 'CallReport']) expect(text).not.toContain(`class ${name}`);
    });
    it('🔴 묶음 칸을 글자로 뭉개지 않는다 — 기록의 바뀐 칸', () => {
        expect(renderBaseCallKotlin()).toContain('val changed: List<EvidenceLineChanged>? = null');
    });
    it('🔴 뺀 칸은 코틀린에도 없다 — 마일리지 · 요청 시각', () => {
        const stop = renderBaseCallKotlin().match(/data class CallStop\(([\s\S]*?)\n\)/)[1];
        expect(stop).toContain('val loadingMethod');
        expect(stop).toContain('val addressDetail');
        expect(stop).not.toContain('mileage');
        expect(stop).not.toContain('requestedTime');
    });
});
