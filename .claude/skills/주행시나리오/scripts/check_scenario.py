#!/usr/bin/env python3
"""주행 문제지가 «의도한 상황»을 실제로 만드는지 검산한다.

🔴 왜 있는가 — 2026-08-29 에 문제지를 잘못 짜고 검사 11건을 통과시켰다.
   8/25 사고(«4km 앞 하차지를 두고 30km 밖 상차지로 갔다»)를 재현한다고 짰는데,
   «4km» 라고 적은 곤지암은 **상차지**였다. 상차지는 이미 다녀와 경로에서 빠지는 자리라
   그 상황이 아예 없었다. 검사는 통과했지만 **다른 것을 통과한 것**이다.

   → 거리를 손으로 믿지 않고 여기서 잰다.

쓰는 법:
    python3 check_scenario.py --json 시나리오.json
    python3 check_scenario.py --demo          # 지금 drive.mjs 문제지로 시연

시나리오 JSON:
{
  "현위치":   {"이름": "주행중", "x": 127.2960, "y": 37.3690},
  "정거장": [
    {"콜": "첫짐", "종류": "dropoff", "이름": "곤지암", "x": 127.3366, "y": 37.3648},
    {"콜": "합짐", "종류": "pickup",  "이름": "가남",   "x": 127.5768, "y": 37.2302},
    {"콜": "합짐", "종류": "dropoff", "이름": "세종대왕면", "x": 127.5853, "y": 37.2911}
  ],
  "요구": {"가까운정거장최대km": 5, "먼정거장최소km": 25, "순서차이최소km": 5}
}
"""
import argparse, json, math, sys

R = 6371.0


def km(a, b):
    rad = math.pi / 180
    dy, dx = (b["y"] - a["y"]) * rad, (b["x"] - a["x"]) * rad
    h = math.sin(dy / 2) ** 2 + math.cos(a["y"] * rad) * math.cos(b["y"] * rad) * math.sin(dx / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def path_km(start, stops):
    tot, here = 0.0, start
    for s in stops:
        tot += km(here, s)
        here = s
    return tot


def order_nearest(start, stops):
    """지금 규칙 — 한 통에 넣고 가까운 순. 제 짐을 싣기 전엔 못 내린다."""
    pool = list(stops)
    not_loaded = {s["콜"] for s in stops if s["종류"] == "pickup"}
    out, here = [], start
    while pool:
        best_i, best_d = -1, float("inf")
        for i, s in enumerate(pool):
            if s["종류"] == "dropoff" and s["콜"] in not_loaded:
                continue
            d = km(here, s)
            if d < best_d:
                best_d, best_i = d, i
        if best_i < 0:            # 갈 수 있는 곳이 없다 — 남은 것을 순서대로
            out.extend(pool)
            break
        best = pool.pop(best_i)
        not_loaded.discard(best["콜"]) if best["종류"] == "pickup" else None
        out.append(best)
        here = best
    return out


def order_pickups_first(start, stops):
    """옛 규칙 — 상차 전부 먼저, 각각 최근접."""
    def near(frm, pool):
        out, here, p = [], frm, list(pool)
        while p:
            i = min(range(len(p)), key=lambda j: km(here, p[j]))
            here = p.pop(i)
            out.append(here)
        return out
    ps = [s for s in stops if s["종류"] == "pickup"]
    ds = [s for s in stops if s["종류"] == "dropoff"]
    sp = near(start, ps)
    return sp + near(sp[-1] if sp else start, ds)


DEMO = {
    "현위치": {"이름": "주행중(곤지암 3.6km 앞)", "x": 127.2960, "y": 37.3690},
    "정거장": [
        {"콜": "첫짐", "종류": "dropoff", "이름": "곤지암", "x": 127.3366, "y": 37.3648},
        {"콜": "합짐", "종류": "pickup", "이름": "가남", "x": 127.5768, "y": 37.2302},
        {"콜": "합짐", "종류": "dropoff", "이름": "세종대왕면", "x": 127.5853, "y": 37.2911},
    ],
    "요구": {"가까운정거장최대km": 5, "먼정거장최소km": 25, "순서차이최소km": 5},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    if a.demo:
        sc = DEMO
    elif a.json:
        sc = json.load(open(a.json, encoding="utf-8"))
    else:
        ap.error("--json 또는 --demo 가 필요합니다")

    start, stops = sc["현위치"], sc["정거장"]
    req = sc.get("요구", {})
    fails = []

    print(f"\n🧭 문제지 검산 — 현위치: {start.get('이름','?')}\n")
    print("── 현위치에서 각 정거장까지 (직선)")
    dists = []
    for s in stops:
        d = km(start, s)
        dists.append((s, d))
        종류 = "상차" if s["종류"] == "pickup" else "하차"
        print(f"   {s['콜']:6} {종류}  {s['이름']:12} {d:6.1f} km")

    # ① 의도가 요구한 거리 관계
    print("\n── 의도가 성립하는가")
    drops = [(s, d) for s, d in dists if s["종류"] == "dropoff"]
    picks = [(s, d) for s, d in dists if s["종류"] == "pickup"]
    if req.get("가까운정거장최대km") and drops:
        s, d = min(drops, key=lambda t: t[1])
        ok = d <= req["가까운정거장최대km"]
        print(f"   {'✅' if ok else '🔴'} 가까운 «하차지» {s['이름']} {d:.1f}km "
              f"(요구 ≤ {req['가까운정거장최대km']}km)")
        if not ok:
            fails.append(f"가까운 하차지가 없다 — 가장 가까운 하차지가 {d:.1f}km")
    if req.get("먼정거장최소km") and picks:
        s, d = max(picks, key=lambda t: t[1])
        ok = d >= req["먼정거장최소km"]
        print(f"   {'✅' if ok else '🔴'} 먼 «상차지» {s['이름']} {d:.1f}km "
              f"(요구 ≥ {req['먼정거장최소km']}km)")
        if not ok:
            fails.append(f"먼 상차지가 없다 — 가장 먼 상차지가 {d:.1f}km")

    # ② 두 순서의 총거리
    A = order_nearest(start, stops)
    B = order_pickups_first(start, stops)
    ta, tb = path_km(start, A), path_km(start, B)
    fmt = lambda o: " → ".join(f"{s['이름']}{'상차' if s['종류']=='pickup' else '하차'}" for s in o)
    print("\n── 두 순서를 견준다")
    print(f"   길목부터 (지금)  {fmt(A)}")
    print(f"                    {ta:6.1f} km")
    print(f"   상차먼저 (옛것)  {fmt(B)}")
    print(f"                    {tb:6.1f} km")
    diff = tb - ta
    need = req.get("순서차이최소km", 5)
    ok = abs(diff) >= need
    print(f"\n   {'✅' if ok else '🔴'} 차이 {abs(diff):.1f} km (요구 ≥ {need}km) — "
          f"{'길목부터가 짧다' if diff > 0 else '상차먼저가 짧다' if diff < 0 else '같다'}")
    if not ok:
        fails.append(f"두 순서의 차이가 {abs(diff):.1f}km 뿐 — 규칙이 바뀌어도 눈에 안 보인다")
    if diff < 0:
        fails.append("옛 규칙이 더 짧다 — 이 문제지로는 «길목부터가 낫다»를 보여줄 수 없다")

    # ③ 되돌아오는 구간
    print("\n── 되돌아오는 구간이 있는가 (있으면 사람이 결과를 못 읽는다)")
    back = []
    here = start
    for s in A:
        if here is not start and km(start, s) < km(start, here) - 1:
            back.append(f"{here['이름']} → {s['이름']}")
        here = s
    if back:
        print(f"   ⚠️ 되돌아옴: {', '.join(back)}")
        print("      순서 문제와 «콜 자체의 성질» 이 섞여 화면으로 판단하기 어렵다")
    else:
        print("   ✅ 한 방향 — 결과가 눈에 바로 보인다")

    print("\n" + "─" * 52)
    if fails:
        print(f"🔴 문제지를 다시 짜야 한다 ({len(fails)}건)")
        for f in fails:
            print(f"   · {f}")
        print()
        sys.exit(1)
    print("✅ 이 문제지는 의도한 상황을 만든다 — drive 로 넘겨도 된다\n")


if __name__ == "__main__":
    main()
