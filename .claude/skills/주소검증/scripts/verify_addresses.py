#!/usr/bin/env python3
"""주소가 카카오에서 실제로 쓸 수 있는지 검사한다.

검사 셋 — ① 좌표가 나오나 ② 그 좌표로 길찾기가 서나 ③ 폴백이 지어낸 좌표는 아닌가
호출·캐시·폴백 규칙은 `.claude/skills/_shared/kakao.py` 한 곳에 있다.
자세한 배경은 같은 폴더의 SKILL.md 를 볼 것.
"""
import argparse, json, os, re, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "_shared"))
import kakao  # noqa: E402

# 번지로 찾은 곳과 폴백으로 찾은 곳이 이 거리(km)보다 벌어지면 «다른 곳»으로 본다.
GAP_KM = 2.0


def collect(args) -> list:
    out = []
    if args.addr:
        out += list(args.addr)
    if args.json:
        for it in json.load(open(args.json, encoding="utf-8")):
            a = (it.get("addressDetail") or "").strip()
            if a:
                out.append(a)
    if args.ts:
        src = open(args.ts, encoding="utf-8").read()
        out += re.findall(r"(?:pickup|dropoff|addressDetail)\s*:\s*'([^']+)'", src)
    seen, uniq = set(), []
    for a in out:
        if a not in seen:
            seen.add(a)
            uniq.append(a)
    return uniq[: args.limit] if args.limit else uniq


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--json", help="mockLocationData.json 경로")
    p.add_argument("--ts", help="presets.ts 경로")
    p.add_argument("--addr", nargs="*", help="주소 직접 입력")
    p.add_argument("--origin", default=kakao.DEFAULT_ORIGIN, help="기준 출발지 x,y")
    p.add_argument("--limit", type=int, help="앞에서 N개만")
    p.add_argument("--no-cache", action="store_true", help="캐시를 무시하고 다시 묻는다")
    p.add_argument("--verbose", action="store_true", help="폴백별 결과를 다 보여준다")
    args = p.parse_args()

    targets = collect(args)
    if not targets:
        sys.exit("검사할 주소가 없습니다. --json / --ts / --addr 중 하나를 주세요.")

    kakao.init_cache(use_cache=not args.no_cache)
    none_, no_road, guessed, ok = [], [], [], []

    print(f"주소 {len(targets)}개 검사 · 기준 출발지 {args.origin}")
    print("(서버와 같은 폴백 6개를 씁니다)\n")

    try:
        for i, addr in enumerate(targets, 1):
            expected = kakao.expected_region_of(addr)
            hits = []
            for order, kind, text in kakao.build_fallbacks(addr):
                r = kakao.search(kind, text, expected)
                if r:
                    hits.append((order, kind, text, r))

            if args.verbose:
                print(f"  ── {addr}")
                for order, kind, text, r in hits:
                    print(f"       시도{order} [{kind:7s}] '{text}' → {r['name']}  {r['x']:.6f},{r['y']:.6f}")

            if not hits:
                none_.append(addr)
                print(f"  [{i:3d}/{len(targets)}] ❌ 좌표없음   {addr}")
                continue

            best = min(hits, key=lambda h: h[0])      # 서버는 순번이 낮은 것을 채택한다
            bx, by, bname = best[3]["x"], best[3]["y"], best[3]["name"]

            code, msg = kakao.route(bx, by, args.origin)
            if code != 0:
                no_road.append((addr, bx, by, code, msg))
                print(f"  [{i:3d}/{len(targets)}] ❌ 도로없음   {addr}\n{'':16}코드 {code}: {msg}")
                continue

            # 시도1(번지 주소검색)이 없으면 좌표는 «폴백이 찾아준 것»이다
            anchor = next((h for h in hits if h[0] == 1), None)
            if anchor is None:
                guessed.append((addr, best[0], best[2], bname, bx, by))
                print(f"  [{i:3d}/{len(targets)}] ⚠️ 폴백추정   {addr}\n"
                      f"{'':16}시도{best[0]} '{best[2]}' → {bname}")
            else:
                gap = kakao.km_between((anchor[3]["x"], anchor[3]["y"]), (bx, by))
                if gap > GAP_KM:
                    guessed.append((addr, best[0], best[2], bname, bx, by))
                    print(f"  [{i:3d}/{len(targets)}] ⚠️ 좌표어긋남 {addr}  ({gap:.1f}km)")
                else:
                    ok.append((addr, bx, by))
    finally:
        kakao.save_cache()

    s = kakao.stats()
    print("\n" + "=" * 64)
    print(f"정상 {len(ok)} · 폴백추정 {len(guessed)} · 좌표없음 {len(none_)} · 도로없음 {len(no_road)}")
    print(f"카카오 호출 {s['miss']}회 · 캐시로 아낀 것 {s['hit']}회 · 캐시 {s['size']}건")
    print("=" * 64)

    if none_:
        print("\n── ❌ 어떤 폴백으로도 좌표를 못 얻음 (주소 사전에서 뺀다) ──")
        for a in none_:
            print(f"  {a}")
    if no_road:
        print("\n── ❌ 좌표는 되는데 길찾기가 안 됨 (도로변 주소로 바꾼다) ──")
        for a, x, y, c, m in no_road:
            print(f"  {a}\n      {x:.6f},{y:.6f}  코드 {c}: {m}")
    if guessed:
        print("\n── ⚠️ 번지로는 못 찾고 «폴백이 찾아준» 좌표 (진짜 그 자리인지 확인) ──")
        for a, order, text, name, x, y in guessed:
            print(f"  {a}\n      시도{order} '{text}' → {name}  {x:.6f},{y:.6f}")
    if ok and (args.addr or (args.limit and args.limit <= 20)):
        print("\n── ✅ 정상 (presets.ts 에 넣을 좌표) ──")
        for a, x, y in ok:
            print(f"  {a}\n      lon: {x}, lat: {y}")


if __name__ == "__main__":
    main()
