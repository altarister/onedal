import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { addressOf } from '@onedal/shared';

/**
 * 🏠 **카카오에 묻기 전 주소 다듬기 — 배차망 정의 표 한 곳** (reviews/34 3단계 5② · onedal-69 «진행» · 판정 무변화).
 *    옛 서버 플러그인 normalizeAddress 셋을 정의 표의 배차망 단위 칸 addressCut 으로 옮겼다 — 답은 글자까지 같다.
 *    이제 서버는 플러그인을 부르지 않는다(늘 빈 목록이던 evaluateCustomRules 도 함께 걷음 — 판정 무변화).
 *    아래 OLD 는 옛 플러그인 몸통을 그대로 옮긴 것이다(대조용 · 바꾸지 않는다).
 */
const OLD: Record<'insung' | 'hwamul24' | 'kakaopicker', (raw: string) => string> = {
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
    it.each(Object.keys(OLD) as Array<keyof typeof OLD>)('🔴 %s — 옛 플러그인과 글자까지 같은 답', app => {
        for (const raw of SAMPLES) expect([app, raw, addressOf(app, raw)]).toEqual([app, raw, OLD[app](raw)]);
    });
    it('🔴 서버 어디서도 배차망 플러그인을 부르지 않는다 — 플러그인 폴더는 «지워도 되는 상태»(지우기는 기사님 몫)', () => {
        const SRC = join(__dirname, '../../src');
        const users = (readdirSync(SRC, { recursive: true }) as string[])
            .filter(f => String(f).endsWith('.ts') && !String(f).startsWith('core/plugins/'))
            .filter(f => /core\/plugins\/|PluginFactory|IAppPlugin/.test(readFileSync(join(SRC, String(f)), 'utf8')));
        expect(users).toEqual([]);
    });
});
