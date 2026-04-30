# 동적 필터 시스템(Dynamic Filter System) 아키텍처 개편안

제가 설명을 너무 축약해서 오해를 드렸습니다! **다른 설정값들(반경, 요금, 제외 키워드 등)은 당연히 DB에 모두 영구 저장됩니다.** 

제가 삭제하겠다고 한 것은 오직 **"방대하게 부풀려진 배열 데이터 2개(`destination_keywords`, `allowed_vehicle_types`)"** 뿐입니다. 이 두 가지는 사장님 말씀대로 "기본 세팅값(시/도, 내 차종)을 가지고 서버 메모리에서 그때그때 동적으로 만들어 쓰면 되기 때문에" 굳이 DB 공간을 낭비하며 저장할 필요가 없다는 뜻이었습니다.

## User Review Required

> [!IMPORTANT]
> **DB에 영구 저장되는 값 (유지됨):**
> - `destination_city` (목적지 도시, 예: "파주시")
> - `destination_radius_km`, `corridor_radius_km`, `pickup_radius_km` (각종 반경)
> - `min_fare`, `max_fare` (운임 하한/상한선)
> - `excluded_keywords` (제외 단어)
> - `is_active` (무인 서핑 모드 ON/OFF)
> - 요율표(`vehicle_rates`), 수수료(`agency_fee_percent`) 등등...
> 
> **DB에서 삭제되고 메모리(RAM)에서만 동적 생성되는 값:**
> 1. `destination_keywords`: DB에 있는 "파주시"를 읽어와서 서버 메모리에서 "금촌동, 문산읍..." 등 50개 배열로 실시간 확장.
> 2. `allowed_vehicle_types`: 내 차종("1t")을 읽어와서 서버 메모리에서 "1t, 다마스, 라보, 승용차"로 실시간 확장.

> [!TIP]
> **통제 필터 설정 팝업(깔때기) 작동 로직:**
> 사장님께서 제안해주신 핵심 로직 그대로 구현합니다.
> 1. DB의 기본값으로 동적 생성된 `activeFilter`를 팝업에 띄워줍니다.
> 2. 팝업에서 특정 읍/면/동을 끄거나 차종을 빼고 **[저장]**을 누르면, 이는 `runtimeOverrides`에 덮어씌워집니다.
> 3. 이 오버라이드된 값은 오직 **현재 세션(메모리)에만 존재**하며, 퇴근하고(로그아웃) 내일 다시 서버에 접속하면 말끔히 날아가고 다시 "파주시 전체 동네"로 깔끔하게 초기화됩니다.

이 방향이 사장님께서 의도하신 완벽한 "동적 런타임 필터" 구조가 맞으신지 확인 부탁드립니다! 맞으시다면 바로 코드 수정(DB 스키마 정리 및 filterManager 재설계)에 들어가겠습니다.

## Proposed Changes

### 1. `server/src/db.ts`
- `user_filters` 테이블에서 불필요해진 `allowed_vehicle_types`, `destination_keywords` 두 컬럼의 사용을 중단합니다.

### 2. `server/src/state/userSessionStore.ts`
- `getUserSession()` 로드시 `user_filters`에서 `destination_keywords`, `allowed_vehicle_types`를 파싱하던 코드를 지웁니다.
- `baseFilter`에는 DB에 있는 순수 원본(목적지 도시명, 각종 반경, 금액 등)만 담습니다.

### 3. `server/src/state/filterManager.ts`
- `stmtUpdateFilter` 쿼리에서 `allowed_vehicle_types`와 `destination_keywords`를 제거합니다.
- `session.activeFilter` 생성 시, 아래와 같이 동적 파생 로직을 삽입합니다:
  ```typescript
  // 1. baseFilter와 일회성 팝업 설정(runtimeOverrides)을 합침
  session.activeFilter = { ...session.baseFilter, ...session.runtimeOverrides };
  
  // 2. 만약 팝업에서 사용자가 읍면동을 따로 건드리지 않았다면, 목적지 도시명으로 전체 읍면동 자동 생성
  if (!session.runtimeOverrides.destinationKeywords && session.activeFilter.destinationCity) {
      session.activeFilter.destinationKeywords = getRegionsByCity(session.activeFilter.destinationCity);
  }
  
  // 3. 만약 팝업에서 차종을 따로 건드리지 않았다면, 내 차종 기준으로 하위 차종 전체 자동 생성
  if (!session.runtimeOverrides.allowedVehicleTypes) {
      session.activeFilter.allowedVehicleTypes = getSharedModeVehicleTypes(userVehicleType);
  }
  ```

### 4. `server/src/routes/settings.ts`
- 제가 이전 단계에서 추가했던 `PUT /api/settings`의 `destinationKeywords` 하드코딩 저장 로직을 다시 롤백(제거)하여 DB 오염을 막습니다.
