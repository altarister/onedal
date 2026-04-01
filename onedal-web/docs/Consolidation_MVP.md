# 1DAL 합짐 시뮬레이터 MVP (데이터 모델 및 목업 정의서)

## 1. 프론트엔드 메모리 상태 구조 (TypeScript Types)
기존 서버 DB의 `OrderData`를 건드리지 않고, React 컴포넌트(`Dashboard.tsx`) 내부에서만 사용하는 로컬 상태(Local State)를 이렇게 선언합니다.

```typescript
// 1. 상태 선언
const [mainCall, setMainCall] = useState<OrderData | null>(null);
const [subCalls, setSubCalls] = useState<OrderData[]>([]);
const [rejectedCallIds, setRejectedCallIds] = useState<Set<string>>(new Set());

// 2. 파생 데이터: [현재 확정된 전체 배차(경로) 목록]
const activeRoute: OrderData[] = useMemo(() => {
  if (!mainCall) return [];
  return [mainCall, ...subCalls];
}, [mainCall, subCalls]);
```

## 2. 화면 구성 요소 (UI Layout)
### 🌟 상단: 확정된 관제 영역 (Pinned Block)
- **노출 시점:** 단 1개의 콜이라도 '확정' 버튼을 눌렀을 때만 나타납니다.
- **표시 정보:** 
  - 내가 확정한 콜들의 `출발지 -> [경유지] -> 도착지` 누적 요약 텍스트
  - 합산된 **총 요금 (예: 50,000원)**
- **액션 버튼:**
  - `[📞 모든 상차지 퀵 전화]`
  - `[🚀 아이폰으로 내비 발사]`
  - `[초기화]`

### 📥 하단: 실시간 수신 영역 (Pending List)
- **노출 시점:** 스캐너에서 올라온 모든 신규 콜이 쌓이는 곳.

## 3. 각 상황별 버튼 변화와 상호작용 (Interactions)
- **아무 콜도 안 잡았을 때:** `[✅ 단독 배차 확정]`, `[❌ 패스]`
- **1개를 잡은 상태일 때:** `[🔬 합짐 계산기]`, `[❌ 패스]`
- **합짐 계산기를 눌렀을 때:** `⏳ +25분 추가 소요 / +15km 우회` 텍스트와 함께 `[✅ 합짐 확정]` 노출.

## 4. 목업 데이터 "실제 좌표" 주입 (Mock Data Setup)
카카오 API(우회율 계산, 내비게이션) 작동을 위해 하드코딩된 X, Y 좌표를 부여합니다.

### 📍 [MOCK 1] 첫 번째 꿀콜 (메인)
- **pickup (강남역)**: `x: 127.0276, y: 37.4979`
- **dropoff (판교역)**: `x: 127.1111, y: 37.3947`
- **요금**: 30,000원

### 📍 [MOCK 2] 두 번째 똥콜 (테스트용)
- **pickup (역삼역)**: `x: 127.0364, y: 37.5006`
- **dropoff (일산 킨텍스)**: `x: 126.7460, y: 37.6695`
- **요금**: 15,000원 

### 📍 [MOCK 3] 세 번째 꿀콜 (합짐 시뮬용)
- **pickup (양재역)**: `x: 127.0343, y: 37.4841` (강남->판교 내려가는 길)
- **dropoff (정자역)**: `x: 127.1082, y: 37.3670` (판교 바로 밑)
- **요금**: 22,000원
