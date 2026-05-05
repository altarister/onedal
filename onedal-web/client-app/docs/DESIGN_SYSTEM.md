# 🎨 1DAL 관제웹 — Design System Guide

> **문서 상태**: v1  
> **작성일**: 2026-05-05  
> **목적**: 현재 디자인 문제를 진단하고, 개선 가이드라인과 RN 전환 대비 조치를 정의합니다.

---

## 1. 현재 문제 진단

### 🔴 심각 (즉시 개선)

#### 1-1. 색상 하드코딩 난발
`index.css`에 시맨틱 색상 변수(`--theme-success`, `--theme-warning`)를 정의해놨지만, 실제 코드에서는 Tailwind 직접색을 사용합니다.

```tsx
// ❌ 현재: PinnedRouteCard.tsx에만 30개+ 하드코딩
className="bg-emerald-500/20 text-emerald-500"
className="bg-amber-500/20 text-amber-500"
className="bg-rose-500/10 text-rose-500"

// ✅ 목표: 시맨틱 토큰 사용
className="bg-success/20 text-success"
className="bg-warning/20 text-warning"
className="bg-danger/10 text-danger"
```

**영향**: 테마 변경 시 모든 파일을 수동으로 수정해야 함. RN 전환 시 색상 매핑 작업이 방대해짐.

#### 1-2. 이중 테마 시스템
CSS 변수(oklch)와 Canvas용 `themes.ts`(rgb)가 **별개의 값**으로 관리됩니다.

```
index.css:  --theme-success: #059669 (hex)
themes.ts:  nodePickup: 'rgb(16, 185, 129)' (rgb)
```

두 시스템이 "같은 의도의 색상"이지만 다른 값을 가질 수 있어 불일치 위험이 있습니다.

### 🟡 중간 (UI 개편 시 개선)

#### 1-3. 정보 밀도 과잉
카드 1개(`PinnedRouteCard`)에 표시되는 정보:
- 시간, 상차지, 하차지, ETA, 분 차이, 금액, 거리, 차종, 상태 뱃지, 텔레메트리 바

→ 10px 폰트가 남용되며 가독성이 떨어집니다.

#### 1-4. 시맨틱 색상 미사용
`index.css`에 정의된 커스텀 변수들 중 실제 활용률:

| 변수 | 정의됨 | 실제 사용 |
|------|--------|-----------|
| `--theme-success` | ✅ | ❌ (bg-emerald-500 직접 사용) |
| `--theme-warning` | ✅ | ❌ (bg-amber-500 직접 사용) |
| `--theme-danger` | ✅ | ❌ (bg-rose-500 직접 사용) |
| `--theme-info` | ✅ | ❌ (bg-blue-500 직접 사용) |

#### 1-5. 폰트 크기 비표준
현재 사용 중인 임의 크기: `text-[10px]`, `text-[11px]`, `text-[13px]`

---

## 2. 색상 토큰 사전

### 사용해야 할 시맨틱 색상

| 토큰 | 용도 | Tailwind 클래스 | CSS 변수 |
|------|------|----------------|----------|
| `success` | 확정, 상차, 긍정 상태 | `text-success`, `bg-success/10` | `--theme-success` |
| `warning` | 평가중, 주의 상태 | `text-warning`, `bg-warning/10` | `--theme-warning` |
| `danger` | 거절, 취소, 비상 | `text-danger`, `bg-danger/10` | `--theme-danger` |
| `info` | 정보, 경로, 시뮬레이션 | `text-info`, `bg-info/10` | `--theme-info` |
| `muted` | 비활성, 보조 텍스트 | `text-muted-foreground` | `--muted-foreground` |

### 상태별 색상 매핑 규칙

| 오더 상태 | 색상 토큰 |
|----------|-----------|
| `ORDER_PRE_SECURED`, `ORDER_SECURED_EVALUATING`, `ORDER_AWAITING_DECISION` | `warning` |
| `ORDER_CONFIRMED` | `success` |
| `ORDER_COMPLETED` | `muted` |
| `ORDER_RELEASED` | `info` (주황 계열 유지) |
| `ORDER_CANCELED`, `ORDER_FORCE_CANCELED` | `danger` |

---

## 3. 타이포그래피 스케일 (가이드라인)

| 이름 | 크기 | 용도 |
|------|------|------|
| `xs` | `text-xs` (12px) | 보조 정보, 뱃지, 타임스탬프 |
| `sm` | `text-sm` (14px) | 카드 본문, 리스트 항목 |
| `base` | `text-base` (16px) | 일반 텍스트 |
| `lg` | `text-lg` (18px) | 섹션 제목, 금액 표시 |

> **규칙**: `text-[10px]`, `text-[11px]` 같은 임의 크기는 새 코드에서 사용하지 않습니다.
> 기존 코드는 UI 개편 시 일괄 전환합니다.

---

## 4. 지금 하는 조치

1. **시맨틱 색상 1차 전환**: 가장 빈번한 패턴(`bg-emerald-500`, `text-amber-500`, `bg-rose-500`)을 시맨틱 토큰으로 교체
2. **이 문서를 코드 리뷰 기준으로 활용**: 새 코드 작성 시 하드코딩 색상 금지

## 5. 나중에 UI 개편 시 쉽게 하기 위한 조치

1. **디자인 토큰 파일 분리**: `tokens.css`에 색상·타이포·간격을 집중시켜 한 파일 수정으로 전체 테마 교체
2. **themes.ts 통합**: Canvas 색상도 CSS 변수에서 파생하도록 통합
3. **정보 계층 재설계**: 카드를 "요약 1줄" / "상세 펼침" 2단계로 명확히 분리
4. **RN 전환 시**: Tailwind → StyleSheet 변환 도구 활용, 시맨틱 토큰이 정리되어 있으면 1:1 매핑이 쉬움
