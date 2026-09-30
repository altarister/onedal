import { readFileSync } from 'fs';
import { join } from 'path';
import { DEVICE_TOKEN_HEADER, DEVICE_LINK_ERRORS, PAIR_TOKEN_FIELD } from '@onedal/shared';

/**
 * 🔐 **기기 비밀 토큰 규격 글자 — shared 한 곳 = 원달앱 한 파일** (운영센터 1단계 · reviews/29 · 기사님 «공통으로 할 수 있는 것을 최대한»).
 * 서버는 shared 를 import 하고, 원달앱(코틀린)은 `core/DeviceLink.kt` 에 같은 글자를 둔다. 둘이 갈리면 폰이 거절을 못 알아보거나
 * 토큰 헤더가 안 읽혀 강제 뒤 모든 폰이 끊긴다 — 그래서 글자를 맞대어 본다(`appFilterKeys.test.ts` 와 같은 모양).
 */
const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const constOf = (src: string, name: string) => new RegExp(`const val ${name} = "([^"]*)"`).exec(src)?.[1];

describe('기기 토큰 규격 글자 — shared = 원달앱', () => {
    const link = readFileSync(join(APP, 'core/DeviceLink.kt'), 'utf8');
    const models = readFileSync(join(APP, 'models/SharedModels.kt'), 'utf8');

    it('헤더 이름', () => {
        expect(constOf(link, 'HEADER')).toBe(DEVICE_TOKEN_HEADER);
    });

    it('거절 코드 넷', () => {
        expect(constOf(link, 'ERR_TOKEN_INVALID')).toBe(DEVICE_LINK_ERRORS.TOKEN_INVALID);
        expect(constOf(link, 'ERR_NOT_PAIRED')).toBe(DEVICE_LINK_ERRORS.NOT_PAIRED);
        expect(constOf(link, 'ERR_PIN_INVALID')).toBe(DEVICE_LINK_ERRORS.PIN_INVALID);
        expect(constOf(link, 'ERR_ACCOUNT_BLOCKED')).toBe(DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED);
    });

    it('짝 응답의 토큰 칸 — 앱 상수와 Gson 이 읽는 칸 이름', () => {
        expect(constOf(link, 'PAIR_TOKEN_FIELD')).toBe(PAIR_TOKEN_FIELD);
        const pair = /data class PairDeviceResponse\(([\s\S]*?)\n\)/.exec(models)?.[1] ?? '';
        expect(pair).toContain(`val ${PAIR_TOKEN_FIELD}: String?`);
    });
});
