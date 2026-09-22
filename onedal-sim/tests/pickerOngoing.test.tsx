// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { PickerCallDetailScreen, PickerOngoingScreen, PickerSimScreen } from '@altari/ui-simulators';
import type { NetScreenProps } from '@altari/ui-simulators';
import { FIXED_NOW } from './seededRandom';
import { PickerDispatchBoard } from '@altari/ui-simulators';
import { pickerA, pickerB, pickerWalk } from './fixtures';

/**
 * 🚚 **픽커 수락 뒤 단계**
 *
 * 실물 순서 (`ex_images/카카오픽커/실물_2026/` 15 · 16~17 · 21~22 · 25 · 26 · 30 · 31):
 *   수락 → «내 오더» 탭(15) → 픽업 이동(16) → 아래 창을 끌어 올리면 «밀어서 픽업 완료»(17) → 배송 중(21)
 *   → 창을 끌어 올리면 «밀어서 사진 촬영»(22) → 인증사진 촬영(25) → 촬영 확인 · 문자 전송(26)
 *   → «문자 전송 후 배송 완료버튼을 눌러주세요» · 배송 완료(30) → 배송 완료 · 오더 목록 보기(31)
 * 모양은 달라도 **단계와 버튼 순서는 실물과 같다** (기사님: «이미지와 같지는 않아도 단계는 같아야»).
 *
 * 원달앱은 이 글자로 운행 단계를 안다 (`KakaoPickerKeywords.STAGE_WORDS`) — `🚚 [운행 단계] … → …` 로그.
 * 🔴 **한 화면에 다른 단계 글자가 섞이면 원달앱이 단계를 잘못 읽는다.** 픽업 이동 화면에도 «배송 33분 남음»이 있는데
 *    «배송 시간»이 섞이면 배송 중으로 읽는다.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 🔴 원달앱 `KakaoPickerKeywords.STAGE_WORDS` 와 **같은 글자** — 일부러 옮겨 적었다.
 * 시뮬레이터는 원달앱(Kotlin)을 가져다 쓸 수 없다. 원달앱 쪽 낱말이 바뀌면 이 표도 바꾼다.
 */
const STAGE_WORDS: Record<string, string[]> = {
    HOME: ['시작하기'],
    DONE: ['물품이 안전하게 전달'],
    AT_PICKUP: ['밀어서 픽업 완료'],
    AT_DROPOFF: ['밀어서 사진 촬영'],
    TO_DROPOFF: ['배송 시간', '물품 파손'],
    TO_PICKUP: ['픽업 준비', '픽업지 근처에'],
};
/** 🔴 원달앱 `KakaoPickerKeywords.QUICK_PAGE_MARKERS` · `QUICK_STAGE_BUTTONS` 와 같은 글자 — 퀵 흰 페이지는 표식 + 바닥 버튼 두 겹으로 가른다 */
const QUICK_PAGE_MARKERS = ['픽업지 정보', '도착지 정보', '픽업지 주소 복사하기', '픽업지에 전화하기', '도착지 주소 복사하기', '도착지에 전화하기'];
const QUICK_STAGE_BUTTONS: [string, string][] = [
    ['AT_DROPOFF', '배송 완료하기'], ['TO_DROPOFF', '배송 출발하기'], ['AT_PICKUP', '픽업 완료하기'], ['TO_PICKUP', '픽업 출발하기'],
];
/** 원달앱 `stageOf` 와 같은 순서로 — «수락하기»가 보이면 수락 전 · 퀵 페이지면 버튼 · 아니면 먼저 걸리는 단계가 답 */
const stageOf = (text: string): string | null => {
    if (text.includes('수락하기')) return null;
    if (QUICK_PAGE_MARKERS.some(m => text.includes(m))) {
        const hit = QUICK_STAGE_BUTTONS.find(([, button]) => text.includes(button));
        if (hit) return hit[0];
    }
    for (const [stage, words] of Object.entries(STAGE_WORDS)) if (words.some(w => text.includes(w))) return stage;
    return null;
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const mount = (el: ReactElement) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => { root!.render(el); });
};
const rerender = (el: ReactElement) => act(() => { root!.render(el); });
const text = () => (host!.textContent ?? '');
const buttonByText = (t: string) => [...host!.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === t);
const click = (t: string) => {
    const b = buttonByText(t);
    expect(b, `«${t}» 버튼이 없다`).toBeTruthy();
    act(() => { b!.click(); });
};
const chunk = (t: string) => [...host!.querySelectorAll('div')].some(d => d.children.length === 0 && (d.textContent ?? '').trim() === t);
const clickLabel = (label: string) => {
    const b = host!.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
    expect(b, `«${label}» 버튼이 없다`).toBeTruthy();
    act(() => { b!.click(); });
};

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });   // 09:00 · pickerA 픽업 09:30 · 배송 11:00
afterEach(() => {
    act(() => { root?.unmount(); });
    host?.remove();
    root = null; host = null;
    vi.useRealTimers();
});

describe('상세 «수락하기»', () => {
    it('🔴 누르면 수락한다 — 3단계에서 비워 둔 버튼을 잇는다', () => {
        const onAccept = vi.fn();
        mount(<PickerCallDetailScreen call={pickerA} onClose={() => {}} onAccept={onAccept} />);
        click('수락하기');
        expect(onAccept).toHaveBeenCalledTimes(1);
    });
});

describe('수락 뒤 단계 — 실물 순서', () => {
    it('🔴 픽업 이동 → 창 올리기 · 밀어서 픽업 완료 → 배송 중 → 창 올리기 · 밀어서 사진 촬영 → 인증사진 촬영 → 촬영 확인 · 문자 전송 → 배송 완료 → 오더 목록 보기', () => {
        const onFinish = vi.fn();
        mount(<PickerOngoingScreen call={pickerWalk} onBack={() => {}} onFinish={onFinish} />);

        // 픽업 이동 (실물 16) — «오더 확인»을 누르는 단계는 없다 · «밀어서 픽업 완료»는 창을 올려야 나온다
        expect(stageOf(text())).toBe('TO_PICKUP');
        expect(chunk('픽업 준비 30분 남음')).toBe(true);
        expect(chunk('배송 120분 남음')).toBe(true);
        expect(chunk('픽업지 근처에 가시면 오더 정보를 확인하세요')).toBe(true);
        expect(text()).not.toContain('배송 시간');
        expect(text()).not.toContain('밀어서 픽업 완료');
        expect(buttonByText('오더 확인')).toBeFalsy();

        // 창을 끌어 올린다 (실물 17)
        clickLabel('아래 창 올리기');
        expect(stageOf(text())).toBe('AT_PICKUP');
        expect(chunk(pickerWalk.orderNo)).toBe(true);

        // 배송 중 (실물 21)
        click('밀어서 픽업 완료');
        expect(stageOf(text())).toBe('TO_DROPOFF');
        expect(chunk('배송 시간 120분 남음')).toBe(true);
        expect(chunk('물품 파손/분실을 주의해 이동해주세요')).toBe(true);
        expect(text()).not.toContain('픽업 준비');
        expect(text()).not.toContain('밀어서 사진 촬영');

        // 창을 끌어 올린다 (실물 22)
        clickLabel('아래 창 올리기');
        expect(stageOf(text())).toBe('AT_DROPOFF');

        // 인증사진 촬영 (실물 25) — 원달앱이 아는 단계 글자가 없다
        click('밀어서 사진 촬영');
        expect(stageOf(text())).toBeNull();
        expect(chunk('물품과 장소가 함께 보이도록 촬영해주세요')).toBe(true);
        click('인증사진 촬영');

        // 촬영 확인 · 문자 전송 (실물 26)
        expect(chunk('촬영 확인')).toBe(true);
        expect(chunk('고객에게 문자로 사진 전송')).toBe(true);
        expect(stageOf(text())).toBeNull();
        click('문자 전송');

        // 문자 전송 후 배송 완료 (실물 30)
        expect(chunk('배송 완료버튼을 눌러주세요.')).toBe(true);
        expect(stageOf(text())).toBeNull();
        click('배송 완료');

        // 배송 완료 (실물 31)
        expect(stageOf(text())).toBe('DONE');
        expect(chunk('16,870P')).toBe(true);
        click('오더 목록 보기');
        expect(onFinish).toHaveBeenCalledWith(pickerWalk);
    });

    it('🔴 창은 손으로 끌어 올려도(스크롤) 올라온다 — 실물은 시트를 끌어 올린다', () => {
        mount(<PickerOngoingScreen call={pickerWalk} onBack={() => {}} onFinish={() => {}} />);
        const sheet = host!.querySelector('[data-sheet-scroll]') as HTMLDivElement;
        expect(sheet).toBeTruthy();
        act(() => { sheet.scrollTop = 60; sheet.dispatchEvent(new Event('scroll')); });
        expect(stageOf(text())).toBe('AT_PICKUP');
    });

    it('«오더 전체»(실물 23 · 지금 들어가는 길 없음) — 픽업지 · 배송지 · 오더 확인 · 최종 수익 · ✕ 를 누르면 내 오더로 (다음에 열면 픽업 이동)', () => {
        const onBack = vi.fn();
        const onStepChange = vi.fn();
        mount(<PickerOngoingScreen call={pickerA} initialStep="OVERVIEW" onStepChange={onStepChange} onBack={onBack} onFinish={() => {}} />);
        expect(chunk('오더 정보')).toBe(true);
        expect(chunk('최종 수익')).toBe(true);
        expect(chunk(pickerA.orderNo)).toBe(true);
        expect(chunk('16,870')).toBe(true);
        expect(stageOf(text())).toBeNull();   // 원달앱이 아는 단계 글자가 없다 — 실물도 내 오더 · 픽업 이동에서 수락을 안다
        clickLabel('닫기');
        expect(onStepChange).toHaveBeenCalledWith('TO_PICKUP');
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('촬영 확인에서 «재촬영»은 인증사진 촬영으로 돌아간다', () => {
        mount(<PickerOngoingScreen call={pickerA} initialStep="PHOTO_CHECK" onBack={() => {}} onFinish={() => {}} />);
        click('재촬영');
        expect(chunk('물품과 장소가 함께 보이도록 촬영해주세요')).toBe(true);
    });

    it('🔴 «밀어서 …» 는 밀어도 넘어간다 (실물은 밀기 · 시뮬레이터는 누르기와 밀기 둘 다)', () => {
        mount(<PickerOngoingScreen call={pickerWalk} onBack={() => {}} onFinish={() => {}} />);
        clickLabel('아래 창 올리기');
        const slide = buttonByText('밀어서 픽업 완료')!;
        act(() => {
            slide.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10 }));
            slide.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 250 }));
        });
        // 밀기는 한 박자 뒤에 넘긴다 — 손을 뗄 때 따라오는 «누르기»가 새 화면의 버튼을 누르지 않게
        act(() => { vi.runAllTimers(); });
        expect(stageOf(text())).toBe('TO_DROPOFF');
    });

    it('픽업 마감이 지났으면 «픽업 준비 완료» (실물 18)', () => {
        vi.setSystemTime(new Date('2026-09-14T09:40:00+09:00'));
        mount(<PickerOngoingScreen call={pickerWalk} onBack={() => {}} onFinish={() => {}} />);
        expect(chunk('픽업 준비 완료')).toBe(true);
        expect(stageOf(text())).toBe('TO_PICKUP');
    });

    it('🔴 «배정 취소» — 「배정 취소 불가」 팝업 (실물 19 · 픽커는 수락이 곧 계약)', () => {
        mount(<PickerOngoingScreen call={pickerWalk} onBack={() => {}} onFinish={() => {}} />);
        click('배정 취소');
        expect(chunk('배정 취소 불가')).toBe(true);
        click('확인');
        expect(chunk('배정 취소 불가')).toBe(false);
        expect(stageOf(text())).toBe('TO_PICKUP');
    });
});

describe('픽업 이동 · 배송 중 — 지도 위 시트 (실물 16~18 · 21~22)', () => {
    const sheet = () => host!.querySelector<HTMLElement>('[data-sheet]')!;
    /** 손잡이를 끈다 — 누름 → 뗌 사이의 세로 거리 */
    const drag = (dy: number) => {
        const handle = host!.querySelector<HTMLElement>('[data-sheet-drag]')!;
        act(() => {
            handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 400 }));
            handle.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientY: 400 + dy }));
        });
        act(() => { vi.advanceTimersByTime(1); });
    };

    it('🔴 지도가 시트 뒤 화면 전체에 깔린다 — 픽업 이동은 시트 «중», 끌어 올리면 «상»이어도 지도가 남는다 (실물 16 · 17)', () => {
        mount(<PickerOngoingScreen call={pickerWalk} onBack={() => {}} onFinish={() => {}} />);
        expect(host!.querySelector('[data-map]')).not.toBeNull();
        expect(sheet().dataset.sheet).toBe('MID');
        expect(sheet().contains(host!.querySelector('[data-map]'))).toBe(false);
        expect(host!.querySelector('[data-map] button[aria-label="뒤로가기"]')).not.toBeNull();
        drag(-150);
        expect(stageOf(text())).toBe('AT_PICKUP');
        expect(sheet().dataset.sheet).toBe('HIGH');
        expect(host!.querySelector('[data-map]')).not.toBeNull();
    });

    it('끌기 — 위로 끌면 창이 올라와 «밀어서 픽업 완료», 아래로 끌면 다시 픽업 이동', () => {
        mount(<PickerOngoingScreen call={pickerWalk} onBack={() => {}} onFinish={() => {}} />);
        drag(-150);
        expect(buttonByText('밀어서 픽업 완료')).toBeTruthy();
        drag(150);
        expect(stageOf(text())).toBe('TO_PICKUP');
        expect(sheet().dataset.sheet).toBe('MID');
    });

    it('🔴 끈 뒤 따라오는 누르기는 창을 도로 내리지 않는다', () => {
        mount(<PickerOngoingScreen call={pickerWalk} onBack={() => {}} onFinish={() => {}} />);
        const handle = host!.querySelector<HTMLElement>('[data-sheet-drag]')!;
        act(() => {
            handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 400 }));
            handle.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientY: 250 }));
        });
        act(() => { host!.querySelector<HTMLElement>('[data-sheet-drag]')!.click(); });
        expect(stageOf(text())).toBe('AT_PICKUP');
    });

    it('배송 중도 같은 구조 — 시트 «중» · 끌어 올리면 «밀어서 사진 촬영» (실물 21 · 22)', () => {
        mount(<PickerOngoingScreen call={pickerWalk} initialStep="TO_DROPOFF" onBack={() => {}} onFinish={() => {}} />);
        expect(host!.querySelector('[data-map]')).not.toBeNull();
        expect(sheet().dataset.sheet).toBe('MID');
        drag(-150);
        expect(stageOf(text())).toBe('AT_DROPOFF');
        expect(sheet().dataset.sheet).toBe('HIGH');
    });
});

describe('퀵 — 도보와 다른 페이지 (실물 17-1 · 17-2)', () => {
    it('🔴 원달앱이 퀵 버튼 네 번을 단계 순서대로 읽는다 — 픽업 이동 → 픽업 도착 → 배송 이동 → 배송 도착 (출발하기 = 이동 · 완료하기 = 완료 대기)', () => {
        mount(<PickerOngoingScreen call={pickerA} initialStep="DEPART" onBack={() => {}} onFinish={() => {}} />);
        expect(stageOf(text())).toBe('TO_PICKUP');
        click('픽업 출발하기');
        expect(stageOf(text())).toBe('AT_PICKUP');
        click('픽업 완료하기');
        expect(stageOf(text())).toBe('TO_DROPOFF');
        click('배송 출발하기');
        expect(stageOf(text())).toBe('AT_DROPOFF');
    });

    it('🔴 퀵 콜은 흰 «픽업 출발» 페이지부터 — 지도·시트·«밀어서»가 없고 바닥에 «길안내 / 픽업 출발하기» (실물 17-1)', () => {
        mount(<PickerOngoingScreen call={pickerA} initialStep="DEPART" onBack={() => {}} onFinish={() => {}} />);
        expect(host!.querySelector('[data-map]')).toBeNull();
        expect(host!.querySelector('[data-sheet]')).toBeNull();
        expect(chunk('지금 바로 출발해 주세요')).toBe(true);
        expect(chunk('09:30까지 픽업완료')).toBe(true);
        expect(chunk('픽업지 12.1km')).toBe(true);
        expect(chunk('매장 직원에게 문의')).toBe(true);
        expect(buttonByText('길안내')).toBeTruthy();
        expect(buttonByText('픽업 출발하기')).toBeTruthy();
        expect(text()).not.toContain('밀어서');
    });

    it('픽업 마감이 지났으면 «픽업 N분 지연 중 (픽업 준비 완료)» (실물 17-1)', () => {
        vi.setSystemTime(new Date('2026-09-14T09:40:00+09:00'));
        mount(<PickerOngoingScreen call={pickerA} initialStep="DEPART" onBack={() => {}} onFinish={() => {}} />);
        expect(chunk('픽업 10분 지연 중 (픽업 준비 완료)')).toBe(true);
    });

    it('🔴 「픽업 출발하기」 → **같은 페이지**에서 머리와 버튼만 바뀐다 — 「픽업 완료하기」 · 늦었으면 «픽업이 지연되고 있어요» · 배정 취소 · 최종 수익은 그대로 (실물 17-1 → 17-2 · 22-1 과 같은 짜임)', () => {
        vi.setSystemTime(new Date('2026-09-14T09:40:00+09:00'));
        const onStepChange = vi.fn();
        mount(<PickerOngoingScreen call={pickerA} initialStep="DEPART" onStepChange={onStepChange} onBack={() => {}} onFinish={() => {}} />);
        const same = ['픽업 장소', '매장 직원에게 문의', '오더번호', pickerA.orderNo, '물품 정보', '최종 수익', '오더 수행 팁', '고객센터 연결'];
        same.forEach(t => expect(chunk(t), `출발 전 «${t}»`).toBe(true));
        expect(buttonByText('배정 취소')).toBeTruthy();
        click('픽업 출발하기');
        expect(onStepChange).toHaveBeenCalledWith('TO_PICKUP');
        expect(host!.querySelector('[data-map]')).toBeNull();
        expect(chunk('픽업이 지연되고 있어요')).toBe(true);
        expect(chunk('10분 지연')).toBe(true);
        expect(buttonByText('픽업 출발하기')).toBeFalsy();
        expect(buttonByText('픽업 완료하기')).toBeTruthy();
        same.forEach(t => expect(chunk(t), `출발 뒤에도 «${t}»`).toBe(true));
        expect(buttonByText('배정 취소')).toBeTruthy();
        expect(chunk('총 수익')).toBe(false);
    });

    /**
     * 🔴 원달앱이 실물 17-1 에서 **실제로 읽은 글자**와 순서 — 실주행 폰 로그의
     *    `1DAL_PICKER ❓ [모르는 화면]` 줄. 20초 동안 여러 번 읽었는데 **머리(지연 · 출발해 주세요)와 «길안내»는 한 번도 없었다.**
     *    원달앱은 접근성 트리를 읽는다 — 시뮬레이터(웹뷰)는 `aria-hidden` 안쪽을 넘기지 않고, `aria-label` 은 그 글자로 넘긴다.
     */
    it('🔴 원달앱이 읽는 글자가 실물 로그 순서와 같다 — 머리와 «길안내»는 안 읽힌다 (A24 로그 11:55:15 · 11:56:32)', () => {
        mount(<PickerOngoingScreen call={pickerA} initialStep="DEPART" onBack={() => {}} onFinish={() => {}} />);
        const readable = (el: Element): string[] => {
            if (el.getAttribute('aria-hidden') === 'true') return [];
            const label = el.getAttribute('aria-label');
            if (label) return [label];
            const own = el.children.length === 0 && (el.textContent ?? '').trim() ? [(el.textContent ?? '').trim()] : [];
            return [...own, ...[...el.children].flatMap(readable)];
        };
        const words = readable(host!);
        const order = [
            '픽업지 정보', '픽업지 주소 복사하기', '픽업지에 전화하기',
            '도착지 정보', '도착지 주소 복사하기', '도착지에 전화하기',
            '픽업 장소', '매장 직원에게 문의', '오더번호', pickerA.orderNo, '물품 정보', '최종 수익',
            '오더 수행 팁', '고객센터 연결', '뒤로가기', '배정 취소', '픽업 출발하기',
        ];
        let at = -1;
        order.forEach(w => {
            const i = words.indexOf(w, at + 1);
            expect(i, `«${w}» 가 순서대로 없다 — 읽힌 글자: ${words.join(' | ')}`).toBeGreaterThan(at);
            at = i;
        });
        ['지금 바로 출발해 주세요', '09:30까지 픽업완료', '길안내'].forEach(w => expect(words, `«${w}» 는 실물에서 안 읽혔다`).not.toContain(w));
    });

    it('🔴 「픽업 완료하기」 → 곧바로 흰 «배송» 페이지 출발 전 — 보라 «배송 출발해주세요» · 바닥 «길안내 / 배송 출발하기» · 지도·«밀어서»가 없다 (실물 17-2 → 22-1 출발하기)', () => {
        const onStepChange = vi.fn();
        mount(<PickerOngoingScreen call={pickerA} initialStep="TO_PICKUP" onStepChange={onStepChange} onBack={() => {}} onFinish={() => {}} />);
        click('픽업 완료하기');
        expect(onStepChange).toHaveBeenCalledWith('DROPOFF_DEPART');
        expect(host!.querySelector('[data-map]')).toBeNull();
        expect(chunk('배송 출발해주세요')).toBe(true);
        expect(chunk('11:00까지 배송완료')).toBe(true);
        expect(chunk('배송지 21.7km')).toBe(true);
        expect(chunk('세 변의 합 100cm ∙ 5kg 이하')).toBe(true);
        expect(chunk('최종 수익')).toBe(true);
        expect(buttonByText('길안내')).toBeTruthy();
        expect(buttonByText('배송 출발하기')).toBeTruthy();
        expect(buttonByText('배송 완료하기')).toBeFalsy();
        expect(buttonByText('픽업 완료하기')).toBeFalsy();
        expect(text()).not.toContain('밀어서');
    });

    it('🔴 「배송 출발하기」 → **같은 페이지**에서 머리와 버튼만 바뀐다 — «배송 완료해주세요» · «배송 완료하기» (실물 22-1 출발하기 → 완료하기)', () => {
        const onStepChange = vi.fn();
        mount(<PickerOngoingScreen call={pickerA} initialStep="DROPOFF_DEPART" onStepChange={onStepChange} onBack={() => {}} onFinish={() => {}} />);
        const same = ['11:00까지 배송완료', '배송지 21.7km', '세 변의 합 100cm ∙ 5kg 이하', '최종 수익', '오더 수행 팁'];
        same.forEach(t => expect(chunk(t), `출발 전 «${t}»`).toBe(true));
        click('배송 출발하기');
        expect(onStepChange).toHaveBeenCalledWith('TO_DROPOFF');
        expect(chunk('배송 출발해주세요')).toBe(false);
        expect(chunk('배송 완료해주세요')).toBe(true);
        expect(buttonByText('배송 출발하기')).toBeFalsy();
        expect(buttonByText('배송 완료하기')).toBeTruthy();
        same.forEach(t => expect(chunk(t), `출발 뒤에도 «${t}»`).toBe(true));
    });

    it('「배송 완료하기」 → 인증사진 촬영 (⚠️ 22-1 뒤는 사진이 없어 도보와 같은 사진 · 문자 · 완료로 잇는다 · 추정)', () => {
        mount(<PickerOngoingScreen call={pickerA} initialStep="TO_DROPOFF" onBack={() => {}} onFinish={() => {}} />);
        click('배송 완료하기');
        expect(chunk('물품과 장소가 함께 보이도록 촬영해주세요')).toBe(true);
    });

    it('🔴 도보 콜은 같은 단계라도 지도 위 시트 페이지 (실물 16)', () => {
        mount(<PickerOngoingScreen call={pickerWalk} initialStep="TO_PICKUP" onBack={() => {}} onFinish={() => {}} />);
        expect(host!.querySelector('[data-map]')).not.toBeNull();
        expect(buttonByText('픽업 완료하기')).toBeFalsy();
    });
});

describe('픽커 배차 화면 — 수락 뒤', () => {
    const noop = () => {};
    const props = (over: Partial<NetScreenProps> = {}): NetScreenProps => ({
        streamingCalls: [pickerA, pickerB], confirmedCalls: [], activeTab: 'ALL', setActiveTab: noop,
        selectedCall: null, selectedCallId: null, openCall: noop, closeDetail: noop,
        acceptCall: noop, cancelCall: noop, finishCall: noop,
        isTimerPaused: false, toggleTimer: noop, isFetchingOrder: false, maxPickupKm: 15, goSetup: noop,
        ...over,
    });

    it('🔴 상세에서 수락하면 잡은 콜로 옮기고 상세를 닫아 곧바로 «내 오더» 탭으로 (화물24시 «배차내역»과 같은 순서)', () => {
        const acceptCall = vi.fn();
        const setActiveTab = vi.fn();
        const closeDetail = vi.fn();
        mount(<PickerSimScreen {...props({ selectedCall: pickerA, selectedCallId: pickerA.id, acceptCall, setActiveTab, closeDetail })} />);
        click('수락하기');
        expect(acceptCall).toHaveBeenCalledWith(pickerA);
        expect(setActiveTab).toHaveBeenCalledWith('CONFIRMED');
        expect(closeDetail).toHaveBeenCalledTimes(1);
    });

    it('🔴 퀵 카드를 열면 «픽업 출발»(17-1), 도보 카드를 열면 지도 위 시트(16)', () => {
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], selectedCall: pickerA, selectedCallId: pickerA.id })} />);
        expect(buttonByText('픽업 출발하기')).toBeTruthy();
        expect(host!.querySelector('[data-map]')).toBeNull();
        rerender(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerWalk], selectedCall: pickerWalk, selectedCallId: pickerWalk.id })} />);
        expect(host!.querySelector('[data-map]')).not.toBeNull();
        expect(buttonByText('픽업 출발하기')).toBeFalsy();
    });

    it('🔴 «내 오더»에 퀵·도보가 섞인다 — 딱지 색 · 카드 머리 · 줄이 종류마다 다르다 (실물 15-2)', () => {
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA, pickerWalk], activeTab: 'CONFIRMED' })} />);
        click('시작하기');
        const cards = [...host!.querySelectorAll<HTMLElement>('[data-my-order]')];
        expect(cards.map(c => c.dataset.myOrder)).toEqual(['퀵', '도보']);
        const [quick, walk] = cards;
        const chunksOf = (el: HTMLElement) => [...el.querySelectorAll('div')].filter(d => d.children.length === 0).map(d => (d.textContent ?? '').trim());
        const chip = (el: HTMLElement, t: string) => [...el.querySelectorAll('div')].find(d => d.children.length === 0 && (d.textContent ?? '').trim() === t)!;
        // 퀵 — 녹색 딱지 · «HH:MM까지» · 픽업 동 · 배송지 동 · 물품 크기
        expect(chunksOf(quick)).toEqual(expect.arrayContaining(['퀵', '09:30까지', '신현동', '배송지: 중앙동', '소형']));
        expect(quick.textContent).not.toContain('픽업 준비');
        expect(chip(quick, '퀵').className).toContain('#1aa37a');
        // 도보 — 보라 딱지 · «픽업 준비 N분 남음» · 가게 이름
        expect(chunksOf(walk)).toEqual(expect.arrayContaining(['도보', '픽업 준비 30분 남음', '픽커 고정']));
        expect(chip(walk, '도보').className).toContain('#8a4fd6');
    });

    it('도보는 픽업 뒤 카드 머리가 «배송 N분 남음» — «배송 시간»이 아니다 (실물 15-2 · 원달앱 배송 중 단계 글자와 안 겹치게)', () => {
        mount(<PickerDispatchBoard calls={[]} activeTab="CONFIRMED" onTabSelect={noop} myOrderCount={1} myOrders={[pickerWalk]} stepOf={() => 'TO_DROPOFF'} onCallClick={noop} onMenuClick={noop} />);
        expect(chunk('배송 120분 남음')).toBe(true);
        expect(text()).not.toContain('배송 시간');
    });

    it('신규 리스트 «도보배송» 탭을 누르면 도보 콜만 — «퀵 배송» 탭으로 돌아오면 퀵 콜만', () => {
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerA, pickerWalk] })} />);
        click('시작하기');
        const fares = () => [...host!.querySelectorAll('div')].filter(d => d.children.length === 0 && /^\d{1,3}(,\d{3})+$/.test((d.textContent ?? '').trim())).length;
        expect(fares()).toBe(1);
        expect(chunk('도보')).toBe(false);
        click('도보배송');
        expect(fares()).toBe(1);
        expect(chunk('도보')).toBe(true);
        expect(chunk('퀵')).toBe(false);
        click('퀵 배송');
        expect(chunk('퀵')).toBe(true);
        expect(chunk('도보')).toBe(false);
    });

    it('🔴 잡은 도보 콜을 열면 수락 전 상세도 «오더 전체»(실물 23)도 아니라 픽업 이동(실물 16)이다', () => {
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerWalk], selectedCall: pickerWalk, selectedCallId: pickerWalk.id })} />);
        expect(text()).not.toContain('수락하기');
        expect(chunk('오더 정보')).toBe(false);
        expect(stageOf(text())).toBe('TO_PICKUP');
    });

    it('완료하면 잡은 콜에서 뺀다', () => {
        const finishCall = vi.fn();
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], selectedCall: pickerA, selectedCallId: pickerA.id, finishCall })} />);
        click('픽업 출발하기'); click('픽업 완료하기');   // pickerA 는 퀵 — 흰 페이지 (실물 17-1 · 17-2)
        click('배송 출발하기'); click('배송 완료하기');   // 퀵 배송 흰 페이지 — 같은 페이지에서 버튼만 바뀐다 (실물 22-1)
        click('인증사진 촬영'); click('문자 전송'); click('배송 완료'); click('오더 목록 보기');
        expect(finishCall).toHaveBeenCalledWith(pickerA);
    });

    /**
     * 🔴 **«내 오더»는 인성 리스트의 «완료» 탭과 같다** (기사님) — 내가 수락한 콜이다. 누르면 그 콜의 운행(픽업 이동)이 열린다.
     *    신규 리스트의 «오래 떠 있던 콜은 남이 가져갔다»(토스트)를 타면 안 된다 — 이미 내 콜이다.
     */
    it('🔴 «내 오더» 카드를 누르면 오래 지나도 그 콜이 열린다 — «이미 배정이 완료된» 토스트가 아니다', () => {
        const openCall = vi.fn();
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerA, pickerB], confirmedCalls: [pickerA], activeTab: 'CONFIRMED', openCall })} />);
        click('시작하기');
        act(() => { vi.advanceTimersByTime(4 * 60_000); });   // 남이 가져가는 시각(20초~3분)을 넘긴다
        const card = host!.querySelector<HTMLElement>('[data-my-order]');
        expect(card, '내 오더 카드가 없다').toBeTruthy();
        act(() => { card!.click(); });
        expect(openCall).toHaveBeenCalledWith(pickerA);
        expect(text()).not.toContain('이미 배정이 완료된');
    });

    it('🔴 «내 오더» 탭 — 실물 15 카드(«픽업 준비 N분 남음» · 픽업 · 배송지) · «리스트 설정»·요금 숫자 모양은 없다 (원달앱이 잡은 콜을 새 콜로 다시 읽지 않게)', () => {
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerWalk], activeTab: 'CONFIRMED' })} />);
        click('시작하기');
        expect(chunk('내 오더')).toBe(true);
        expect(chunk('1')).toBe(true);                       // 파란 동그라미 숫자
        expect(text()).not.toContain('리스트 설정');
        // 실물 15 — 머리 «목록 | 지도» · 배송 종류 탭 · 서포트 모드 · 오더카드가 없다 · 카드 아래 «한차배송 신청내역 보기» · 떠 있는 메뉴는 «카드설정» 하나
        expect(chunk('목록')).toBe(true);
        expect(chunk('지도')).toBe(true);
        expect(text()).not.toContain('도보배송');
        expect(text()).not.toContain('서포트 모드');
        expect(text()).not.toContain('오더카드 대기 중');
        expect(chunk('한차배송 신청내역 보기')).toBe(true);
        expect(chunk('카드설정')).toBe(true);
        expect(text()).not.toContain('수요지도');
        expect(chunk(pickerWalk.pickerTags[0])).toBe(true);    // 카드 오른쪽 위 배송 종류 딱지 (실물 «도보»)
        expect(chunk('픽업 준비 30분 남음')).toBe(true);
        expect(text()).toContain('배송지: ');
        // 원달앱이 요금으로 알아보는 것은 «쉼표 든 숫자»만의 글자 덩어리다 — 내 오더 목록에는 그런 덩어리가 없다
        const fareLike = [...host!.querySelectorAll('div')].filter(d => d.children.length === 0 && /^\d{1,3}(,\d{3})+$/.test((d.textContent ?? '').trim()));
        expect(fareLike).toEqual([]);
        rerender(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], activeTab: 'ALL' })} />);
        expect(text()).toContain('리스트 설정');
    });
});
