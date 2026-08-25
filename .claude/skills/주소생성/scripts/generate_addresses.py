#!/usr/bin/env python3
"""시뮬 문제지에 쓸 «실제로 통하는» 화물 배송지를 카카오에서 긁어 만든다.

🔴 주소를 지어내지 않는다. 카카오 장소검색이 돌려준 곳을 **그대로** 쓴다.
   (2026-08-23: 손으로 지어 붙인 «CJ대한통운 파주터미널» 이 폴백에서
    «터미날약국» 으로 풀렸다. 자세한 배경은 SKILL.md)

호출·캐시는 `.claude/skills/_shared/kakao.py` 한 곳에 있다.
"""
import argparse, json, os, random, sys
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


def region_of(road_address: str, x=None, y=None) -> str:
    """«경기 이천시 부발읍 경충대로 2091» → «부발읍». 기존 데이터의 region 칸과 같은 꼴.

    🔴 **`region` 이 곧 화면에 그려지는 글자다** (`SimDispatchBoard` 가 이걸 먼저 쓴다).
       앱은 화면을 읽어 경유 목록(동 단위)과 맞추므로, 여기에 «광주시» 같은 시 이름이
       들어가면 **경로 위에 있어도 «경로 밖»으로 떨어진다.**

    ⚠️ 2026-08-25 실측: 도로명주소에 읍·면·동이 없는 곳(«경기 광주시 고불로 264»)이
       12개 있었고, 전부 시 이름으로 채워져 있었다. 코카콜라 태전물류는 경로에서
       0.43km 인데 «광주시» 로 그려져 경유 목록의 «태전동» 과 못 맞았다.

    → 주소에서 못 찾으면 **좌표로 법정동을 물어본다.** 시 이름으로 때우지 않는다.
    """
    parts = road_address.split(" ")
    for p in parts[1:]:
        if p.endswith(("읍", "면", "동", "구")):
            return p
    if x is not None and y is not None:
        u = f"https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x={x}&y={y}"
        try:
            docs = kakao._get(u).get("documents", [])
            for t in docs:
                if t.get("region_type") == "B":          # 법정동
                    n = (t.get("region_3depth_name") or "").strip()
                    if n:
                        return n.split()[0]
        except Exception:
            pass
    return parts[1] if len(parts) > 1 else ""


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
    if not regions:
        sys.exit("--course 또는 --regions 를 주세요.")
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
