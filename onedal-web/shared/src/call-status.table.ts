/** 📋 **진행 상태 값 표** — 칸과 값을 한곳에서 본다(`/shared/`). 고칠 때는 이 파일을 코드로 고친다. */
export const TABLE = /*JSON*/{
 "title": "진행 상태 값 표",
 "about": "콜 칸 표의 status 줄이 가리키는 값 목록 · 코드 원천은 shared/src/callStatus.ts 다 · 이 표와 같은지 묶는 검사는 아직 없다",
 "idPrefix": "S",
 "columns": [
  {
   "key": "id",
   "label": "아이디"
  },
  {
   "key": "code",
   "label": "코드 값"
  },
  {
   "key": "label",
   "label": "관제웹 이름"
  },
  {
   "key": "desc",
   "label": "뜻"
  },
  {
   "key": "group",
   "label": "묶음"
  },
  {
   "key": "store",
   "label": "저장"
  }
 ],
 "rows": [
  {
   "id": "S01",
   "code": "ORDER_PRE_SECURED",
   "label": "선점 중",
   "desc": "원달앱이 자동 모드면 확정을 누르기 직전부터, 알람 · 직접 모드면 상세를 연 순간부터",
   "group": "심사",
   "store": "서버 기억만"
  },
  {
   "id": "S02",
   "code": "ORDER_SECURED_EVALUATING",
   "label": "심사 중",
   "desc": "서버가 상세를 받아 판정한다",
   "group": "심사",
   "store": "서버 기억만"
  },
  {
   "id": "S03",
   "code": "ORDER_AWAITING_DECISION",
   "label": "결재 기다림",
   "desc": "판정이 나 기사님 결재를 기다린다",
   "group": "심사",
   "store": "서버 기억만"
  },
  {
   "id": "S04",
   "code": "ORDER_CONFIRMED",
   "label": "진행 중",
   "desc": "내 콜이 됐다",
   "group": "운행",
   "store": "장부"
  },
  {
   "id": "S05",
   "code": "ORDER_PICKED_UP",
   "label": "상차 완료",
   "desc": "짐을 실었다",
   "group": "운행",
   "store": "장부"
  },
  {
   "id": "S06",
   "code": "ORDER_DELIVERED",
   "label": "하차 완료",
   "desc": "짐을 내렸다 — 끝",
   "group": "끝",
   "store": "장부"
  },
  {
   "id": "S07",
   "code": "ORDER_COMPLETED",
   "label": "완료",
   "desc": "정산까지 끝났다 — 끝 · 새로 만드는 코드는 없다",
   "group": "끝",
   "store": "장부(옛 줄만)"
  },
  {
   "id": "S08",
   "code": "SAFE_CANCEL",
   "label": "안전취소",
   "desc": "내 콜이 되기 전에 물러났다 · KEEP 뒤 원달앱이 못 받아 취소한 것도 여기 — 끝",
   "group": "끝 · 놓음",
   "store": "장부(미리보기 · 체험은 서버 기억만)"
  },
  {
   "id": "S09",
   "code": "ORDER_RELEASED_BY_ME",
   "label": "방출(기사님)",
   "desc": "내 콜을 기사님이 놓았다 — 끝",
   "group": "끝 · 놓음",
   "store": "장부"
  },
  {
   "id": "S10",
   "code": "ORDER_RELEASED_BY_OFFICE",
   "label": "방출(사무실)",
   "desc": "내 콜을 사무실 쪽 사정으로 놓았다 — 끝",
   "group": "끝 · 놓음",
   "store": "장부"
  }
 ]
}/*JSON*/ as const;
