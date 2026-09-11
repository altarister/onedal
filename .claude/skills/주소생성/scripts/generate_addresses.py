#!/usr/bin/env python3
"""시뮬 문제지에 쓸 «실제로 통하는» 화물 배송지를 카카오에서 긁어 만든다.

🔴 주소를 지어내지 않는다. 카카오 장소검색이 돌려준 곳을 **그대로** 쓴다.
   (2026-08-23: 손으로 지어 붙인 «CJ대한통운 파주터미널» 이 폴백에서
    «터미날약국» 으로 풀렸다. 자세한 배경은 SKILL.md)

호출·캐시는 `.claude/skills/_shared/kakao.py` 한 곳에 있다.
"""
import argparse, json, os, random, re, sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "_shared"))
import kakao  # noqa: E402

# 기사님 실제 동선 (필드테스트.md §3-6)
COURSES = {
    "광주이천여주": [
        "경기 광주시 초월읍", "경기 광주시 곤지암읍", "경기 광주시 경안동",
        "경기 광주시 태전동", "경기 광주시 송정동", "경기 광주시 오포읍",
        "경기 이천시 마장면", "경기 이천시 부발읍", "경기 이천시 신둔면",
        "경기 이천시 대월면", "경기 이천시 호법면", "경기 이천시 중리동",
        "경기 여주시 가남읍", "경기 여주시 점동면", "경기 여주시 능서면",
        "경기 여주시 여흥동", "경기 여주시 오학동",
    ],
}

# 화물이 실제로 드나드는 곳. 관광지·산·마을은 넣지 않는다 (2026-08-23 교훈).
DEFAULT_KINDS = ["물류센터", "공장", "우체국", "농협", "하나로마트",
                 "산업단지", "택배", "창고", "자재", "마트"]

DEPARTMENTS = ["하역장", "정문 접수처", "후문 상차장", "창고동", "자재창고",
               "출하장", "물류동 1층", "지하 하역장", "야적장", "검수대"]
SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"]
TITLES = ["과장", "대리", "사원", "부장", "팀장", "주임", "실장", "차장"]


# 🗺️ 지도가 아는 동 이름 — `region` 의 **정답지**다 (lazy, 한 번만 읽는다)
_MAP_DONG: set | None = None


def map_dong_names() -> set:
    """`merged_map.geojson` 의 읍면동 이름 집합.

    🔴 **이 지도가 곧 도착지 키워드의 원천이다.** 서버는 도착 목표(«성남시»)를
       이 지도의 동 이름 목록으로 풀어 앱에 내려보낸다. 그러므로 `region` 이
       지도에 **없는 이름**이면 경로 위에 있어도 «경로 밖»으로 떨어진다.

    47MB 를 통째로 파싱하지 않고 이름만 훑는다 — 필요한 것은 집합 하나뿐이다.
    지도가 없으면 빈 집합이고, 그때는 카카오 답을 그대로 믿는다 (검사를 건너뛸 뿐
    지어내지는 않는다).
    """
    global _MAP_DONG
    if _MAP_DONG is not None:
        return _MAP_DONG
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
    path = os.path.join(root, "onedal-web", "server", "mapData", "merged_map.geojson")
    try:
        with open(path, encoding="utf-8") as f:
            _MAP_DONG = set(re.findall(r'"EMD_KOR_NM":"([^"]+)"', f.read()))
    except OSError:
        print("  ⚠️ 지도를 못 읽었습니다 — region 을 지도와 대조하지 않습니다")
        _MAP_DONG = set()
    return _MAP_DONG


def region_of(road_address: str, x=None, y=None) -> str:
    """그 자리의 **법정동 이름**. «경기 성남시 분당구 판교로 255» → «판교동».

    🔴 **`region` 이 곧 화면에 그려지는 글자다** (`SimDispatchBoard` 가 이걸 먼저 쓴다).
       앱은 화면을 읽어 도착지 키워드(동 단위)와 맞추므로, 여기에 «분당구» 같은
       **구 이름**이 들어가면 도착 목표를 맞춰도 **전부 떨어진다.**

    ⚠️ 2026-09-12 실사고: 이 함수가 도로명에서 «구»로 끝나는 조각도 동으로 채택했다.
       그래서 성남 60개가 전부 «분당구·중원구·수정구» 로 나왔고 — 좌표를 물어보는
       코드가 **아래에 있었는데도 거기까지 가지 못했다.** 시뮬 주소 사전에서 같은 병을
       73개(43%) 고친 날, 생성기가 그 병을 새로 찍어 내고 있었다.
       (2026-08-25 에도 같은 자리에서 «광주시»로 12개가 채워진 적이 있다.)

    → 그래서 **좌표를 먼저 묻는다.** 도로명 파싱은 마지막 수단이고, «구»는 안 받는다.
    """
    # ① 좌표 → 법정동. 가장 믿을 만하다 (도로명에는 동이 없는 경우가 많다)
    dong = ""
    if x is not None and y is not None:
        u = f"https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x={x}&y={y}"
        try:
            for t in kakao._get(u).get("documents", []):
                if t.get("region_type") == "B":          # 법정동
                    n = (t.get("region_3depth_name") or "").strip()
                    if n:
                        dong = n.split()[0]
                        break
        except Exception:
            pass

    # ② 지도와 대조. «태평로1가» 처럼 지도가 병합한 이름은 꼬리를 떼고 다시 본다
    names = map_dong_names()
    if dong and names and dong not in names:
        merged = re.sub(r"\d+가$", "", dong)
        if merged in names:
            dong = merged
    if dong:
        return dong

    # ③ 마지막 수단 — 도로명에서 읍·면·동만 줍는다. 🔴 «구» 는 동이 아니다
    for p in road_address.split(" ")[1:]:
        if p.endswith(("읍", "면", "동")):
            return p
    return ""


def fake_phone(rng) -> str:
    return f"010-{rng.randint(2000, 9999)}-{rng.randint(1000, 9999)}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--course", choices=list(COURSES), help="미리 정해 둔 코스")
    p.add_argument("--regions", nargs="*", help="지역을 직접 지정")
    p.add_argument("--kinds", nargs="*", help="업종을 직접 지정")
    p.add_argument("--count", type=int, default=50, help="만들 개수")
    p.add_argument("--origin", default=kakao.DEFAULT_ORIGIN)
    p.add_argument("--out", help="JSON 으로 저장할 경로")
    p.add_argument("--seed", type=int, default=823, help="이름·전화 생성 시드 (재현용)")
    p.add_argument("--no-cache", action="store_true")
    args = p.parse_args()

    regions = args.regions or (COURSES.get(args.course) if args.course else None)
    # 🔴 빈 지역을 그냥 두면 «전국»을 긁는다 — 빈 필터는 «제한 없음»이 아니라 고장이다 (규칙 ④).
    #    2026-09-12 실측: 셸에서 배열이 안 풀려 `--regions ""` 로 불렸는데 죽지 않고
    #    제주·부산까지 섞인 60개를 만들어 냈다. 조용히 돌아간 것이 사고였다.
    regions = [r.strip() for r in (regions or []) if r and r.strip()]
    if not regions:
        sys.exit("--course 또는 --regions 를 주세요. (빈 지역은 받지 않습니다)")
    kinds = args.kinds or DEFAULT_KINDS

    kakao.init_cache(use_cache=not args.no_cache)
    rng = random.Random(args.seed)

    print(f"지역 {len(regions)} × 업종 {len(kinds)} 로 후보를 모읍니다 (목표 {args.count}개)")
    print("지역마다 골고루 뽑습니다 — 코스 시험은 한쪽에 몰리면 뜻이 없습니다\n")

    picked, dropped = [], []
    try:
        # 🔴 지역별로 따로 담는다. 한 통에 모으면 앞쪽 지역이 다 차지한다
        #    (2026-08-24: 광주에서만 45개가 뽑히고 이천·여주가 0개였다)
        seen_names, seen_addr = set(), set()
        by_region = {r: [] for r in regions}
        for region in regions:
            # 검색한 시/군과 결과가 맞는지 볼 열쇠 — «경기 이천시 부발읍» → «이천시»
            city = next((w for w in region.split(" ") if w.endswith(("시", "군"))), None)
            for kind in kinds:
                for d in kakao.search_all("keyword", f"{region} {kind}"):
                    road = (d.get("road_address_name") or "").strip()
                    name = (d.get("place_name") or "").strip()
                    # ③ 도로명주소가 있는 곳만 — 지번만 있는 곳은 도로에서 먼 경우가 많다
                    if not road or not name:
                        continue
                    # 카카오는 근처 다른 시/군까지 준다. 검색한 시/군이 아니면 버린다
                    if city and city not in road:
                        continue
                    if name in seen_names or road in seen_addr:
                        continue
                    seen_names.add(name)
                    seen_addr.add(road)
                    by_region[region].append({
                        "name": name, "road": road,
                        "x": float(d["x"]), "y": float(d["y"]),
                    })
            print(f"  {region:<22} 후보 {len(by_region[region]):3d}개")

        # 라운드로빈 — 지역을 돌아가며 하나씩 집는다
        candidates, idx = [], 0
        while any(idx < len(v) for v in by_region.values()):
            for r in regions:
                if idx < len(by_region[r]):
                    candidates.append(by_region[r][idx])
            idx += 1

        print(f"\n후보 {len(candidates)}개 · 길찾기 검사를 시작합니다\n")

        for c in candidates:
            if len(picked) >= args.count:
                break
            code, msg = kakao.route(c["x"], c["y"], args.origin)
            if code != 0:
                dropped.append(c)
                print(f"  ❌ 길찾기 실패  {c['name']}  ({c['road']})  코드 {code}")
                continue
            picked.append({
                "customerName": c["name"],
                "department": rng.choice(DEPARTMENTS),
                "contactName": rng.choice(SURNAMES) + rng.choice(TITLES),
                "mileage": 0,
                # ⚠️ 카카오가 준 실제 업체 번호는 넣지 않는다.
                #    시뮬 화면에 뜬 번호로 실수로 전화가 걸리면 남의 영업장에 닿는다.
                "phone1": fake_phone(rng),
                "phone2": fake_phone(rng),
                "region": region_of(c["road"], c["x"], c["y"]),
                "addressDetail": f"{c['road']} {c['name']}",
                "lon": c["x"],
                "lat": c["y"],
            })
            print(f"  ✅ [{len(picked):2d}/{args.count}] {c['road']} {c['name']}")
    finally:
        kakao.save_cache()

    s = kakao.stats()
    print("\n" + "=" * 64)
    print(f"채택 {len(picked)} · 길찾기 탈락 {len(dropped)}")
    print(f"카카오 호출 {s['miss']}회 · 캐시로 아낀 것 {s['hit']}회 · 캐시 {s['size']}건")
    print("=" * 64)

    # 지역이 한쪽에 몰리지 않았는지 — 코스 시험은 골고루 흩어져야 뜻이 있다
    dist = Counter(x["region"] for x in picked)
    print("\n지역 분포:", " · ".join(f"{k} {v}" for k, v in dist.most_common()))

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(picked, f, ensure_ascii=False, indent=2)
        print(f"\n저장: {args.out}")
        print("→ 이제 주소검증 스킬로 따로 확인하세요:")
        print(f"   python3 .claude/skills/주소검증/scripts/verify_addresses.py --json {args.out}")
    else:
        print("\n" + json.dumps(picked, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
