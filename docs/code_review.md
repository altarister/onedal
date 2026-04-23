# 코드 리뷰 리포트: baseFilter / runtimeOverrides 분리

수정된 파일 5개를 전수 검사한 결과입니다.

---

## ✅ 정상 구현 (4건)

### 1. `userSessionStore.ts` — 세션 초기화
- `baseFilter`에 DB 순수 원본만 적재, `runtimeOverrides`에 런타임 상태만 적재 → **정상**
- `activeFilter = { ...baseFilter, ...runtimeOverrides }` 로 합성 → **정상**
- 세션 복구 시 `loadState: 'EMPTY'`, `isSharedMode: false` 강제 초기화 → **정상**

### 2. `filterManager.ts` — 핵심 분기 로직
- `persistToDB=true` → `baseFilter` 업데이트 + DB 저장 → **정상**
- `persistToDB=false` → `runtimeOverrides`만 업데이트 → **정상**
- DB UPDATE 시 `baseFilter` 값만 사용 → **DB 오염 원천 차단 정상**
- `loadState === 'EMPTY'` 감지 시 `runtimeOverrides` 초기화 → **정상**

### 3. `useFilterConfig.ts` — 프론트 훅
- `filter-init`, `filter-updated` 페이로드에서 `activeFilter`와 `baseFilter` 분리 수신 → **정상**
- `updateFilter` 시 Optimistic UI로 `filter`와 `baseFilter` 양쪽 선반영 → **정상**

### 4. `OrderFilterModal.tsx` — 모달 폼
- `baseFilter: filter` 로 별칭 바인딩하여 폼에는 항상 DB 원본값이 표시됨 → **999 유입 차단 정상**

---

## 🔴 버그 발견 (2건)

### 버그 1. `dispatchEngine.ts:361` — applyFilter를 우회하는 직접 emit (치명)

```typescript
// dispatchEngine.ts, syncCorridorFilter 함수 (354~362행)
session.activeFilter = { 
    ...session.activeFilter,
    destinationKeywords: regions.flat,
    destinationGroups: regions.grouped,
    customCityFilters: regions.customCityFilters
};
if (io) {
    io.to(userId).emit("filter-updated", session.activeFilter);  // ← 문제!
}
```

> [!CAUTION]
> **문제:** 이 코드는 `applyFilter()`를 거치지 않고 `session.activeFilter`를 직접 수정한 뒤, 프론트엔드로 `session.activeFilter`만 단독으로 emit하고 있습니다.
>
> **영향 2가지:**
> 1. **페이로드 불일치:** 프론트엔드의 `useFilterConfig`는 이제 `{ activeFilter, baseFilter }` 객체를 기대하는데, 여기서는 `session.activeFilter` 하나만 보냅니다. 프론트에서 `payload.activeFilter`가 `undefined`가 되어 **filter 상태가 null로 초기화**될 수 있습니다.
> 2. **baseFilter/runtimeOverrides 우회:** `applyFilter()`를 거치지 않으므로 `runtimeOverrides`에도 반영되지 않고, `activeFilter`만 직접 오염시킵니다. 다음 번 `applyFilter()` 호출 시 `{...baseFilter, ...runtimeOverrides}`로 재계산되면서 여기서 넣은 `destinationKeywords` 등이 날아갈 수 있습니다.

### 버그 2. `socketHandlers.ts:95` — update-filter가 `persistToDB=false`로 호출 (설계 의도 검증 필요)

```typescript
applyFilter(userId, newFilter, io, false); // persistToDB = false
```

> [!WARNING]
> **질문:** 사장님이 `OrderFilterModal`에서 "즉시 동기화 적용" 버튼을 누르면, 프론트에서 `socket.emit("update-filter", newFilter)` → 서버의 이 핸들러가 받음 → **`persistToDB=false`로 처리**됩니다.
>
> 이 말은 **모달에서 변경한 값이 `runtimeOverrides`에만 들어가고, `baseFilter`와 DB에는 영구 저장되지 않는다는 뜻**입니다.
>
> 사장님이 원하시는 동작이 "모달에서 바꾼 설정은 DB에 영구 저장"이라면, 이 부분을 `persistToDB=true`로 바꿔야 합니다. 반대로 "모달 설정은 세션 단위로만 유효하다"가 의도라면 현재 그대로가 맞습니다.

---

## ⚠️ 설계 고민 (1건)

### `socketHandlers.ts:165` — 귀가콜의 `applyFilter` 호출에 `persistToDB` 미지정

```typescript
applyFilter(userId, {
    loadState: 'LOADING',
    isSharedMode: true,
    isActive: true,
    corridorRadiusKm: 10,
}, io);  // ← persistToDB 파라미터 생략됨
```

`applyFilter`의 기본값은 `persistToDB = true`입니다. 따라서 귀가콜을 생성하면 `loadState: 'LOADING'`, `isSharedMode: true`, `corridorRadiusKm: 10`이 **baseFilter에 병합되고 DB에 저장**됩니다.

그런데 `filterManager.ts`에서 DB 저장 시 `loadState`는 항상 `'EMPTY'`로 덮어쓰고, `isSharedMode`는 항상 `0`으로 덮어쓰므로 DB 오염은 없습니다. 하지만 `corridorRadiusKm: 10`은 **baseFilter에 병합되어 DB에도 저장**됩니다. 기사님의 원래 corridorRadius 설정이 다른 값이었다면 덮어써질 수 있습니다.

> [!TIP]
> 이 호출은 `persistToDB=false`가 의도에 맞을 가능성이 높습니다. 귀가콜은 일회성 세션 조작이니까요.

---

## 📋 요약

| 구분 | 파일 | 상태 |
|------|------|------|
| ✅ | `userSessionStore.ts` | 정상 |
| ✅ | `filterManager.ts` | 정상 |
| ✅ | `useFilterConfig.ts` | 정상 |
| ✅ | `OrderFilterModal.tsx` | 정상 |
| 🔴 | `dispatchEngine.ts:354-362` | **applyFilter 우회 + 페이로드 불일치** (치명) |
| 🔴 | `socketHandlers.ts:95` | **update-filter persistToDB=false** (설계 의도 확인 필요) |
| ⚠️ | `socketHandlers.ts:165` | 귀가콜 persistToDB 기본값 true (경미) |
