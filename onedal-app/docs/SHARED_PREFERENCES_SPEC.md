# 🗄️ 1DAL SharedPreferences 키 명세서

> **문서 상태**: v1.0  
> **작성일**: 2026-05-05  
> **파일명**: `OneDalPrefs` (SharedPreferences Name)  
> **목적**: 앱 전체에서 사용되는 로컬 저장소 키를 한 곳에서 관리

---

## 키 전체 목록

### 🔧 기기 및 환경 설정 (수명: 영구)

| 키 | 타입 | 기본값 | 읽기 주체 | 쓰기 주체 | 설명 |
|----|------|--------|-----------|-----------|------|
| `deviceId` | String | `"앱폰-{모델명}-{랜덤3자리}"` | ApiClient | ApiClient (최초 1회 생성) | 기기 고유 식별자 |
| `isLiveMode` | Boolean | `false` | ApiClient, MainActivity | MainActivity (UI 스위치) | `true`=프로덕션 서버, `false`=로컬 개발 서버 |
| `localPcIp` | String | `"172.30.1.89:4000"` | ApiClient | MainActivity (UI 입력) | 로컬 모드 시 서버 IP:Port |
| `targetApp` | String | `"인성콜"` | ApiClient | MainActivity (UI 선택) | 스크래핑 대상 앱 이름 |
| `deathValleyTimeout` | Long | `30000` (30초) | HijackService | MainActivity (UI 슬라이더) | 데스밸리 자동취소 타이머 (ms) |

### 📡 서버 동기화 데이터 (수명: 매 /scrap 응답 시 갱신)

| 키 | 타입 | 읽기 주체 | 쓰기 주체 | 설명 |
|----|------|-----------|-----------|------|
| `activeFilter` | String (JSON) | HijackService (shouldClick), ApiClient | ApiClient (scrap 응답) | 서버에서 내려온 `FilterConfig` JSON 문자열 |
| `apiStatus` | String (JSON) | MainActivity (UI 표시) | ApiClient (scrap 응답) | `{success, totalItems}` 서버 통계 |
| `deviceControl` | String (JSON) | MainActivity (UI 표시) | ApiClient (scrap 응답) | `{mode: "AUTO"/"MANUAL"}` 모드 지시 |
| `targetAppKeywords` | String (JSON) | (향후 사용) | ApiClient (keywords 응답) | 서버에서 받은 키워드 사전 |

### 🔍 디버깅 및 UI 표시용 (수명: 매 통신 시 덮어씀)

| 키 | 타입 | 읽기 주체 | 쓰기 주체 | 설명 |
|----|------|-----------|-----------|------|
| `api_confirm_req` | String (JSON) | MainActivity (디버그) | ApiClient | 마지막 /confirm 요청 본문 |
| `api_confirm_res` | String (JSON) | MainActivity (디버그) | ApiClient | 마지막 /confirm 응답 본문 |
| `api_detail_req` | String (JSON) | MainActivity (디버그) | ApiClient | 마지막 /detail 요청 본문 |
| `api_detail_res` | String (JSON) | MainActivity (디버그) | ApiClient | 마지막 /detail 응답 본문 |
| `api_scrap_req` | String (JSON) | MainActivity (디버그) | ApiClient | 마지막 /scrap 요청 본문 |
| `api_scrap_res` | String (JSON) | MainActivity (디버그) | ApiClient | 마지막 /scrap 응답 본문 |
| `api_emergency_req` | String (JSON) | MainActivity (디버그) | ApiClient | 마지막 /emergency 요청 본문 |
| `api_emergency_res` | String (JSON) | MainActivity (디버그) | ApiClient | 마지막 /emergency 응답 본문 |
| `lastScrapTime` | Long | MainActivity (UI) | ApiClient | 마지막 스크랩 전송 시각 (epoch ms) |
| `lastScrapSize` | Int | MainActivity (UI) | ApiClient | 마지막 스크랩 건수 |
| `lastScrapPreview` | String | MainActivity (UI) | ApiClient | 마지막 스크랩 미리보기 (`"출발지 -> 도착지"`) |

### 🛡️ Piggyback 판결 ACK (수명: 수신~확인 전송까지)

| 키 | 타입 | 읽기 주체 | 쓰기 주체 | 설명 |
|----|------|-----------|-----------|------|
| `pendingAckDecisionId` | String? | ApiClient (scrap 전송 시 주입) | ApiClient (decision 수신 시 저장) | 서버 판결 수신 확인 대기 중인 orderId. ACK 전송 성공 시 삭제됨 |
