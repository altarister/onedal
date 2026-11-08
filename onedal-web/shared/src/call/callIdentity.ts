/**
 * 콜의 번호 · 출처
 * 누가: 서버 콜 받기 · 콜 모양 · 견본
 * 언제: 원달앱 보고에서 «이 콜이 무엇인가»와 «이 보고가 어디서 어떻게 왔나»를 담고 꺼낼 때
 * 어디서: 콜 한 건의 번호 묶음 · 출처 묶음
 * 무엇을: REPORT_KINDS · OPENED_BY · CallIdentity · CallProvenance
 * 어떻게: 화면이 보여 준 번호 글자만 그대로 담고(새 번호 칸은 없으면 null · 상세 칸은 없으면 칸 없음), 보고 종류 · 누가 열었나는 값 목록에서 타입을 파생한다
 * 왜: 배차망마다 번호 키를 따로 만들지 않고, 화면 글자와 원달앱 · 서버가 붙인 값이 한 칸에 섞이지 않게 하기 위해서다
 */
/* 🔢 타입만 가져오는 작은 파일로 둔다 — 순환 참조를 만들지 않으려는 것이다 */
import type { TargetAppType } from '../network/targetApps';

/* 보고 종류 — 실제로 오가는 값 일곱. 목록이 원천, 타입은 파생 · PICKER_DETAIL 은 배차망 이름이 든 값(픽커 상세 수집) */
export const REPORT_KINDS = ['NEW_ORDER', 'INTEL_BULK', 'PICKER_DETAIL',
                             'AUTO_CLICK', 'MANUAL_CLICK', 'MANUAL', 'SIMULATION'] as const;
export type ReportKind = typeof REPORT_KINDS[number];

/* 누가 상세를 열었나 — APP 원달앱 · DRIVER 기사님 · 모르면 null */
export const OPENED_BY = ['APP', 'DRIVER'] as const;
export type OpenedBy = typeof OPENED_BY[number];

/** 이 콜이 무엇인가 — 화면 글자는 그대로 · 새 번호 칸(orderNo · clientOrderNo · fromOtherOffice)은 없으면 null · 상세 칸은 없으면 칸 없음 */
export interface CallIdentity {
    id: string;                         // 우리 콜 번호 — 원달앱 · 서버가 붙인다(화면 글자 아님)
    targetApp?: TargetAppType;          // 어느 배차망
    orderNo?: string | null;            // 배차망 오더 번호 «3-9483-2159»(이름표 «화물번호:» 는 뗀다) — 지금은 화물24시만
    clientOrderNo?: string | null;      // 가게 주문 번호 — 화면 글자 통째 «요기요 주문번호 : 903»
    fromOtherOffice?: boolean | null;   // 공유콜 — 화면이 표시하면 참 · 표시 없으면 거짓 · 뜻을 모르는 배차망은 null
    dispatcherName?: string;     // 배차사 — 콜을 올린 배차 사무실
    dispatcherPhone?: string;    // 배차사 전화
    requesterName?: string;      // 의뢰인 — 콜을 맡긴 사람 · 가게
    stageText?: string;          // 진행 글자 «배차» · «배송» — 우리 콜 상태(status)와 다르다
}

/** 이 보고가 어디서 어떻게 왔나 — 화면 글자가 아니다(원문 rawText 만 화면 글자 통째) */
export interface CallProvenance {
    type: ReportKind;                   // 보고 종류
    timestamp: string;                  // 원달앱이 그 화면을 읽은 시각
    rawText?: string;                   // 화면 글자 통째
    openedBy?: OpenedBy | null;         // 누가 상세를 열었나
    capturedMode?: string | null;       // 그 상세를 연 때 폰 모드 — 값 목록은 device/deviceModes 가 원천
    isSimulated?: boolean;              // 연습 콜 — 계약 안 함 폰이 연 콜 가운데 기사님이 손으로 확정하지 않은 콜(시뮬레이터 콜과 다르다)
    verdict?: string | null;            // 원달앱이 목록에서 붙인 판정 축(pass · vehicle · region · fare …) — 못 정하면 null
}
