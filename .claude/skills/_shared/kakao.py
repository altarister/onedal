#!/usr/bin/env python3
"""카카오 API 호출 + 캐시 — 주소검증·주소생성 스킬이 **함께** 쓴다.

🔴 두 스킬이 각자 캐시를 들면 같은 주소를 두 번 묻는다. 캐시는 한 곳이다.
   (규칙 ③ *"파생값을 만들었으면 그 입력도 한 곳에서 만든다"*)

🔴 폴백 만드는 규칙(`build_fallbacks`)은 **서버 `geocodeAddress` 와 같아야 한다.**
   다르면 검사가 거짓말한다. 원천은
   `onedal-web/server/src/services/kakaoService.ts`.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ENV_PATH = "onedal-web/server/.env"
CACHE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_cache", "kakao.json")

# 기사님 생활권(초월). 2026-08-23 주행 로그의 실제 출발 좌표다.
DEFAULT_ORIGIN = "127.2945543,37.3766579"

# 서버 kakaoService.ts 의 REGION_MAP 과 같은 일 — 시/도가 다르면 버린다
REGION_MAP = {
    "경기": "경기", "서울": "서울", "인천": "인천", "부산": "부산", "대구": "대구",
    "광주": "광주", "대전": "대전", "울산": "울산", "세종": "세종", "강원": "강원",
    "충북": "충북", "충남": "충남", "전북": "전북", "전남": "전남",
    "경북": "경북", "경남": "경남", "제주": "제주",
}

_cache = None
_stats = {"hit": 0, "miss": 0}
_use_cache = True
_dirty = False


# ── 키 ──────────────────────────────────────────────────────────────────

def load_key() -> str:
    """키를 화면에 찍지 않는다."""
    key = os.environ.get("KAKAO_REST_API_KEY")
    if key:
        return key.strip()
    for base in (".", "..", "../..", "../../.."):
        p = os.path.join(base, ENV_PATH)
        if os.path.exists(p):
            for line in open(p, encoding="utf-8"):
                if line.startswith("KAKAO_REST_API_KEY"):
                    return line.split("=", 1)[1].strip().strip("'\"")
    sys.exit(f"KAKAO_REST_API_KEY 를 찾지 못했습니다 ({ENV_PATH} 또는 환경변수)")


def headers() -> dict:
    return {"Authorization": f"KakaoAK {load_key()}"}


# ── 캐시 ────────────────────────────────────────────────────────────────

def init_cache(use_cache: bool = True):
    global _cache, _use_cache
    _use_cache = use_cache
    if _cache is None:
        try:
            _cache = json.load(open(CACHE_PATH, encoding="utf-8"))
        except Exception:
            _cache = {}
    return _cache


def save_cache():
    """호출이 있었을 때만 쓴다."""
    if not _dirty:
        return
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    tmp = CACHE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(_cache, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, CACHE_PATH)


def stats() -> dict:
    return dict(_stats, size=len(_cache or {}))


def _cached(key: str, fetch):
    """`결과 없음`(None) 도 저장한다 — 안 그러면 실패한 주소를 매번 다시 묻는다."""
    global _dirty
    init_cache(_use_cache)
    if _use_cache and key in _cache:
        _stats["hit"] += 1
        return _cache[key]
    _stats["miss"] += 1
    val = fetch()
    _cache[key] = val
    _dirty = True
    return val


# ── 호출 ────────────────────────────────────────────────────────────────

def _get(url: str):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers()), timeout=12))


def search(kind: str, text: str, expected_region=None, size: int = 15):
    """장소·주소 검색. 서버와 같이 시/도가 어긋나는 결과는 버린다.

    반환: {"x","y","name","road"} 또는 None
    """
    raw = _cached(f"search|{kind}|{text}|{size}", lambda: _fetch_search(kind, text, size))
    if not raw:
        return None
    for d in raw:
        if expected_region:
            addr = (d.get("address_name") or "").split(" ")[0]
            road = (d.get("road_address_name") or "").split(" ")[0]
            if expected_region not in (addr, road):
                continue                      # 서버의 «지역 불일치 방어»
        return {
            "x": float(d["x"]), "y": float(d["y"]),
            "name": d.get("place_name") or d.get("address_name") or "",
            "road": d.get("road_address_name") or "",
            "category": d.get("category_name", ""),
        }
    return None


def search_all(kind: str, text: str, size: int = 15) -> list:
    """걸러내지 않은 원본 목록 (주소 생성에서 쓴다)."""
    return _cached(f"search|{kind}|{text}|{size}", lambda: _fetch_search(kind, text, size)) or []


def _fetch_search(kind: str, text: str, size: int):
    url = (f"https://dapi.kakao.com/v2/local/search/{kind}.json"
           f"?query={urllib.parse.quote(text)}&size={size}")
    try:
        docs = _get(url).get("documents", [])
    except Exception:
        return None
    # 캐시를 가볍게 — 쓰는 칸만 남긴다
    return [{k: d.get(k) for k in
             ("x", "y", "place_name", "address_name", "road_address_name", "category_name", "phone")}
            for d in docs]


def route(x, y, origin: str = DEFAULT_ORIGIN):
    """길찾기. 반환: (result_code, result_msg). 0 이면 정상."""
    r = _cached(f"route|{origin}|{x:.6f},{y:.6f}", lambda: _fetch_route(x, y, origin))
    return (r[0], r[1]) if r else (-99, "호출 실패")


def _fetch_route(x, y, origin):
    url = (f"https://apis-navi.kakaomobility.com/v1/directions"
           f"?origin={origin}&destination={x},{y}&priority=RECOMMEND&car_type=1")
    try:
        r = _get(url)["routes"][0]
        return [r.get("result_code"), r.get("result_msg", "")]
    except Exception as e:
        return [-99, str(e)]


# ── 서버와 같은 폴백 ────────────────────────────────────────────────────

def build_fallbacks(query: str):
    """서버 `geocodeAddress` 와 같은 순서로 폴백 쿼리를 만든다.

    반환: [(순번, 'address'|'keyword', 쿼리문자열), …]
    순번 1 = 번지까지 자른 주소검색 — 가장 믿을 만해서 기준으로 삼는다.
    """
    clean = re.sub(r"\(.*?\)", " ", query)
    clean = re.sub(r"\s+", " ", clean).strip()
    words = clean.split(" ")

    last_num = -1
    for i in range(len(words) - 1, -1, -1):
        if re.search(r"\d+", words[i]):
            last_num = i
            break

    out = []
    if last_num != -1:                                        # [시도 1]
        out.append((1, "address", " ".join(words[: last_num + 1])))
    out.append((2, "keyword", clean))                         # [시도 2]
    out.append((3, "address", clean))                         # [시도 3]
    m = re.search(r"\(([^)]+)\)", query)                      # [시도 4]
    if m:
        out.append((4, "address", m.group(1).strip()))
    if len(words) > 2:                                        # [시도 5]
        out.append((5, "keyword", " ".join(words[-2:])))
    if len(words) > 3:                                        # [시도 6]
        out.append((6, "keyword", f"{' '.join(words[:3])} {words[-1]}"))
    return out


def expected_region_of(addr: str):
    return REGION_MAP.get(addr.split(" ")[0])


def km_between(a, b) -> float:
    """대략적인 거리. «딴 데인가»만 가리면 되므로 평면 근사로 충분하다."""
    return (((a[0] - b[0]) * 88.0) ** 2 + ((a[1] - b[1]) * 111.0) ** 2) ** 0.5
