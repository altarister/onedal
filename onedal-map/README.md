# onedal-map — 지도 공장

**콜 필터의 그물(`destinationKeywords`)을 만드는 읍면동 폴리곤을 생산한다.**

## 🔴 이 폴더가 생긴 이유

우리 서버가 읽는 `onedal-web/server/mapData/merged_map.geojson` 은
**지도 퀴즈 게임에서 만들어 복사해 온 것**이다.

## 사슬

```
generate_bjd_data.py     VWorld API   → out/merged_map.geojson   (intel 없음)
merge_intel_to_geo.js    scripts/data/intel/ → 거기에 intel 박기
build_vworld_levels.cjs  out/merged_map → vworld_sig · sig_merged · provinces  [게임용]
fetch_roads.js           OSM Overpass → korea-roads-topo.json                  [게임용]
```

🔴 **`generate_bjd_data.py` 는 기존 파일을 읽지 않고 덮어쓴다.**
`intel` 이 통째로 날아가므로 **반드시 `merge_intel_to_geo.js` 를 이어서 돌린다.**

🔴 **`fetch_roads.js` 는 다시 돌릴 필요가 없다** — 이미 전국이다
(bbox `124.6~130.9E · 33.2~38.6N`). 도로는 지역 확장과 무관하다.

## 지역 코드

```
지금   11 서울 · 28 인천 · 41 경기          (읍면동 1,239개 · 27MB)
추가   30 대전 · 36 세종 · 43 충북 · 44 충남

python scripts/generate_bjd_data.py --regions 11 28 41 30 36 43 44
```

⚠️ `REGION_NAMES` 에 네 줄을 추가해야 한다 — 없으면 이름이 «미분류»로 떨어진다.
⚠️ 리(里)는 `if region_code == '41'` 로 **경기에서만** 받는다. 콜창은 읍면동까지만
   보여주므로(기사님 확인 2026-09-06) 그대로 둔다.

## 다른 지도 파일과 헷갈리지 않는다

| 파일 | 누가 읽나 | 이 공장이 만드나 |
|---|---|---|
| `server/mapData/merged_map.geojson` | 서버 — `geoService` · `geoResolver` | ✅ **이것 하나가 목표다** |
| `client-app/src/mapData/sidoData.json` | 관제앱 지도 배경 | ❌ 다른 출처(2013) · **이미 전국** |
| `server/mapData/korea-roads-topo.json` | **아무도 안 읽는다** (게임만 씀) | ❌ 딸려온 사본 |

## 안 건드리는 것

- 게임 — 산출물을 주지 않는다 (별도 판)
- 배포 — `onedal-map/**` 은 트리거가 아니다 (`.github/workflows/deploy.yml`)
