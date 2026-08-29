#!/usr/bin/env python3
"""한 판을 돌린 뒤 «제대로 돌았나»를 로그와 장부로 검수한다.

🔴 왜 있는가 — 2026-08-29 에 이 검산을 매번 손으로 했다. 서버 로그를 grep 하고,
   궤적 좌표를 이어 재고, 앞 판이 섞인 것을 눈으로 걸렀다. 그러다 한 번은
   **앞 판이 섞인 178km** 를 이번 판 거리로 읽을 뻔했다.

   → 손으로 하던 것을 도구로 만든다. 시각으로 자르는 것도 여기서 한다.

쓰는 법:
    python3 audit_run.py --since 12:30              # 오늘 12:30 이후
    python3 audit_run.py --since 12:30 --db data.db # 라이브 장부로
"""
import argparse, json, math, os, re, subprocess, sys
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
SERVER = os.path.join(ROOT, "onedal-web", "server")
R = 6371.0


def km(a, b):
    rad = math.pi / 180
    dy, dx = (b[1] - a[1]) * rad, (b[0] - a[0]) * rad
    h = math.sin(dy / 2) ** 2 + math.cos(a[1] * rad) * math.cos(b[1] * rad) * math.sin(dx / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def node_query(db, sql, params=None):
    """better-sqlite3 는 서버 워크스페이스에 있다 — 다른 스크립트와 같은 방식으로 부른다."""
    js = f"""
const db = require("better-sqlite3")({json.dumps(db)}, {{readonly:true}});
console.log(JSON.stringify(db.prepare({json.dumps(sql)}).all(...{json.dumps(params or [])})));
"""
    out = subprocess.run(["node", "-e", js], cwd=SERVER, capture_output=True, text=True)
    if out.returncode != 0:
        print(f"🔴 장부를 못 읽습니다: {out.stderr.strip().splitlines()[-1] if out.stderr else '?'}")
        sys.exit(1)
    return json.loads(out.stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True, help="이번 판이 시작한 시각 (HH:MM, KST)")
    ap.add_argument("--db", default="local.db")
    ap.add_argument("--date", default=None, help="날짜 (기본: 오늘)")
    a = ap.parse_args()

    today = a.date or datetime.now(KST).strftime("%Y-%m-%d")
    start_dt = datetime.strptime(f"{today} {a.since}", "%Y-%m-%d %H:%M").replace(tzinfo=KST)
    start_ms = int(start_dt.timestamp() * 1000)

    log = os.path.join(SERVER, "logs", f"server-{today}.log")
    lines = []
    if os.path.exists(log):
        with open(log, encoding="utf-8", errors="replace") as f:
            lines = [l for l in f if l[:8] >= a.since + ":00"]
    else:
        print(f"⚠️ 로그가 없습니다: {log}")

    print(f"\n🔎 검수 — {today} {a.since} 이후 · 장부 {a.db}\n")
    fails = []

    # ── ① 방문 순서 ────────────────────────────────
    print("── ① 방문 순서 (코앞 정거장을 먼저 가는가)")
    orders = [l for l in lines if "[경로 순서]" in l]
    if not orders:
        print("   ⚠️ 「경로 순서」 줄이 없다 — 콜이 안 실렸거나 시각이 틀렸다")
        fails.append("방문 순서 로그 없음")
    else:
        for l in orders[-3:]:
            m = re.search(r"⑴.*$", l.strip())
            print(f"   {l[:12].strip()}  {m.group(0) if m else l.strip()[-70:]}")
        last = orders[-1]
        첫 = re.search(r"⑴\s+(\S+)\s+(상차|하차)", last)
        if 첫:
            print(f"\n   첫 정거장: {첫.group(1)} {첫.group(2)}")
            if 첫.group(2) == "상차":
                print("   ⚠️ 첫 정거장이 «상차» 다 — 코앞 하차지가 있었다면 옛 규칙일 수 있다")

    # ── ② 판정 색 ─────────────────────────────────
    print("\n── ② 판정 색 (무슨 색이 왜)")
    colors = [l for l in lines if "order-evaluated" in l and ("'" in l or "점" in l)]
    seen = set()
    for l in colors:
        m = re.search(r"([+\-−][\d.]+km,\s*[+\-−]?\d+분\s*'(\S+)'\s*·\s*(\d+)점)", l)
        if m and m.group(1) not in seen:
            seen.add(m.group(1))
            print(f"   {m.group(1)}")
    scores = [l for l in lines if "총점" in l and "점 —" in l]
    for l in scores[-2:]:
        m = re.search(r"총점.*$", l.strip())
        if m:
            print(f"   근거: {m.group(0)[:100]}")
    if not seen:
        print("   ⚠️ 판정 줄이 없다 — 콜이 심사까지 못 갔다")

    # ── ③ 도착 감지 ───────────────────────────────
    print("\n── ③ 도착 감지 (정거장마다 1회씩)")
    arr = [l for l in lines if "[도착 감지]" in l]
    app = [l for l in lines if "[근접 예고]" in l]
    for l in arr:
        m = re.search(r"\[도착 감지\].*$", l.strip())
        print(f"   {l[:12].strip()}  {m.group(0)[:60] if m else ''}")
    print(f"   → 도착 {len(arr)}회 · 근접 예고 {len(app)}회")
    if not arr:
        fails.append("도착이 한 번도 안 찍혔다")

    # ── ④ 궤적 ────────────────────────────────────
    print("\n── ④ 궤적 (이번 판만 잘라서)")
    pts = node_query(a.db, "SELECT at_ms,x,y,order_id,stop_type FROM gps_tracks WHERE at_ms>=? ORDER BY at_ms", [start_ms])
    if not pts:
        print("   ⚠️ 이번 판의 궤적이 없다")
        fails.append("궤적 없음")
    else:
        kinds, seg = set(), {}
        for p in pts:
            if p["stop_type"]:
                kinds.add(p["stop_type"])
            k = f"{(p['order_id'] or '없음')[-6:]} {p['stop_type'] or '-'}"
            seg[k] = seg.get(k, 0) + 1
        tot = sum(km((pts[i - 1]["x"], pts[i - 1]["y"]), (pts[i]["x"], pts[i]["y"])) for i in range(1, len(pts)))
        t0 = datetime.fromtimestamp(pts[0]["at_ms"] / 1000, KST).strftime("%H:%M:%S")
        t1 = datetime.fromtimestamp(pts[-1]["at_ms"] / 1000, KST).strftime("%H:%M:%S")
        print(f"   {len(pts)}점 · {t0} ~ {t1}")
        for k, v in seg.items():
            print(f"     {k:16} {v}점")
        ok = {"pickup", "dropoff"} <= kinds
        print(f"   {'✅' if ok else '🔴'} stop_type: [{', '.join(sorted(kinds)) or '없음'}]")
        if not ok:
            fails.append(f"stop_type 이 한쪽뿐 — [{', '.join(sorted(kinds))}]")

        # ── ⑤ 실제 달린 거리 ──────────────────────
        print(f"\n── ⑤ 실제 달린 거리")
        print(f"   궤적을 이어 잰 거리: {tot:.1f} km")
        rows = node_query(a.db, "SELECT id,status,totalDistanceKm FROM orders WHERE capturedAt>=? ORDER BY capturedAt",
                          [start_dt.isoformat()])
        for o in rows:
            print(f"     {o['id'][-6:]} {o['status']:<18} 카카오 총 {o.get('totalDistanceKm') or '-'} km")
        미완 = [o for o in rows if o["status"] not in ("ORDER_DELIVERED", "ORDER_COMPLETED")]
        if 미완:
            print(f"   ⚠️ 아직 안 끝난 콜 {len(미완)}건 — 사이클이 완주하지 않았다")

    print("\n" + "─" * 52)
    if fails:
        print(f"🔴 볼 것 {len(fails)}건")
        for f in fails:
            print(f"   · {f}")
        print("\n   문제지가 원인이면 주행시나리오 스킬로 되돌아간다.\n")
        sys.exit(1)
    print("✅ 이번 판은 이상 없음\n")


if __name__ == "__main__":
    main()
