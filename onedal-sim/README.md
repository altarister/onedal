# onedal-sim — 배차망 시뮬레이터

앱폰이 읽을 **가짜 배차망 화면**. 사업자가 없어 실 배차망 앱을 설치할 수 없는 동안,
이것이 이 제품의 유일한 배차망이다.

```bash
cd onedal-sim && pnpm install && pnpm dev     # http://<PC IP>:5173
```

폰에서는 **크롬으로** 열어야 한다 (삼성 인터넷은 웹 콘텐츠를 접근성 트리에 안 올린다 —
자세한 이유는 [onedal-web/CLAUDE.md](../onedal-web/CLAUDE.md)).

## 🔴 onedal-web 과 완전히 별개다

레포 안에 있지만 **서로를 모른다.** 격리는 네 겹이고, 그 이유는
[pnpm-workspace.yaml](pnpm-workspace.yaml) 에 적어 뒀다 —
폴더(형제) · 워크스페이스(설치·빌드 분리) · 게이트(커밋 게이트 밖) · 배포(트리거 밖).

## 🎯 문제지 — 특정 조건을 바로 시험한다

콜은 평소 랜덤으로 뜬다. 그래서 *"인천 남동구행 콜이 뜨면 앱이 거르는가"* 를 보려면
복권을 긁어야 했다. 문제지는 정해진 콜을 **순서대로 한 문제씩** 흘린다.

```
http://<PC IP>:5173/inseong/dispatch?preset=오탐
http://<PC IP>:5173/hwamul24/dispatch?preset=오탐
```

`오탐` 문제지 (2026-08-22 실사고 재현 — 사전 확장 매칭 ④):

| | 앱이 읽을 도착지 | 정답 | 왜 |
|---|---|---|---|
| ① | `남동구` (인천) | **거른다** | 키워드 "남동"의 부분 문자열일 뿐 — 집(광주) 방향이 아니다 |
| ② | `남동` (광주) | **올린다** | 진짜 그 동 — 오탐 막느라 이걸 놓치면 미탐(더 아픈 실패) |
| ③ | `중동` (부천) | **거른다** | 같은 함정의 다른 낱말 |
| ④ | `초월읍` (광주) | **올린다** | 평범한 콜 — 문제지가 필터를 통째로 막지 않았음을 확인 |

채점은 폰 로그로 본다: `adb logcat | grep "1차 리스트 필터"` —
①③ 이 `결과=false`, ②④ 가 `결과=true` 여야 통과다.

문제지 추가·수정: [packages/core-simulator/src/presets.ts](packages/core-simulator/src/presets.ts)
(주소는 `mockLocationData.json` 에서 찾으므로 **좌표를 지어내지 않는다**)

## 배차망 회사를 늘리려면

1. `packages/ui-simulators/<회사>/` 에 화면 컴포넌트
2. `packages/ui-simulators/src/index.ts` 에 export
3. `src/pages/` 에 셋업·배차 페이지, `src/App.tsx` 에 라우트 두 줄
4. 앱 쪽은 이미 플러그인 구조(`IScrapParser`)라 파서만 붙이면 된다

## 어디서 왔나

`~/reps/map/map`(지도 암기 게임)에서 **배차 시뮬레이터 부분만** 파일 복사로 가져왔다
(2026-08-22). 그쪽 git·배포는 그대로 살아 있다. 게임은 안 가져왔다 —
시뮬레이터는 게임을 참조하지 않아 깨끗하게 떨어졌다(외부 의존은 react + react-router-dom 뿐).
