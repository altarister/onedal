/**
 * BaseCall 합친 안 8판의 칸 표
 * 누가: 아직 아무 코드도 안 읽는다. 기사님이 배차망별 값을 볼 때 본다
 * 언제: 콜 모양을 정하기 전
 * 어디서: sandbox 폴더의 후보 파일. 타입은 onedal-89_08.ts 에 있다
 * 무엇을: BaseCall 칸과 잡은 뒤 칸마다 네 배차망의 필수 · 화면 줄마다 읽는지 · 화면 · 글자 견본
 * 어떻게: 표 하나만 둔다. 칸 설명은 타입 주석에서 읽는다
 * 왜: 한 줄씩 따라 읽어 그 칸을 찾아갈 수 있게 하기 위해서다
 */

/** 배차망마다 어떻게 들어오나 */
export const BASE_CALL_FIELDS = {
 "fieldSheet": true,
 "title": "합친 안 칸 표",
 "typesFrom": "call/sandbox/onedal-89_08",
 "about": "한 줄이 한 칸이고, 그 안의 작은 줄이 한 화면이다. 속한 타입을 누르면 그 칸이 보이는 표로 간다. 코드 경로는 코드에서 찾는 글자다. 필수: 지금 코드(OrderRequirement.kt)가 요구하는 값이고 정하는 것은 기사님이다. 읽는지: 콜에 저장 = 콜 칸에 들어간다 · 읽기만 함 = 읽지만 콜에 안 남는다 · 안 읽음 = 화면에 있으나 안 읽는다 · 버림 = 읽고 버린다 · 상세로 덮임 = 목록에서 읽지만 상세 값으로 바뀐다 · 꼬리표에 섞임 = 제 칸 없이 tagsText 에 들어간다 · fare 칸에 섞임 = 다른 뜻의 돈이 fare 에 들어간다 · 조건부 저장 = 요금이 비었거나 손으로 연 상세일 때만 저장한다 · 규칙 필요 = 글자는 있으나 이 칸의 값으로 바꾸는 코드가 없다 · 뜻 확인 필요 = 들어가는 값의 뜻을 모른다. 화면 칸은 정의 표의 칸 이름이고, 지금 코드의 빌린 이름이 그대로 보인다. 견본은 정의 표에서 왔고 줄마다 다른 콜이며 저장되는 값과 다를 수 있다. 잘못 들어감 = 다른 뜻의 값이 이 칸에 들어간다. 안 풂 = 목록 앞글자에 있지만 퀵사마다 달라 풀지 않고 상세 · 적요에서 읽는다. «=» 뒤는 그 글에서 뽑은 값이다. (시뮬)은 시뮬레이터 글자, (안내 영상)은 유튜브 안내 영상 속 그림이다.",
 "groups": [
  {
   "key": "insung",
   "label": "인성"
  },
  {
   "key": "hwamul24",
   "label": "화물24시"
  },
  {
   "key": "kakaopicker",
   "label": "카카오픽커"
  },
  {
   "key": "isflex",
   "label": "인성플렉스"
  }
 ],
 "rows": [
  {
   "section": "콜 자체 — 어느 콜이고 어느 배차망 것인가. 묶지 않고 BaseCall 맨 위에 둔다"
  },
  {
   "type": "BaseCall",
   "field": "id",
   "path": "id",
   "label": "콜 번호",
   "filledBy": "앱 목록",
   "ledger": "orders.id",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "필수",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 원달앱이 정한다 (화면 값 아님)",
       "sample": "—"
      }
     ]
    },
    "hwamul24": {
     "req": "필수",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 원달앱이 정한다 (화면 값 아님)",
       "sample": "—"
      }
     ]
    },
    "kakaopicker": {
     "req": "필수",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 원달앱이 정한다 (화면 값 아님)",
       "sample": "—"
      }
     ]
    },
    "isflex": {
     "req": "필수",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 원달앱이 정한다 (화면 값 아님)",
       "sample": "—"
      }
     ]
    }
   }
  },
  {
   "type": "BaseCall",
   "field": "targetApp",
   "path": "targetApp",
   "label": "배차망",
   "filledBy": "앱 요청 봉투",
   "ledger": "orders.targetApp",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "필수",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 원달앱 보고 봉투 (화면 값 아님)",
       "sample": "insung"
      }
     ]
    },
    "hwamul24": {
     "req": "필수",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 원달앱 보고 봉투 (화면 값 아님)",
       "sample": "hwamul24"
      }
     ]
    },
    "kakaopicker": {
     "req": "필수",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 원달앱 보고 봉투 (화면 값 아님)",
       "sample": "kakaopicker"
      }
     ]
    },
    "isflex": {
     "req": "필수",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 원달앱 보고 봉투 (화면 값 아님)",
       "sample": "isflex"
      }
     ]
    }
   }
  },
  {
   "type": "BaseCall",
   "field": "dispatcherName",
   "path": "dispatcherName",
   "label": "배차사",
   "filledBy": "서버 원문",
   "ledger": "orders.dispatcherName",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 상세 머리 줄 «배차사-전화» 앞",
       "sample": "고양퀵서비스 (시뮬)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 머리 줄",
       "sample": "(주)신한로직스"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 콜센터 줄",
       "sample": "인성본사 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "BaseCall",
   "field": "dispatcherPhone",
   "path": "dispatcherPhone",
   "label": "배차사 전화",
   "filledBy": "서버 원문",
   "ledger": "orders.dispatcherPhone",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 상세 머리 줄 «배차사-전화» 뒤",
       "sample": "031-932-7722 (시뮬)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 머리 줄",
       "sample": "1588-5480"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 콜센터 전화번호 줄 (앞 이름은 인성퀵)",
       "sample": "인성퀵 | 053-000-0000 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "BaseCall",
   "field": "requesterName",
   "path": "requesterName",
   "label": "의뢰지",
   "desc": "콜을 맡긴 사람이나 상호. 가린 *** 은 빈 값으로 읽는다",
   "filledBy": "서버 원문",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 의뢰지 줄",
       "sample": "쑥쑥 TEST · (이름)☆(@@) · ***"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "뜻 확인 필요",
       "screen": "내 콜 화면 · 정거장 작은 회색 (후보)",
       "sample": "요기요 고객 · 난향"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "BaseCall",
   "field": "fromOtherOffice",
   "path": "fromOtherOffice",
   "label": "공유콜",
   "desc": "다른 사무실 콜이면 true. 합짐 여부 isShared 와 다른 값이다. 끝 모습에서는 목록 값을 상세가 덮지 않는다(읽는지 칸은 지금 코드다). 플렉스 목록은 줄마다 «@»가 붙어 늘 true 다",
   "filledBy": "앱 목록",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "상세로 덮임",
       "screen": "새 콜 목록 · 출발지 칸 맨 앞 «@»",
       "sample": "@19;30여의 = true"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "상세로 덮임",
       "screen": "새 콜 목록 · 출발 글자 맨 앞 «@» [tv_pick_up_dong]",
       "sample": "@낼8:30)방배동 = true"
      },
      {
       "read": "버림",
       "screen": "새 콜 화면 · 출발 칸 시도 앞 «@» [tv_pick_up_point]",
       "sample": "@서울 서초구 = true"
      }
     ]
    }
   }
  },
  {
   "type": "BaseCall",
   "field": "orderNo",
   "path": "orderNo",
   "label": "오더번호",
   "filledBy": "서버 원문",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "orderNo",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 머리",
       "sample": "화물번호:3-9483-2159"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 화물번호",
       "sample": "3-4991-0836"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 픽업 장소 줄 오더번호",
       "sample": "F2609011638JDU17"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 오더 전체 보기 오더 확인",
       "sample": "260902091827593"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "BaseCall",
   "field": "clientOrderNo",
   "path": "clientOrderNo",
   "label": "제휴사 주문번호",
   "desc": "가게 · 제휴사가 부르는 번호. orderNo 는 배차망 번호다",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 물품 정보 글 끝",
       "sample": "요기요 주문번호 : 903 = 903"
      },
      {
       "read": "규칙 필요",
       "screen": "내 콜 화면 · 고객 요청 첫 줄",
       "sample": "주문제휴사주문번호: (번호) = (번호)"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "BaseCall",
   "field": "stage",
   "path": "stage",
   "label": "배차망 상태 글자",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음",
   "pageField": "stage",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 상태 줄",
       "sample": "상태 : 배송"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 완료 탭 줄 배지",
       "sample": "운행 (영상_1633)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 상태 줄",
       "sample": "상태 : 배송"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배차내역 줄 오른쪽 상태",
       "sample": "배차완료"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차신청 뒤 화면",
       "sample": "(실물 캡처 없음) (실물 못 봄)"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "읽기만 함",
       "screen": "내 콜 목록 · 내 오더 줄 머리",
       "sample": "픽업 준비 14분 남음"
      },
      {
       "read": "뜻 확인 필요",
       "screen": "내 콜 화면 · 운행 시트 머리",
       "sample": "지금 바로 출발해 주세요 · 픽업이 지연되고 있어요"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 진행중 탭 잡은 콜 줄 상태",
       "sample": "(실물 캡처 없음) (실물 못 봄)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 지도 아래 파란 단계 줄(안내 그림)",
       "sample": "상태 완료 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "section": "어디서 어디로 — 내비에 찍을 곳과 전화할 사람, 거리"
  },
  {
   "type": "CallRoute",
   "field": "firstSeen.pickup",
   "path": "route.firstSeen.pickup",
   "label": "목록 상차 동",
   "desc": "앱이 목록 글자에서 앞글자를 뗀 동 이름. 같은 콜 찾기에 쓴다",
   "filledBy": "앱 목록",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "pickup",
   "nets": {
    "insung": {
     "req": "목록",
     "lines": [
      {
       "read": "상세로 덮임",
       "screen": "새 콜 목록 · 출발지 칸",
       "sample": "@초이동 · @남양주(오남"
      }
     ]
    },
    "hwamul24": {
     "req": "목록",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 왼쪽 윗줄",
       "sample": "경기 시흥 정왕동"
      }
     ]
    },
    "kakaopicker": {
     "req": "목록",
     "lines": [
      {
       "read": "상세로 덮임",
       "screen": "새 콜 목록 · 몸통 줄 — 시·구 줄임 + 동",
       "sample": "광주 경안"
      }
     ]
    },
    "isflex": {
     "req": "목록",
     "lines": [
      {
       "read": "상세로 덮임",
       "screen": "새 콜 목록 · 출발지 칸 — «@» + (예약 앞글자) + 동 [tv_pick_up_dong]",
       "sample": "@낼08:20/수원이의동 · @역삼동"
      }
     ]
    }
   }
  },
  {
   "type": "CallRoute",
   "field": "firstSeen.dropoff",
   "path": "route.firstSeen.dropoff",
   "label": "목록 하차 동",
   "desc": "앱이 목록 글자에서 앞글자를 뗀 동 이름. 같은 콜 찾기에 쓴다",
   "filledBy": "앱 목록",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "dropoff",
   "nets": {
    "insung": {
     "req": "목록",
     "lines": [
      {
       "read": "상세로 덮임",
       "screen": "새 콜 목록 · 도착지 칸",
       "sample": "이태원동 · 김포(대곶면"
      },
      {
       "read": "상세로 덮임",
       "screen": "새 콜 목록 · 앱이 앞글자를 뗀 동 (지금 코드)",
       "sample": "왕복/낼7시/송파 = 송파 · 풍납동>논현동 = 논현동"
      }
     ]
    },
    "hwamul24": {
     "req": "목록",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 오른쪽 윗줄",
       "sample": "경기 안산 상록구 장상동"
      }
     ]
    },
    "kakaopicker": {
     "req": "목록 (도보는 없어도 됨 · 도보를 꺼서 이 예외는 안 쓰인다)",
     "lines": [
      {
       "read": "상세로 덮임",
       "screen": "새 콜 목록 · 꼬리표 줄 오른쪽 구 + 몸통 줄 오른쪽 동",
       "sample": "용산 한남"
      }
     ]
    },
    "isflex": {
     "req": "목록",
     "lines": [
      {
       "read": "상세로 덮임",
       "screen": "새 콜 목록 · 도착지 칸 — (마감 앞글자) + 동 [tv_dest_dong]",
       "sample": "10:20전/쌍림동 · 구리수택동"
      }
     ]
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "addressDetail",
   "path": "route.pickup.addressDetail",
   "label": "상차지 주소",
   "desc": "내비에 찍을 주소. 필수 기준은 지금 코드의 시군구 + 동이다",
   "filledBy": "앱 상세 · 서버 원문",
   "ledger": "orders.pickup",
   "pageField": "pickup",
   "nets": {
    "insung": {
     "req": "상세",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발지 상세 팝업 «위치»",
       "sample": "경기 용인시 처인구 양지면 … (시뮬)"
      }
     ]
    },
    "hwamul24": {
     "req": "상세 (목록 글자로 채움)",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 왼쪽 윗줄",
       "sample": "경기 시흥 정왕동 (목록 글자를 그대로 씀)"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 상차지 칸",
       "sample": "경기 군포 부곡동 [당상][수] 5Km"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배차내역 줄 상차",
       "sample": "경기 군포 당정동 공단로124번길 4 (크레텍)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 상차지",
       "sample": "경기 군포 당정동 공단로124번길 4 (크레텍)"
      }
     ]
    },
    "kakaopicker": {
     "req": "상세",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 사진 첫 정거장 — 행정동 + 건물",
       "sample": "경기 광주시 경안동 / 람미당"
      }
     ]
    },
    "isflex": {
     "req": "상세",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · «출발» 다음 — «@시도 시군구 @(예약)동» [tv_pick_up_point]",
       "sample": "@서울 서초구 @낼8:30)방배동"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 진행중 탭 잡은 콜 줄",
       "sample": "(실물 캡처 없음) (실물 못 봄)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · «출발» 동 + 아래 전체 주소(안내 그림)",
       "sample": "대구 서구 비산동 · 서구 북비산로 240 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "customerName",
   "path": "route.pickup.customerName",
   "label": "상차지 상호",
   "desc": "인성 «*» · «***» 은 빈 값으로 읽는다",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발지 상세 팝업 «고객»",
       "sample": "고객 가나상사 (시뮬)"
      },
      {
       "read": "뜻 확인 필요",
       "screen": "내 콜 화면 · 출발지 줄",
       "sample": "오티디코퍼레이션/ 아크앤북동탄호수점 / 1시/ (상호와 시각이 섞인 글)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 픽업 주소 아래 회색 상호",
       "sample": "분당스퀘어"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 픽업 배지 옆",
       "sample": "[태전점]롯데리아"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 운행 시트 픽업지 · 오더 전체 보기 픽업지",
       "sample": "[태전점]롯데리아"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "department",
   "path": "route.pickup.department",
   "label": "상차지 부서",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발지 상세 팝업 «부서»",
       "sample": "부서 물류팀 (시뮬)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "내 콜 화면 · 정거장 글 (안내 영상)",
       "sample": "민사소액과 담당 홍길동"
      }
     ]
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "contactName",
   "path": "route.pickup.contactName",
   "label": "상차지 담당",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발지 상세 팝업 «담당»",
       "sample": "담당 김철수 (시뮬)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 첫 정거장 작은 회색",
       "sample": "(이름) 접수자"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 출발 담당자 · 전화 단추(안내 그림)",
       "sample": "민사소액과 담당 홍길동 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "phone1",
   "path": "route.pickup.phone1",
   "label": "상차지 전화1",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발지 상세 팝업 «전화1»",
       "sample": "전화1 010-1234-5678 (시뮬)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "phone2",
   "path": "route.pickup.phone2",
   "label": "상차지 전화2",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발지 상세 팝업 «전화2»",
       "sample": "전화2 031-000-0000 (시뮬)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "region",
   "path": "route.pickup.region",
   "label": "상차지 지역",
   "filledBy": "서버 원문",
   "ledger": "places.region (칸은 있다)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 출발지 상세 팝업 «출발» (정의 표에 줄 없음)",
       "sample": "경기 화성시"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "memo",
   "path": "route.pickup.memo",
   "label": "상차지 글",
   "filledBy": "서버 원문",
   "ledger": "orderStops.memo (칸은 있고 지금 안 채운다)",
   "pageField": "memo",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 회색 상자 첫 줄 «픽업 장소»",
       "sample": "매장 직원에게 문의"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallStop",
   "field": "loadingMethod",
   "path": "route.pickup.loadingMethod",
   "label": "상차지 상하차 방법",
   "desc": "지 = 지게차 · 수 = 수작업. 그 밖의 글자도 그대로 둔다",
   "filledBy": "앱 목록",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "tags",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "버림",
       "screen": "새 콜 목록 · 상차 쪽 배지",
       "sample": "지 · 수 · 투 · 컨 (투 · 컨은 자막에만 있다)"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 상차지 칸 배지",
       "sample": "지 · 수"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 상차지 배지",
       "sample": "지"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "addressDetail",
   "path": "route.dropoff.addressDetail",
   "label": "하차지 주소",
   "desc": "내비에 찍을 주소. 필수 기준은 지금 코드의 시군구 + 동이다",
   "filledBy": "앱 상세 · 서버 원문",
   "ledger": "orders.dropoff",
   "pageField": "dropoff",
   "nets": {
    "insung": {
     "req": "상세",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 도착지 상세 팝업 «위치»",
       "sample": "서울 강남구 역삼동 … (시뮬)"
      }
     ]
    },
    "hwamul24": {
     "req": "상세 (목록 글자로 채움)",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 오른쪽 윗줄",
       "sample": "경기 안산 상록구 장상동 (목록 글자를 그대로 씀)"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 하차지 칸",
       "sample": "서울 중구 을지로6가 [당착][수]"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배차내역 줄 하차",
       "sample": "경기 화성 신동 703"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 하차지",
       "sample": "경기 화성 신동 703"
      }
     ]
    },
    "kakaopicker": {
     "req": "상세",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 사진 둘째 정거장",
       "sample": "서울 용산구 한남동 / 아라마크"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배송지 줄",
       "sample": "배송지: 쌍용 스윗닷홈아파트 304동1002호"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 운행 시트 배송지 · 오더 전체 보기 배송지",
       "sample": "쌍용 스윗닷홈아파트 304동1002호"
      }
     ]
    },
    "isflex": {
     "req": "상세",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · «도착» 다음 — «시도 시군구 (마감)동» [tv_dest_point]",
       "sample": "서울 강남구 대치동"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 진행중 탭 잡은 콜 줄",
       "sample": "(실물 캡처 없음) (실물 못 봄)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · «도착» 동 + 아래 전체 주소(안내 그림)",
       "sample": "울산 남구 무거동 · 서구 달서천로 57길 1 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "customerName",
   "path": "route.dropoff.customerName",
   "label": "하차지 상호",
   "desc": "인성 «*» · «***» 은 빈 값으로 읽는다",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 도착지 상세 팝업 «고객»",
       "sample": "고객 다라상회 (시뮬)"
      },
      {
       "read": "뜻 확인 필요",
       "screen": "내 콜 화면 · 도착지 줄",
       "sample": "서울강남구 / 역삼동 / 이희억 (주소와 담당이 섞인 글)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 배송 주소 아래 회색 상호",
       "sample": "NC이스트폴"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 도착 회사 이름 · 전화 단추(안내 그림)",
       "sample": "부산신발산업진흥센터 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "department",
   "path": "route.dropoff.department",
   "label": "하차지 부서",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 도착지 상세 팝업 «부서»",
       "sample": "부서 … (시뮬)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "contactName",
   "path": "route.dropoff.contactName",
   "label": "하차지 담당",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 도착지 상세 팝업 «담당»",
       "sample": "담당 … (시뮬)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "phone1",
   "path": "route.dropoff.phone1",
   "label": "하차지 전화1",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 도착지 상세 팝업 «전화1»",
       "sample": "전화1 010-9999-8888 (시뮬)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "phone2",
   "path": "route.dropoff.phone2",
   "label": "하차지 전화2",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 도착지 상세 팝업 «전화2»",
       "sample": "전화2 … (시뮬)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "region",
   "path": "route.dropoff.region",
   "label": "하차지 지역",
   "filledBy": "서버 원문",
   "ledger": "places.region (칸은 있다)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 도착지 상세 팝업 «도착» (정의 표에 줄 없음)",
       "sample": "—"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "LocationDetailInfo",
   "field": "memo",
   "path": "route.dropoff.memo",
   "label": "하차지 글",
   "filledBy": "서버 원문",
   "ledger": "orderStops.memo (칸은 있고 지금 안 채운다)",
   "pageField": "memo",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallStop",
   "field": "loadingMethod",
   "path": "route.dropoff.loadingMethod",
   "label": "하차지 상하차 방법",
   "desc": "지 = 지게차 · 수 = 수작업. 그 밖의 글자도 그대로 둔다",
   "filledBy": "앱 목록",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "tags",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "버림",
       "screen": "새 콜 목록 · 하차 쪽 배지",
       "sample": "지 · 수 · 투 · 컨 (투 · 컨은 자막에만 있다)"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 하차지 칸 배지",
       "sample": "지 · 수"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 하차지 배지",
       "sample": "지"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallRoute",
   "field": "viaDropoffs",
   "path": "route.viaDropoffs",
   "label": "먼저 내리는 곳",
   "desc": "경유 콜에서 마지막 하차지 앞에 내리는 곳들의 주소. 차례대로 둔다. 마지막 곳은 route.dropoff 다. 기사님 말씀대로 적요에 풀려 들어가고, 채우는 규칙은 경유 콜 상세를 본 뒤 정한다",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 도착지 칸 «A>B»의 A",
       "sample": "풍납동>논현동 = 풍납동"
      },
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 상세 · 적요 (경유 콜 이미지 없음)",
       "sample": "—"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallRoute",
   "field": "pickupDistance",
   "path": "route.pickupDistance",
   "label": "상차지 거리",
   "filledBy": "앱 목록",
   "ledger": "orders 칸 없음 (intel.pickupDistanceKm)",
   "pageField": "pickupDistance",
   "nets": {
    "insung": {
     "req": "목록",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 거리 칸 윗줄",
       "sample": "17.8"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 적요 칸 둘째 줄",
       "sample": "현위치 → 상차지(직선)23.5KM"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 적요 끝 줄",
       "sample": "현위치 → 상차지(직선)11.2KM"
      }
     ]
    },
    "hwamul24": {
     "req": "목록",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 상차 배지 옆",
       "sample": "15Km"
      }
     ]
    },
    "kakaopicker": {
     "req": "목록",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 몸통 줄 맨 앞",
       "sample": "4.7km"
      },
      {
       "read": "버림",
       "screen": "새 콜 화면 · 사진 정거장 오른쪽",
       "sample": "픽업 4.7km"
      }
     ]
    },
    "isflex": {
     "req": "목록",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 목록 줄 맨 왼쪽(칸 머리 «출발지까지 (km)» — 줄바꿈 든 한 글자) [tv_pick_up_distance]",
       "sample": "24.3"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 지도 아래 «출발지까지» 다음 [tv_pick_up_distance]",
       "sample": "출발지까지 26.7km"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 머리 줄(안내 그림)",
       "sample": "픽업지까지 1.2km (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "CallRoute",
   "field": "deliveryDistance",
   "path": "route.deliveryDistance",
   "label": "배송 거리",
   "filledBy": "앱 목록",
   "ledger": "orders.deliveryDistance",
   "pageField": "deliveryDistance",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 거리 칸 아랫줄",
       "sample": "0.0 · 341.3"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 적요 칸 셋째 줄",
       "sample": "상차지 → 하차지(직선)35.9KM"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 하차지 칸 오른쪽",
       "sample": "36Km"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 하차지 끝",
       "sample": "34Km"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "버림",
       "screen": "새 콜 화면 · 사진 정거장 오른쪽",
       "sample": "배송 26.4km"
      },
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 둘째 정거장 오른쪽 m 단위",
       "sample": "배송 994m = 0.994"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 출발지 아래 [tv_distance]",
       "sample": "약 30.1km"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발 주소 아래 [tv_distance]",
       "sample": "약 2.3km"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 출발 아래(안내 그림)",
       "sample": "약 1.8km (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "section": "얼마 — 화면의 금액을 뜻별로 한 줄씩 둔다. 합치거나 빼지 않는다"
  },
  {
   "type": "MoneyKind",
   "field": "total",
   "path": "money.lines[kind=total]",
   "label": "목록 요금",
   "desc": "화물24시 목록의 요금. 인수증 · 카드 콜은 운송료와 같고, 선/착불 콜은 운송료 + collectedFee 다. 인성에는 이 값이 화면에 없다. 지금은 income 과 함께 orders.fare 한 칸에 저장한다",
   "filledBy": "앱 목록 · 앱 상세",
   "ledger": "orders.fare",
   "pageField": "fare",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "목록 · 상세",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 오른쪽 아랫줄",
       "sample": "50,000원"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배차내역 줄 요금",
       "sample": "250,000원"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "income",
   "path": "money.lines[kind=income]",
   "label": "수입 · 수익",
   "desc": "기사 몫으로 적힌 값. 인성 «요금» · «실운임»은 수수료를 뺀 값이다(인성 설명서 자막). 픽커 · 플렉스가 뺀 값인지는 모른다",
   "filledBy": "앱 목록 · 앱 상세",
   "ledger": "orders.fare",
   "pageField": "fare",
   "nets": {
    "insung": {
     "req": "목록 · 상세",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 요금 칸 (천 원 단위)",
       "sample": "40.0 · 270.0"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 요금 줄",
       "sample": "요금 : 85,000"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 확정 뒤 상세 «실운임 :» · «요금 :»",
       "sample": "실운임 : 34,650(착불) · 실운임 : 170,000(신용)(계산서)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "목록 · 상세",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 목록 줄 오른쪽",
       "sample": "16,093"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 상세 아래 최종 수익",
       "sample": "최종 수익 2,387"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 오더 전체 보기 최종 수익",
       "sample": "최종 수익 2,387P"
      }
     ]
    },
    "isflex": {
     "req": "목록 · 상세",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 수입 칸(«원» 없음) [tv_money]",
       "sample": "21,252"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 아래 «총 수입» 다음 [tv_total_revenue]",
       "sample": "총 수입 8,500원"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 총 수익(안내 그림 — 실물 상세는 «총 수입»)",
       "sample": "총 수익 ₩ 123,000원 (안내 영상)"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 칸 머리 «실제수익» (안내 영상)",
       "sample": "3,000원"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · «총 수익» (안내 영상)",
       "sample": "₩ 123,000원"
      }
     ]
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "collect",
   "path": "money.lines[kind=collect]",
   "label": "받을 돈",
   "desc": "현장에서 받을 돈. 인성은 수수료 앞 금액이다 (45,000 × 0.77 = 실운임 34,650)",
   "filledBy": "앱 상세",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "fare · payment",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "fare 칸에 섞임",
       "screen": "내 콜 화면 · 확정 뒤 상세 «고객에게 받을 금액»",
       "sample": "고객에게 받을 금액 45,000"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 받으실 현금(안내 그림 — 현금 콜만)",
       "sample": "받으실 현금 123,000원 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "fee",
   "path": "money.lines[kind=fee]",
   "label": "빠지는 수수료",
   "desc": "기사 몫에서 빠지는 수수료의 비율이나 식",
   "filledBy": "서버 원문",
   "ledger": "orders.commissionRate",
   "pageField": "commission",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 수수료 줄",
       "sample": "수수료 : 23%"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 수수료 줄",
       "sample": "수수료 : 23%"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 수수료 줄",
       "sample": "수수료 = (운송료+부가세) x1.298%"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "collectedFee",
   "path": "money.lines[kind=collectedFee]",
   "label": "함께 받는 수수료",
   "desc": "운송료에 더해 목록 요금이 되는 돈 (180,000 + 20,000 = 200,000 · 정산 합계 670,000 = 운 650,000 + 수 20,000). 지금까지 본 사례는 선/착불 콜이다. 목록 요금 기준으로 fee 와 부호가 반대다. 수작업비는 아니다(화주 쪽이 상하차를 해 주는 콜에도 붙었다). 기사 몫인지 사무실에 넘기는지 모른다. 지금 fare 는 목록 요금이라 이 돈이 이미 들어 있다",
   "filledBy": "서버 원문",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 목록 · 요금 앞 알약 «수»",
       "sample": "수 1.0"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차 정보 요약 «수수료»",
       "sample": "20,000원"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "insurance",
   "path": "money.lines[kind=insurance]",
   "label": "산재보험료",
   "desc": "콜마다 기사 몫에서 빠지는 돈. 기간 합계는 여기 넣지 않는다",
   "filledBy": "서버 원문",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 금액 표 아래",
       "sample": "[산재보험료(차주부담액): 260원] · 770원"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "consign",
   "path": "money.lines[kind=consign]",
   "label": "탁송료",
   "desc": "탁송료. 판정의 통행료(tollKrw)와 다른 돈이다",
   "filledBy": "서버 원문",
   "ledger": "orders.tollFare",
   "pageField": "toll",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 탁송료 줄",
       "sample": "탁송료 : 3,000 · 탁송료 :(빈 칸) (시뮬)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 탁송료 줄",
       "sample": "탁송료 : 0"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "뜻 확인 필요",
       "screen": "내 콜 화면 · 탁송 금액(안내 그림)",
       "sample": "탁송 금액 25,000원 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "freight",
   "path": "money.lines[kind=freight]",
   "label": "운송료",
   "desc": "화물24시 기본 운임. 인수증 · 카드 콜은 목록 요금과 같고, 선/착불 콜은 목록 요금 = 운 + 수다 (80,000 = 7.0 + 1.0)",
   "filledBy": "앱 목록 · 앱 상세",
   "ledger": "orders.fare",
   "pageField": "fare",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 목록 · 요금 앞 알약 «운»",
       "sample": "운 7.0"
      },
      {
       "read": "조건부 저장",
       "screen": "새 콜 화면 · 운송료 칸",
       "sample": "60,000"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "vat",
   "path": "money.lines[kind=vat]",
   "label": "부가세",
   "desc": "부가세",
   "filledBy": "앱 상세",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "fare",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 부가세 칸",
       "sample": "6,000"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "deliveryFee",
   "path": "money.lines[kind=deliveryFee]",
   "label": "배송비",
   "desc": "최종 수익의 구성",
   "filledBy": "앱 상세",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "fare",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 최종 수익 아래 배송비",
       "sample": "배송비 9,730P"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 총 수익 아래 배송비 (안내 그림)",
       "sample": "배송비 5,000원 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "promo",
   "path": "money.lines[kind=promo]",
   "label": "프로모션",
   "desc": "최종 수익의 구성",
   "filledBy": "앱 상세",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "fare",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 배송비 아래 프로모션",
       "sample": "프로모션 1,100P"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "MoneyKind",
   "field": "unknown",
   "path": "money.lines[kind=unknown]",
   "label": "뜻 모르는 금액",
   "desc": "규칙이 안 읽는다. 뜻을 알게 되면 종류를 옮긴다. 수납금액은 66,000 − 856.68 ≒ 65,144 로 수수료를 뺀 값에 가깝지만 한 건뿐이다",
   "filledBy": "앱 상세",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "fare",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 수납금액 칸",
       "sample": "65,144"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallMoney",
   "field": "paymentType",
   "path": "money.paymentType",
   "label": "결제",
   "desc": "언제 어떻게 받나. 화물24시 플러그인이 결제방법 글자에서 선/착불을 담는다. 옛 PAYMENT_TYPES 는 그대로라 지금 서버는 안 읽는다. 화물24시 인수증 콜은 이 칸이 빈다",
   "filledBy": "서버 원문",
   "ledger": "orders.paymentType",
   "pageField": "payment",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 요금 줄 괄호",
       "sample": "(신용)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "버림",
       "screen": "새 콜 목록 · 독차 옆 넷째 줄 (앱이 잡음 낱말로 버린다)",
       "sample": "선/착불"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 결제방법",
       "sample": "카드 (선/착불은 PAYMENT_TYPES 에 없어 저장 안 됨)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배차내역 줄 결제",
       "sample": "선/착불"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "꼬리표에 섞임",
       "screen": "새 콜 목록 · 요금 위 회색 네모",
       "sample": "착불"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "꼬리표에 섞임",
       "screen": "새 콜 목록 · 수입 아래 작은 테두리 글자 [tv_cost_type]",
       "sample": "선불 · 착불"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 적요 아래 · «총 수입» 앞 [tv_cost_type]",
       "sample": "착불 · 선불"
      }
     ]
    }
   }
  },
  {
   "type": "CallMoney",
   "field": "billingType",
   "path": "money.billingType",
   "label": "계산서",
   "desc": "증빙 방식. 계산서 오더는 위수탁세금계산서 발행에 동의한 기사만 잡는다. 화물24시 인수증은 운행 뒤 인수증으로 세금계산서를 발행한다는 뜻이다(자막). 화물24시는 billing 줄 없이 플러그인이 결제방법 글자를 뜻대로 나눈다",
   "filledBy": "서버 원문",
   "ledger": "orders.billingType",
   "pageField": "billing",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 목록 · 줄 바탕색 하늘 (사진으로만 보인다)",
       "sample": "하늘 = 계산서"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 요금 줄 둘째 괄호",
       "sample": "(계산서)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "버림",
       "screen": "새 콜 목록 · 독차 옆 넷째 줄 (앱이 잡음 낱말로 버린다)",
       "sample": "인수증"
      },
      {
       "read": "버림",
       "screen": "새 콜 화면 · 결제방법 칸 (지금 서버는 payment 줄로 읽고 버린다)",
       "sample": "인수증"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배차내역 줄 결제",
       "sample": "인수증"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 목록 · 수입 아래 배지(안내 그림)",
       "sample": "계산서 (안내 영상)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 적요 아래 테두리 글(안내 그림)",
       "sample": "세금계산서 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "section": "뭘 싣나 — 배차망이 말한 그대로 둔다. 실리는지는 규칙이 답한다"
  },
  {
   "type": "CallLoad",
   "field": "vehicleType",
   "path": "load.vehicleType",
   "label": "콜 차종",
   "filledBy": "앱 목록",
   "ledger": "orders.vehicleType",
   "pageField": "vehicleType",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 차종 칸",
       "sample": "1t · 다 · 라 · 1t화물"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 차량 줄",
       "sample": "차량 : 트럭-1t · 다마스"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 차량 줄",
       "sample": "차량 : 다마스"
      },
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 차량 칸 «-» 앞",
       "sample": "다마스-다마 = 다마스"
      },
      {
       "read": "안 풂",
       "screen": "내 콜 화면 · 도착지 줄 앞 글자",
       "sample": "1톤카:월곶면 = 1톤카"
      },
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 도착지 칸 앞 글자",
       "sample": "카고,문래동6가 = 카고"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 차종 칸 다른 글자",
       "sample": "오 · 용/소 (용/소는 차종/짐 크기로 보인다)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 셋째 줄 앞",
       "sample": "2.5톤/윙 · 3.5톤/전체 (승용·다마스는 못 읽음)"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 톤수 · 차종 · 적재중량",
       "sample": "1톤 · 전체 · 1톤"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배차내역 줄 톤 · 차종",
       "sample": "5톤 · 윙바디"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 톤 수 · 차종",
       "sample": "5톤 · 윙바디"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "꼬리표에 섞임",
       "screen": "새 콜 목록 · 꼬리표 네모 글자",
       "sample": "승"
      },
      {
       "read": "꼬리표에 섞임",
       "screen": "새 콜 화면 · 시트 맨 위 네모 글자",
       "sample": "승용차"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 거리 아래 [tv_car_type]",
       "sample": "오토"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 거리 다음 [tv_delivery_type]",
       "sample": "오토"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 머리 줄(안내 그림)",
       "sample": "오토바이 (안내 영상)"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 차종 줄 (안내 영상)",
       "sample": "개인이동수단 · 도보"
      }
     ]
    }
   }
  },
  {
   "type": "CallLoad",
   "field": "itemSize",
   "path": "load.itemSize",
   "label": "짐 크기",
   "filledBy": "앱 목록",
   "ledger": "orders 칸 없음 (intel.itemSize)",
   "pageField": "itemSize",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 차량 칸 «-» 뒤 (자막: 소 · 중 · 대 · 다마짐)",
       "sample": "다마스-다마 = 다마"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 꼬리표 줄",
       "sample": "중형"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 머리 줄 넷째(안내 그림)",
       "sample": "대박스 (안내 영상)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 머리 줄(안내 그림)",
       "sample": "중박스 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "type": "CallLoad",
   "field": "itemDescription",
   "path": "load.itemDescription",
   "label": "짐 글",
   "filledBy": "서버 원문",
   "ledger": "orders.itemDescription",
   "pageField": "itemSize",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 물품 줄",
       "sample": "물품 : 박스 1개"
      },
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 출발지 · 도착지 칸 앞 «폰)»",
       "sample": "폰)철산동 = 핸드폰"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 사진 물품 정보",
       "sample": "중형 세 변의 합 140cm · 20kg 이하"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 적요 안",
       "sample": "박스1개) · 큰봉투1개(80L이하)"
      }
     ]
    }
   }
  },
  {
   "type": "CallLoad",
   "field": "weightKg",
   "path": "load.weightKg",
   "label": "무게",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "itemSize",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 적재중량 칸 (화주와 통화해 확인하라는 안내가 붙어 있다)",
       "sample": "3.85톤 · 2.1톤 이하"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 사진 물품 정보 안의 글자",
       "sample": "20kg 이하"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallLoad",
   "field": "sizeCm",
   "path": "load.sizeCm",
   "label": "세 변의 합",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "itemSize",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 사진 물품 정보 안의 글자",
       "sample": "세 변의 합 140cm"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallLoad",
   "field": "passengerCount",
   "path": "load.passengerCount",
   "label": "동승 인원",
   "desc": "화주가 함께 타는 사람 수",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 출발지 칸 앞글자",
       "sample": "2분동승+창(잘림) = 2 («+» 뒤는 동 이름)"
      },
      {
       "read": "규칙 필요",
       "screen": "내 콜 화면 · 적요 안",
       "sample": "1톤 리프트 /1인동승 = 1"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallLoad",
   "field": "careTags",
   "path": "load.careTags",
   "label": "취급 주의",
   "desc": "화면 꼬리표 글자 그대로의 목록. 실리는지 판단은 규칙 몫이다",
   "filledBy": "서버 원문",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 물품 정보 아래 빨간 네모",
       "sample": "전자제품이에요 · 꽃 · 케이크에요 · 깨지기 쉬워요 · 귀중품이에요 · 신선식품이에요"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "section": "언제까지 — 상차와 하차 약속. 같은 모양이다"
  },
  {
   "type": "CallPromise",
   "field": "text",
   "path": "time.pickup.text",
   "label": "상차 약속 글자",
   "filledBy": "앱 목록",
   "ledger": "orders.scheduleText",
   "pageField": "reservation",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 출발지 칸 앞글자",
       "sample": "낼7시/ · @월09:30/ · @24일8시. · @지금/"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 상차 배지",
       "sample": "당상 · 내상(실물 캡처에는 없음)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 상차지 · 하차지 배지 · 예약 배지",
       "sample": "당상 · [예약]"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배차내역 줄 상차 · 하차 배지",
       "sample": "당상 · 당착"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 꼬리표 줄 «예약» 뒤",
       "sample": "예약 내일 · 예약 18:30 · 예약 9/30(수) · 예약"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 사진 띠",
       "sample": "내일 14:00 픽업예약"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 출발지 «@» 뒤 앞글자 [tv_pick_up_dong]",
       "sample": "낼08:20/ · 낼8:30) · 낼09시/ · 낼06:50)"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발 주소 둘째 «@» 뒤 앞글자 [tv_pick_up_point]",
       "sample": "낼8:30)"
      }
     ]
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "reserved",
   "path": "time.pickup.reserved",
   "label": "예약 표시",
   "filledBy": "앱 목록",
   "ledger": "orders.reserved",
   "pageField": "reservation",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 출발지 칸 앞글자",
       "sample": "낼7시/ = 있음"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 상차 배지",
       "sample": "[예약] 배지 = 있음 (당상은 날 표시라 예약이 아니다)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 상차지 · 하차지 배지 · 예약 배지",
       "sample": "[예약] = 있음"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 꼬리표 줄 «예약» 뒤",
       "sample": "예약 내일 = 있음"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 사진 띠",
       "sample": "내일 14:00 픽업예약 = 있음"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 출발지 «@» 뒤 앞글자 [tv_pick_up_dong]",
       "sample": "낼08:20/ = 있음"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발 주소 둘째 «@» 뒤 앞글자 [tv_pick_up_point]",
       "sample": "낼8:30) = 있음"
      }
     ]
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "day",
   "path": "time.pickup.day",
   "label": "예약 날",
   "filledBy": "앱 목록",
   "ledger": "orders.reservedDay",
   "pageField": "reservation",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 출발지 칸 앞글자",
       "sample": "낼7시/ = 1"
      },
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 출발지 칸 앞글자의 날짜 · 요일 (오늘 기준으로 바꾼다)",
       "sample": "@24일8시. · @월09:30/ · @26일/08시 · @11일08시/"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 상차 배지",
       "sample": "당상 = 0 · 내상 = 1"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 상차지 · 하차지 배지 · 예약 배지",
       "sample": "—"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 꼬리표 줄 «예약» 뒤",
       "sample": "예약 내일 = 1"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 사진 띠",
       "sample": "내일 14:00 픽업예약 = 1"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 출발지 «@» 뒤 앞글자 [tv_pick_up_dong]",
       "sample": "낼08:20/ = 1"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발 주소 둘째 «@» 뒤 앞글자 [tv_pick_up_point]",
       "sample": "낼8:30) = 1"
      }
     ]
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "at",
   "path": "time.pickup.at",
   "label": "예약 시각",
   "filledBy": "앱 목록",
   "ledger": "orders.reservedAt",
   "pageField": "reservation",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 출발지 칸 앞글자",
       "sample": "낼7시/ = 07:00"
      },
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 출발지 줄 가운데",
       "sample": "김유정 / 20시/양지면 = 20:00"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 상차 배지",
       "sample": "— (배지에 시각이 없다)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 상차지 · 하차지 배지 · 예약 배지",
       "sample": "—"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 꼬리표 줄 «예약» 뒤",
       "sample": "예약 18:30 = 18:30"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 사진 띠",
       "sample": "내일 14:00 픽업예약 = 14:00"
      },
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 첫 정거장 오른쪽 회색",
       "sample": "내일 15:00 = 15:00"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 출발지 «@» 뒤 앞글자 [tv_pick_up_dong]",
       "sample": "낼08:20/ = 08:20"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 출발 주소 둘째 «@» 뒤 앞글자 [tv_pick_up_point]",
       "sample": "낼8:30) = 08:30"
      }
     ]
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "after",
   "path": "time.pickup.after",
   "label": "이 시각 이후 상차",
   "desc": "글자에 이후 · 후 · 부터가 있거나 A-B 구간의 앞 시각",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 출발지 칸 앞글자",
       "sample": "낼11-12시/ = 11:00"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 목록 · 화물 글 안",
       "sample": "09시 이후 상차 = 09:00"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 적요 안",
       "sample": "/내일8:30분후. = 08:30"
      }
     ]
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "by",
   "path": "time.pickup.by",
   "label": "이 시각까지 상차",
   "filledBy": "서버 원문",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "clock",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 출발지 칸 앞글자",
       "sample": "낼11-12시/ = 12:00"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "읽기만 함",
       "screen": "새 콜 화면 · 픽업 상호 오른쪽 회색",
       "sample": "15:00까지 픽업 = 15:00"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 머리 아래 빨간색",
       "sample": "11:23까지 픽업완료 = 11:23"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "내 콜 화면 · 파란 단계 줄",
       "sample": "16:00까지 픽업완료 · 16:00까지 출발지로 이동 = 16:00"
      }
     ]
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "text",
   "path": "time.dropoff.text",
   "label": "하차 약속 글자",
   "filledBy": "앱 목록",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "clock",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "버림",
       "screen": "새 콜 목록 · 도착지 칸 앞글자 (도착 약속)",
       "sample": "낼8/ · 8시/ · 낼10시/"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "꼬리표에 섞임",
       "screen": "새 콜 목록 · 하차 배지 (꼬리표 줄)",
       "sample": "당착 · 내착"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "읽기만 함",
       "screen": "새 콜 화면 · 배송 상호 오른쪽 회색",
       "sample": "18:28까지 배송"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "꼬리표에 섞임",
       "screen": "새 콜 목록 · 도착지 앞 마감 앞글자 [tv_dest_dong]",
       "sample": "10:20전/"
      },
      {
       "read": "꼬리표에 섞임",
       "screen": "새 콜 화면 · 도착 주소 동 앞 마감 앞글자 [tv_dest_point]",
       "sample": "10:20전/"
      }
     ]
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "reserved",
   "path": "time.dropoff.reserved",
   "label": "하차 예약 표시",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 도착지 칸 앞글자에서 뽑는다",
       "sample": "낼8/ = 있음"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "꼬리표에 섞임",
       "screen": "새 콜 목록 · 하차 배지에서 뽑는다",
       "sample": "당착 = 있음"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "day",
   "path": "time.dropoff.day",
   "label": "하차 날",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 도착지 칸 앞글자에서 뽑는다",
       "sample": "낼8/ = 1"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "꼬리표에 섞임",
       "screen": "새 콜 목록 · 하차 배지에서 뽑는다",
       "sample": "당착 = 0 · 내착 = 1"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "at",
   "path": "time.dropoff.at",
   "label": "하차 시각",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 도착지 칸 앞글자에서 뽑는다",
       "sample": "낼8/ = 08:00 · 13시착/ = 13:00 · 10:30착/ = 10:30 · 낼아침9시착 = 09:00 · 11:20경/ = 11:20 (경 = 대략, text 에 남는다)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "버림",
       "screen": "새 콜 목록 · 화물 글 안 (앱이 가르고 파서가 버린다)",
       "sample": "당오전12시30분착 = 12:30 · 내일오전8시착 = 08:00"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 둘째 정거장 오른쪽 회색",
       "sample": "내일 16:40 = 16:40"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 적요 안",
       "sample": "10시도착 = 10:00"
      }
     ]
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "after",
   "path": "time.dropoff.after",
   "label": "이 시각 이후 하차",
   "desc": "상차 약속과 같은 모양이라 칸이 있다. 화면에서 본 적은 없다",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallPromise",
   "field": "by",
   "path": "time.dropoff.by",
   "label": "이 시각까지 하차",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "clock",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 도착지 칸 앞글자",
       "sample": "14시전/ = 14:00 · 09:50안착/ = 09:50"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "버림",
       "screen": "새 콜 목록 · 화물 글 안 (앱이 가르고 파서가 버린다)",
       "sample": "10시전하차 = 10:00"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 배송 상호 오른쪽 회색에서 뽑는다",
       "sample": "18:28까지 배송 = 18:28"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 도착지 앞 마감 앞글자에서 뽑는다",
       "sample": "10:20전/ = 10:20"
      },
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 파란 단계 줄",
       "sample": "16:00까지 배송완료 = 16:00"
      },
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 적요 안",
       "sample": "7시 40분까지 배송 = 07:40"
      }
     ]
    }
   }
  },
  {
   "type": "CallTime",
   "field": "returnPickup",
   "path": "time.returnPickup",
   "label": "왕복 때 다시 상차",
   "desc": "왕복 콜에서 하차지에서 다시 실어 출발지로 돌아가는 약속. 모양은 상차 약속과 같다. 기사님 말씀대로 적요에 풀려 들어가고, 채우는 규칙은 왕복 콜 상세를 본 뒤 정한다",
   "filledBy": "규칙",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 도착지 칸 «왕복/» 뒤",
       "sample": "왕복/낼7시/송파 = 낼 07:00"
      },
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 적요 안 (왕복 콜 이미지 없음)",
       "sample": "—"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallTime",
   "field": "remaining",
   "path": "time.remaining",
   "label": "남은 시간",
   "filledBy": "앱 목록",
   "ledger": "🔴 BaseCall JSON 칸",
   "pageField": "remaining",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "꼬리표에 섞임",
       "screen": "새 콜 목록 · 꼬리표 줄",
       "sample": "준비 29분 · 31분 내(도보 줄)"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 꼬리표 아래 시계 상자",
       "sample": "배송 31분 남음 준비 17분 포함"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 내 오더 줄 머리",
       "sample": "14분 남음"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 운행 시트 머리",
       "sample": "준비 13분 · 배송 33분"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 머리 아래 빨간색",
       "sample": "36분 지연 · 픽업 33분 지연 중"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallTime",
   "field": "postTime",
   "path": "time.postTime",
   "label": "올린 시각",
   "desc": "인성에는 올린 시각 칸이 없다. 지금 코드는 줄의 첫 HH:MM 을 주워 약속 시각을 넣는다",
   "filledBy": "앱 목록",
   "ledger": "orders.postTime",
   "pageField": "clock",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "잘못 들어감",
       "screen": "새 콜 목록 · 목록 줄의 첫 HH:MM (InsungParser.kt:507)",
       "sample": "8:30 · 18:30 (약속 시각)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 하차 배지 앞 시각",
       "sample": "06:36 = 상세 «등록시간 06:36분»"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 머리",
       "sample": "등록시간:05:18분"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "section": "조건 — 편도 · 급송 같은 조건과 사람이 읽을 글"
  },
  {
   "type": "CallJob",
   "field": "tripType",
   "path": "job.tripType",
   "label": "배송 구분",
   "desc": "편도 · 왕복 · 경유",
   "filledBy": "서버 원문",
   "ledger": "orders.tripType",
   "pageField": "tags",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 목록 · 줄 바탕색 초록 · 보라 (사진으로만 보인다)",
       "sample": "초록 = 왕복 · 보라 = 경유"
      },
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 출발지 · 도착지 칸 글자",
       "sample": "@왕복/아현동 · 왕복/낼7시/송파 · @11일08시/경유"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 구분 줄",
       "sample": "구분 : 편도"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "버림",
       "screen": "새 콜 목록 · 배지 (앱이 잡음 낱말로 버린다)",
       "sample": "왕복"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 운행방법",
       "sample": "편도"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 오더메모 아래 테두리 (안내 그림)",
       "sample": "왕복"
      }
     ]
    }
   }
  },
  {
   "type": "CallJob",
   "field": "orderForm",
   "path": "job.orderForm",
   "label": "배송 형태",
   "filledBy": "서버 원문",
   "ledger": "orders.orderForm",
   "pageField": "reservation",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 목록 · 줄 바탕색 노랑 (사진으로만 보인다)",
       "sample": "노랑 = 급송"
      },
      {
       "read": "안 풂",
       "screen": "새 콜 목록 · 출발지 칸 글자",
       "sample": "@내일9시/급 (영상_2257)"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 형태 줄",
       "sample": "형태 : 보통"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 오른쪽 위 네모",
       "sample": "급송"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "규칙 필요",
       "screen": "새 콜 목록 · 차종 아래 배지 (안내 그림)",
       "sample": "급"
      }
     ]
    }
   }
  },
  {
   "type": "CallJob",
   "field": "tagsText",
   "path": "job.tagsText",
   "label": "꼬리표",
   "desc": "제 칸이 없는 꼬리표만 남는다. 지금 원달앱의 쌍둥이 키 · 픽커 퀵 · 도보 판단 · 사진 판독 표식이 이 글자를 읽어, 줄이면 동작이 바뀐다",
   "filledBy": "앱 목록",
   "ledger": "orders 칸 없음 (intel.tagsText)",
   "pageField": "tags",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 하차 배지 · 꼬리표",
       "sample": "당상 · 당착"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배차내역 줄 배지(미수금 — 수금 상태 · 지 — 뜻 모름)",
       "sample": "미수금 · 지 · 독차"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 배지(지 — 뜻 모름)",
       "sample": "지 · 독차"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 목록 · 꼬리표 줄",
       "sample": "퀵 반나절 승"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 시트 맨 위 꼬리표 줄 첫 낱말",
       "sample": "퀵"
      },
      {
       "read": "안 읽음",
       "screen": "새 콜 화면 · 시트 맨 위 꼬리표 줄 «퀵» 뒤 — 차례: 급송 → 단거리/반나절 → 승용차 → 예약 → 비즈ⓘ",
       "sample": "퀵 반나절 예약"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 오른쪽 배지",
       "sample": "도보 (끄는 탭의 줄)"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "새 콜 목록 · 차종 아래 배지(안내 그림)",
       "sample": "급 · 왕 · 빈 · 경 (안내 영상)"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 차종 뒤 세로 구분선 다음 [tv_fast]",
       "sample": "과적"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 머리 줄 · 적요 아래 테두리 글(안내 그림)",
       "sample": "급송 · 왕복 · 빈나감 (안내 영상)"
      },
      {
       "read": "규칙 필요",
       "screen": "새 콜 화면 · 오더메모 아래 테두리 (안내 그림)",
       "sample": "빈나감"
      }
     ]
    }
   }
  },
  {
   "type": "CallJob",
   "field": "detailMemo",
   "path": "job.detailMemo",
   "label": "적요",
   "filledBy": "서버 원문",
   "ledger": "orders.detailMemo",
   "pageField": "memo",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 적요 칸 · 적요 상세 팝업",
       "sample": "1시상차 6박스 카트가지고 고객님앞 갖다주세요"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 적요 상세 팝업 «적요 내용» ~ «닫기»",
       "sample": "까대기 있음 직접운반 / 대기 30분 (시뮬)"
      },
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · 본문 «적요상세» 줄",
       "sample": "적요상세 10시전하차 착불 (시뮬)"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 적요 칸",
       "sample": "1시상차 6박스 …"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "읽기만 함",
       "screen": "새 콜 목록 · 셋째 줄 화물 글",
       "sample": "당일상 당착 공파렛 50p / 10시전하차 · 당일오전9시30분상"
      },
      {
       "read": "읽기만 함",
       "screen": "새 콜 화면 · 화물정보 칸",
       "sample": "지금상 당착 59박스 수/수-A [독차]"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 화물정보",
       "sample": "당일상 당착 #연계#쿠팡 24시(군포-부천)새벽02시(부천-동탄)가는대로 하차"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "읽기만 함",
       "screen": "새 콜 화면 · 사진 유의사항",
       "sample": "바로 배송가주실 분만 잡아주세요"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 오더 전체 보기 고객 요청",
       "sample": "문 앞에 놔주세요 (벨 O) 비대면 배달 / 사진 필수"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "콜에 저장",
       "screen": "새 콜 화면 · «적요상세» 다음(빈 적요는 «없음») [tv_caution]",
       "sample": "1박스 3층 계단물건 있음"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 적요(안내 그림 제목 «오더메모» — 실물 상세는 «적요상세»)",
       "sample": "주차장으로 들어와주세요 (안내 영상)"
      }
     ]
    }
   }
  },
  {
   "section": "잡은 뒤 진행 — BaseCall 밖 — 콜을 잡은 뒤 배차망 화면에 적힌 진행 사실. 키만 정했고 저장 칸은 없다"
  },
  {
   "type": "NetworkProgress",
   "field": "acceptedAt",
   "path": "progress.acceptedAt",
   "label": "잡은 시각",
   "desc": "배차망이 적은 시각. ackedAt 은 폰이 결재를 실행한 시각이라 다르다",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "뜻 확인 필요",
       "screen": "내 콜 목록 · 완료 탭 줄",
       "sample": "18:38 (상세 약속 19;30 과 다르다, 영상_1633)"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 배차내역 줄 오른쪽 시각",
       "sample": "12-30 14:53"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 배차시간",
       "sample": "배차시간: 12-30 14:53"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "NetworkProgress",
   "field": "shortOrderNo",
   "path": "progress.shortOrderNo",
   "label": "짧은 오더 코드",
   "desc": "잡은 뒤에만 보이는 짧은 글자. 같은 콜의 F번호와 다르다. 뜻은 아직 화면으로만 안다",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 왼쪽 위 짧은 코드",
       "sample": "DJYZ914"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "NetworkProgress",
   "field": "pickedUpAt",
   "path": "progress.pickedUpAt",
   "label": "픽업 시각",
   "desc": "배차망이 적은 시각. 약속인지 실제인지 아직 모른다",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "뜻 확인 필요",
       "screen": "내 콜 목록 · 픽업시간 (안내 영상)",
       "sample": "09:38"
      }
     ]
    }
   }
  },
  {
   "type": "NetworkProgress",
   "field": "pickupSigned",
   "path": "progress.pickupSigned",
   "label": "상차 서명",
   "desc": "서명을 마쳤나",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 상차지 오른쪽 단추",
       "sample": "서명완료 = true · 서명 = false"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "NetworkProgress",
   "field": "dropoffSigned",
   "path": "progress.dropoffSigned",
   "label": "하차 서명",
   "desc": "서명을 마쳤나",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 하차지 오른쪽 단추",
       "sample": "서명완료 = true · 서명 = false"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "NetworkProgress",
   "field": "cancelable",
   "path": "progress.cancelable",
   "label": "취소 가능",
   "desc": "잡은 뒤에만 보이고 시간이 지나면 바뀐다",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 취소 단추 (자막)",
       "sample": "1분 안에 취소 가능 · 지나면 취소 불가"
      }
     ]
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · «배정 취소» 단추 · 팝업",
       "sample": "배정 취소 불가 = false"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "NetworkProgress",
   "field": "deliveredAt",
   "path": "progress.deliveredAt",
   "label": "완료 시각",
   "desc": "배차망이 적은 시각",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 배차내역 상세 하차시간",
       "sample": "하차시간 2025-11-23 20:43분"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 오더 완료 시각",
       "sample": "완료 15:23"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "뜻 확인 필요",
       "screen": "내 콜 목록 · 배송시간 (안내 영상, 약속인지 실제인지 모름)",
       "sample": "15:40"
      }
     ]
    }
   }
  },
  {
   "type": "NetworkProgress",
   "field": "canceledAt",
   "path": "progress.canceledAt",
   "label": "취소 시각",
   "desc": "배차망이 적은 시각",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 오더 취소 시각",
       "sample": "취소 14:27"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "NetworkProgress",
   "field": "proofRule",
   "path": "progress.proofRule",
   "label": "사진 인증 조건",
   "desc": "완료할 때 화면이 요구한 조건",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 카메라 아래 안내",
       "sample": "물품과 장소가 함께 보이도록 촬영해주세요"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "section": "돈 받기 — BaseCall 밖 — 콜을 잡은 뒤 돈을 받는 과정. 키만 정했고 지금 있는 칸은 그대로 쓴다"
  },
  {
   "type": "CallSettlement",
   "field": "status",
   "path": "settlement.status",
   "label": "우리 쪽 수금 상태",
   "desc": "지금 코드 값 그대로: 미정산 · 수령 · 미수금",
   "filledBy": "—",
   "ledger": "orders.settlementStatus",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "unpaidWon",
   "path": "settlement.unpaidWon",
   "label": "못 받은 돈",
   "desc": "",
   "filledBy": "—",
   "ledger": "orders.unpaidAmount",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "settledAt",
   "path": "settlement.settledAt",
   "label": "받은 시각",
   "desc": "",
   "filledBy": "—",
   "ledger": "orders.settledAt",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "networkCollect",
   "path": "settlement.networkCollect",
   "label": "배차망 수금 글자",
   "desc": "배차망이 적은 글자 그대로",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · 맨 위 네모",
       "sample": "미수금 · 수금"
      },
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 수금상태",
       "sample": "<미수금>"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "collectConfirmedAt",
   "path": "settlement.collectConfirmedAt",
   "label": "수금확인일",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 목록 · [정산] 네모 옆",
       "sample": "수금확인일: 2025-11-24"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "depositAccount",
   "path": "settlement.depositAccount",
   "label": "입금계좌",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 세금계산서 입금계좌",
       "sample": "은행/계좌/이름 (견본 가림)"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "receipt.status",
   "path": "settlement.receipt.status",
   "label": "인수증 전송",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 결제 정보 «인수증»",
       "sample": "미전송"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "receipt.count",
   "path": "settlement.receipt.count",
   "label": "인수증 장수",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 아래 단추",
       "sample": "인수증(2) = 2"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "taxInvoice.status",
   "path": "settlement.taxInvoice.status",
   "label": "세금계산서 상태",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 탭 위 띠 · 줄 상태",
       "sample": "전자세금계산서 미발행 상태 · 계산서발행 완료 · 발행완료"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "taxInvoice.writtenAt",
   "path": "settlement.taxInvoice.writtenAt",
   "label": "작성일자",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 발행 입력 · 내역",
       "sample": "2025-11-25"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "taxInvoice.issuedAt",
   "path": "settlement.taxInvoice.issuedAt",
   "label": "발행일",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 발행 내역",
       "sample": "26.03.12"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "taxInvoice.approvalNo",
   "path": "settlement.taxInvoice.approvalNo",
   "label": "승인번호",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 발행 내역",
       "sample": "(견본 일부 가림)"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "taxInvoice.supplyWon",
   "path": "settlement.taxInvoice.supplyWon",
   "label": "공급가",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 발행 입력",
       "sample": "120000"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "taxInvoice.vatWon",
   "path": "settlement.taxInvoice.vatWon",
   "label": "부가세",
   "desc": "콜 값 money vat 와 달리 발행한 금액이다",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 발행 입력",
       "sample": "12000"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "taxInvoice.amendReason",
   "path": "settlement.taxInvoice.amendReason",
   "label": "수정 사유",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 수정 발행 체크",
       "sample": "공급가액변동"
      }
     ]
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": []
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "earned.won",
   "path": "settlement.earned.won",
   "label": "적립 금액",
   "desc": "콜 한 건에 실제로 들어오거나 나간 돈. 나가면 음수다",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": [
      {
       "read": "뜻 확인 필요",
       "screen": "내 콜 화면 · 포인트 내역 줄",
       "sample": "카드결제수행 27,280P"
      }
     ]
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 수행내역 · 적립금 내역",
       "sample": "9,000원 적립 · 10,000 · 현금 결제 수행 −1,000"
      }
     ]
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "earned.text",
   "path": "settlement.earned.text",
   "label": "적립 설명",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 적립 줄 설명",
       "sample": "비산동 → 내당동 완료, 수수료 차감"
      }
     ]
    }
   }
  },
  {
   "type": "CallSettlement",
   "field": "earned.at",
   "path": "settlement.earned.at",
   "label": "적립 시각",
   "desc": "",
   "filledBy": "—",
   "ledger": "칸 없음 (키만 정함)",
   "pageField": "",
   "nets": {
    "insung": {
     "req": "",
     "lines": []
    },
    "hwamul24": {
     "req": "",
     "lines": []
    },
    "kakaopicker": {
     "req": "",
     "lines": []
    },
    "isflex": {
     "req": "",
     "lines": [
      {
       "read": "안 읽음",
       "screen": "내 콜 화면 · 적립 줄 시각",
       "sample": "2023-09-17 19:21"
      }
     ]
    }
   }
  }
 ]
};
