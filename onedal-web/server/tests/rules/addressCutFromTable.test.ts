import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { addressOf } from '@onedal/shared';

/**
 * 🏠 **카카오에 묻기 전 주소 다듬기 — 배차망 정의 표 한 곳** (reviews/34 3단계 5② · 판정 무변화).
 *    정의 표의 배차망 단위 칸 addressCut 으로 다듬은 답이 아래 기준 답(BASE)과 글자까지 같다 — 인성 «끝의 (건물명)» · 화물24시 «첫 쉼표 뒤» · 픽커 자르기만.
 *    서버는 배차망 플러그인을 두지 않는다 — 배차망마다 다른 것은 정의 표에만 있다.
 */
const BASE: Record<'insung' | 'hwamul24' | 'kakaopicker', (raw: string) => string> = {
    insung: raw => raw.replace(/\(.*?\)$/g, '').trim(),
    hwamul24: raw => raw.split(',')[0].trim(),
    kakaopicker: raw => raw.trim(),
};
const SAMPLES = [
    '경기 용인시 처인구 양지면 남평로 12 (양지물류)',
    '가 (나) 다 (라)',
    '서울 강남구 역삼동 (주)가나상사 2층',
    '경기 군포 부곡동, 3층 물류창고',
    '서울 중구 을지로6가,,',
    '  경기 광주시 경안동  ',
    '경기 광주시 경안동 / 람미당',
    '',
];

describe('🏠 주소 다듬기 — 정의 표', () => {
    it.each(Object.keys(BASE) as Array<keyof typeof BASE>)('🔴 %s — 기준 답과 글자까지 같은 답', app => {
        for (const raw of SAMPLES) expect([app, raw, addressOf(app, raw)]).toEqual([app, raw, BASE[app](raw)]);
    });
    it('🔴 서버 어디서도 배차망 플러그인을 부르지 않는다', () => {
        const SRC = join(__dirname, '../../src');
        const users = (readdirSync(SRC, { recursive: true }) as string[])
            .filter(f => String(f).endsWith('.ts') && !String(f).startsWith('core/plugins/'))
            .filter(f => /core\/plugins\/|PluginFactory|IAppPlugin/.test(readFileSync(join(SRC, String(f)), 'utf8')));
        expect(users).toEqual([]);
    });
});
