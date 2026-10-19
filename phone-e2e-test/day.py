"""
하루 일과 실행기 — 시나리오(day1.json)를 읽어 단계마다 do → wait → check → 판정 → onFail. 단계는 코드에 박지 않는다(기사님 «json 으로 자동화»).
누를 자리는 taps.json 한 곳. 결과는 장부(ledger.append)에 단계 이름으로 붙는다.
쓰는 법: S23=172.30.1.18:<포트> RUN_ID=76판 python3 -u day.py day1.json [--from S05] [--only S03,S04] [--no-cleanup] [--dry]
  --dry : 폰 · 서버 없이 단계 · 이름 · 좌표 · 장소를 풀어 보기만(빈 좌표 · 모르는 낱말을 미리 찾음)
"""
import glob, json, threading, os, re, subprocess, sys, time, signal, datetime, math, sqlite3, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
DRY = '--dry' in sys.argv
if not DRY:
    import run, ledger
    from run import A24, S23, log, Stop, ToolStop, app_mark, srv_mark, srv_since, app_since, wait_for, shot, adb
else:
    def log(m): print(f'{datetime.datetime.now():%H:%M:%S} {m}', flush=True)
    class Stop(Exception): pass
    class ToolStop(Stop): pass

SCEN = json.load(open(os.path.join(HERE, next((a for a in sys.argv[1:] if a.endswith('.json')), 'day1.json')), encoding='utf8'))
TAPS = json.load(open(os.path.join(HERE, 'taps.json'), encoding='utf8'))['taps']
PLACES = SCEN['places']
BIND = {}          # 이름 → 콜 번호 앞 8자리
RESULTS = {}
SNAP = {}
START_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'start_filter.json')   # 시험 전 기사님 필터 · 모드 — S99 가 되돌린 뒤에만 지운다
RESTORED = [False]

def arg(name):
    a = sys.argv
    return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else None

def note(step, what, ok, text):
    RESULTS.setdefault(step, []).append({'what': what, 'ok': ok, 'text': text, 'at': datetime.datetime.now().strftime('%H:%M:%S')})
    log(f'{"✅" if ok is True else "🔴" if ok is False else "⚪"} {step} {what} — {text}')

DROPS = {}         # 이름 → 넣은 콜의 하차 동
FARES = {}         # 이름 → 넣은 콜의 요금 — 원달앱 «🚪 [상세 진입] 50000원 (…)»은 하차 글자를 앞 10자만 찍어 요금으로 어느 콜이 열렸나 가른다(ef)
def sub(rx):
    """정규식 안의 {C1} 은 bind 한 콜 번호 · {fare:C1} 은 그 콜의 요금 · {drop:C1} 은 하차 동 — 못 풀면(앞 단계 콜 없음) ⚪"""
    if DRY: return rx
    rx = re.sub(r'\{fare:(\w+)\}', lambda m: str(FARES[m.group(1)]) if m.group(1) in FARES else m.group(0), rx)
    rx = re.sub(r'\{drop:(\w+)\}', lambda m: re.escape(DROPS[m.group(1)]) if m.group(1) in DROPS else m.group(0), rx)
    rx = re.sub(r'\{(\w+)\}', lambda m: BIND.get(m.group(1), m.group(0)), rx)
    left = re.findall(r'\{(?:fare:|drop:)?(\w+)\}', rx)
    if left: raise ToolStop(f'⚪ 시험 도구 — 앞 단계 콜 없음({", ".join(left)}) — 이 기다림 · 판정은 못 함')
    return rx

# ── 색 확인 사전 ── (누를 자리마다 taps.json 의 check 이름 · 자리 x · y 는 tap 이 넘김)
def check_of(name, x, y):
    if name == 'any': return run.any_px
    if name == 'teal': return run.teal
    if name == 'not_white': return run.not_white
    if name == 'seat_up': return run.seat_up
    if name == 'bright': return lambda c, px: max(c) > 150
    if name == 'text_row': return lambda c, px: any(max(px(xx, y)) > 120 for xx in range(x - 32, x + 32, 3))
    if name == 'handle': return lambda c, px: 35 < c[0] < 50 and 40 < c[1] < 56
    raise ToolStop(f'⚪ 시험 도구 — 모르는 색 확인 «{name}»')

STARTED_AT = [time.time()]
HOME_BY_SCRIPT = [False]   # 이번 판에 스크립트가 귀가를 켰나(S18 «↩️ 복귀 끔» 누름이 섬)
RUN_MARK = [None]   # 판 시작 때 서버 기록 줄 수 — 장면이 기대는 사실(phone-e2e-test needs)은 이 뒤에서만 찾는다 · 날짜 파일 하나 안에서만 맞다(자정을 넘는 판은 SRV_LOG 가 안 바뀐다)

def server_fresh(sec, window_min):
    """🟢 서버가 R0 뒤 새로 섰다 = 셋이 다 참: /api/health 200 · bootedAt 이 판 시작 {window_min}분 전 이후(R0 가 서버를 다시 띄움) · 콜 장부(orders)가 빔.
       로그 줄을 기다리지 않는다 — R0 를 day.py 보다 먼저 돌리면 «기동» 줄이 판 시작 전에 찍혀 놓친다(77판). 먼저 뜬 것도 이 셋으로 잡힌다"""
    if DRY: log(f'  🟢 서버 새로 섬 확인(health · bootedAt ≥ 판 시작 −{window_min}분 · 콜 장부 0) {sec}초'); return
    end = time.time() + sec; why = ''
    while time.time() < end:
        try:
            h = json.load(urllib.request.urlopen('http://localhost:4000/api/health', timeout=5))
            booted = datetime.datetime.fromisoformat(h['bootedAt'].replace('Z', '+00:00')).timestamp()
            with sqlite3.connect(run.DB) as c: n = c.execute('SELECT COUNT(*) FROM orders').fetchone()[0]
            fresh = booted >= STARTED_AT[0] - window_min * 60
            if fresh and n == 0: log(f'🟢 서버 새로 섬 — bootedAt {h["bootedAt"]} · 콜 장부 0'); return
            why = f'bootedAt {h["bootedAt"]}{"" if fresh else f"(판 시작 {window_min}분 전보다 이름 — R0 뒤 다시 안 뜸)"} · 콜 장부 {n}건'
        except Exception as e: why = f'health 안 닿음({str(e)[:60]})'
        time.sleep(2)
    raise ToolStop(f'⚪ 시험 도구 — 서버가 R0 뒤 새로 서지 않음({sec}초): {why} — 9e: `pnpm reset:calls` 를 돌렸나')

_REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
_APP_PLUGINS = os.path.join(_REPO, 'onedal-app/app/src/main/java/com/onedal/app')
_SIM_NETS = os.path.join(_REPO, 'onedal-sim/packages/ui-simulators/src/nets.ts')
def app_networks():
    """원달앱이 아는 배차망 {코드: 전환 기록 이름} — 플러그인마다 «override val code = TargetApp.X» · «override val label = "…"»(TargetApp.kt 의 X = "코드")"""
    consts = dict(re.findall(r'const val (\w+) = "([^"]+)"', open(os.path.join(_APP_PLUGINS, 'core/TargetApp.kt')).read()))
    out = {}
    for f in sorted(glob.glob(os.path.join(_APP_PLUGINS, 'plugins/*/*Plugin.kt'))):
        t = open(f).read(); c = re.search(r'override val code: String = TargetApp\.(\w+)', t); l = re.search(r'override val label: String = "([^"]+)"', t)
        if c and l and c.group(1) in consts: out[consts[c.group(1)]] = l.group(1)
    return out
def sim_networks():
    """시뮬이 띄울 수 있는 배차망 코드 — SIM_NET_LIST = [SIM_NETS.x, …] 의 차례"""
    t = open(_SIM_NETS).read(); m = re.search(r'SIM_NET_LIST[^=]*=\s*\[([^\]]*)\]', t)
    return re.findall(r'SIM_NETS\.(\w+)', m.group(1)) if m else []

# 🎛️ 필터 칸 — DB user_filters 칸 ↔ 관제앱이 보내는 필터 칸(서버 baseFilterFrom · shared phases.ts QUAD_FIELDS · FILTER_FIELDS) · 시험용 필터 맞춤 · 되돌림 · 확인이 모두 이 표 하나를 쓴다
FILTER_COLS = {
    'destination_city': 'destinationCity', 'min_fare': 'minFare', 'max_fare': 'maxFare', 'excluded_keywords': 'excludedKeywords',
    'excluded_regions': 'excludedRegions', 'is_active': 'isActive', 'accepted_vehicle_types': 'acceptedVehicleTypes',
    'pickup_radius_km': 'pickupRadiusKm', 'detour_radius_km': 'detourRadiusKm', 'destination_radius_km': 'destinationRadiusKm',
    'src_angle_deg': 'srcAngleDeg', 'dst_angle_deg': 'dstAngleDeg', 'quad_radius_km': 'quadRadiusKm',
    'call_discount_pct': 'callDiscountPct', 'radius_auto': 'radiusAuto', 'radius_base_km': 'radiusBaseKm',
    'route_mode': 'routeMode', 'reservation_mode': 'reservationMode'}
_JSON_COLS = ('excluded_keywords', 'excluded_regions', 'accepted_vehicle_types')
_BOOL_COLS = ('is_active', 'radius_auto', 'route_mode')
def filter_of_row(row):
    """DB 필터 줄 → 관제앱이 보내는 필터 칸(되돌릴 때)"""
    out = {}
    for col, key in FILTER_COLS.items():
        if col not in row: continue
        v = row[col]
        if col in _JSON_COLS: v = json.loads(v or '[]')
        elif col in _BOOL_COLS: v = bool(v)
        out[key] = v
    return out
def start_row():
    """S01 이 떠 둔 기사님 필터 줄 — 원달앱이 받은 목적지 · 최저가 같은 줄"""
    start, rows = SNAP.get('filter') or {}, SNAP.get('filter_rows') or []
    hit = next((r for r in rows if r.get('destination_city') == start.get('destinationCity') and r.get('min_fare') == start.get('minFare')), None)
    if hit: return hit
    # 원달앱이 받은 목적지는 그 순간 국면 값이라(귀가면 집 쪽 시) DB 평소 목적지와 다를 수 있다 — 최저가 같은 줄이 딱 하나면 그 줄(판 5)
    same = [r for r in rows if r.get('min_fare') == start.get('minFare')]
    return same[0] if len(same) == 1 else None
def db_filter_row():
    with sqlite3.connect(run.DB) as c:
        c.row_factory = sqlite3.Row
        uid = (start_row() or {}).get('user_id')
        rows = [dict(r) for r in c.execute('SELECT * FROM user_filters').fetchall()]
    return next((r for r in rows if uid and r['user_id'] == uid), None) or next((r for r in rows if r.get('is_active')), rows[0] if rows else {})
def filter_diff(want):
    """want(필터 칸) 와 지금 DB 줄이 다른 칸 {칸: (원함, DB)}"""
    have = filter_of_row(db_filter_row()); bad = {}
    for k, v in want.items():
        h = have.get(k)
        if isinstance(v, float) or isinstance(h, float):
            if h is None or abs(float(h) - float(v)) > 1e-6: bad[k] = (v, h)
        elif h != v: bad[k] = (v, h)
    return bad

def s23_sees(w):
    return json.loads(run.sh('node', os.path.join(HERE, 'find.mjs'), S23, f'see:{w}', str(run.MENU_Y), check=False).strip().splitlines()[-1])['state'] == 'ok'

def tidy_s23(must_see):
    """🧭 판의 출발 화면은 도구가 맞춘다 — 앞 판이 남긴 화면(펼친 필터 창 · 열린 서랍)에 기대지 않는다(77판 S02: 필터 창이 펼쳐져 모드 단추가 안 보임).
       접기 · 닫기만 한다(값은 안 바꿈) · 이미 접혀 · 닫혀 있으면 안 누름 · 맞춘 뒤 모드 줄(«{must_see}»)이 안 보이면 ⛔"""
    if DRY: log(f'  🧭 S23 출발 화면 맞추기 — 서랍 «완료됨» 보이면 닫기 · 필터 «얼마나 넓게» 보이면 상태 줄 눌러 접기 · «{must_see}» 보임 확인'); return
    if s23_sees('완료됨'): tap('s23.drawer.close'); time.sleep(1)
    if s23_sees('얼마나 넓게'): tap('s23.filter.toggle'); time.sleep(1)
    if s23_sees('얼마나 넓게'):   # 펼친 필터 창은 바깥 투명 덮개(Dashboard «필터 닫기»)가 화면 전체를 덮는다 — 기사님처럼 바깥(☰ 자리)을 눌러 닫는다(92판 S14)
        run.guard(S23); run.adb(S23, 'shell', 'input', 'tap', '73', str(run.MENU_Y)); log('  🧭 필터 바깥(덮개)을 눌러 필터 창 닫음'); time.sleep(1)
    left = [w for w in ('완료됨', '얼마나 넓게') if s23_sees(w)]
    if left or not s23_sees(must_see):
        shot(S23, 'tidy_fail')
        raise ToolStop(f'⛔ S23 출발 화면을 못 맞춤 — {", ".join(f"«{w}» 아직 보임" for w in left) or f"«{must_see}»(모드 줄) 안 보임"}')
    log(f'🧭 S23 출발 화면 — 필터 접힘 · 서랍 닫힘 · «{must_see}» 보임')

def home_on():
    """귀가가 켜져 있나 — «↩️ 복귀 켬» 단추 글자는 필터 창을 열어야 보인다(닫힌 채 보면 늘 «꺼짐» · 판 6 S99 · 판 7 S01) · (켜짐, 이번에 창을 열었나) — 연 창은 부른 쪽이 닫는다(이미 열려 있던 창은 안 닫음)"""
    was_open = s23_sees('어디로')
    tap('s23.filter.open')
    return s23_sees('복귀 켬'), not was_open

def home_off_if_mine():
    on, _ = home_on()
    if not on: log('  귀가 꺼져 있음 — 할 것 없음'); return
    if not HOME_BY_SCRIPT[0] and SNAP.get('home') is not False:   # 판 시작 때도 켜져 있었거나(기사님 손) 시작 값을 모름 — 안 끔
        note(CUR[0], '귀가', None, '귀가 켜져 있음 — 판 시작 때도 켜져 있었거나 시작 값을 몰라 안 끔'); return
    tap('s23.filter.open'); tap('s23.filter.home.off')

def screen_ok(name, t, sec=5):
    """👀 좌표를 누르기 전에 기대한 화면인가(71 — 76판 S07 · S09: 화면이 이미 바뀐 뒤 같은 자리를 눌러 살릴 콜을 거절 · 목록으로 나감).
       A24 = 원달앱 마지막 «📄 [페이지] …» 줄이 expect.page 정규식에 맞나 · S23 = expect.see 글자가 다 보이고 expect.notSee 글자가 안 보이나(find.mjs see:).
       화면이 바뀌는 중일 수 있어 sec 초까지 다시 본다 · 끝내 아니면 누르지 않고 ⚪ «화면이 ‹…›라 안 누름»"""
    e = t.get('expect')
    if not e: raise ToolStop(f'⚪ 시험 도구 — «{name}» 기대 화면이 taps.json 에 없음(좌표를 그냥 누르지 않는다)')
    end = time.time() + sec; last = ''
    while True:
        if t['phone'] == 'A24':
            line = adb(A24, 'shell', f"grep -F '📄 [페이지]' {run.APP_LOG} | tail -1", check=False).strip()
            last = line.split('[페이지]')[-1].strip() if line else '페이지 줄 없음'
            if re.search(e['page'], last): return
        else:
            see = lambda w: json.loads(run.sh('node', os.path.join(HERE, 'find.mjs'), S23, f'see:{w}', str(run.MENU_Y), check=False).strip().splitlines()[-1])['state'] == 'ok'
            miss = [w for w in e.get('see', []) if not see(w)]; extra = [w for w in e.get('notSee', []) if see(w)]
            last = ' · '.join([f'«{w}» 안 보임' for w in miss] + [f'«{w}» 보임' for w in extra])
            if not miss and not extra: return
        if time.time() >= end: break
        time.sleep(0.5)
    shot(A24 if t['phone'] == 'A24' else S23, f'notscreen_{name}')
    raise ToolStop(f'⚪ 시험 도구 — 화면이 «{last}»라 «{name}» 안 누름(기대: {e.get("page") or e})')

def tap(name):
    t = TAPS.get(name)
    if not t: raise ToolStop(f'⚪ 시험 도구 — taps.json 에 «{name}» 없음')
    # 🔤 S23(관제앱)은 좌표를 누르지 않는다 — 띠 · 경보 · 펼침에 따라 높이가 늘 바뀐다(77판). 글자로 그 순간 찾아 누른다(71 «가»)
    if t['phone'] == 'S23' and not t.get('text'): raise ToolStop(f'⚪ 시험 도구 — «{name}» 은 S23 좌표 자리라 안 누름(글자 자리 필요)')
    # ⏭️ 누른 뒤 될 상태가 이미 서 있으면(필터 창이 이미 열림 · 칸이 이미 펼쳐짐) 누르지 않는다 — 누르면 도로 닫힌다
    if t.get('skipIf') and t['phone'] == 'S23' and not DRY:
        if s23_sees_all(t['skipIf']['see']):
            log(f'  ⏭️ {name} — 이미 그 상태(«{" · ".join(t["skipIf"]["see"])}» 보임) · 안 누름'); return
    if t.get('text'):
        if name.startswith('s23.call.') and not DRY:   # 콜 줄 — 시트가 접혀 보이면 글자 찾기 도구가 «펼친 자리»를 알려 줘 지도 위를 누른다(판 9 · 10 · 12) · 시트를 위로 한 번 밀어 펼친 뒤 찾는다(펼쳐져 있으면 목록이 조금 올라갈 뿐)
            run.guard(S23); run.adb(S23, 'shell', 'input', 'swipe', '540', '2050', '540', '700', '400'); time.sleep(1.5)
        return tap_text(name, t)
    if t['x'] is None: raise ToolStop(f'⚪ 시험 도구 — «{name}» 좌표 없음(사진 필요: {t["from"]})')
    if DRY: log(f'  👆 {name} ({t["x"]},{t["y"]}) {t["phone"]} · 기대 화면 {t.get("expect") or "⛔ 없음"}'); return
    screen_ok(name, t)
    run.tap_if(A24 if t['phone'] == 'A24' else S23, t['x'], t['y'], check_of(t['check'], t['x'], t['y']), name); time.sleep(1.5)

def tap_text(name, t):
    """자리가 바뀌는 단추 — 개발자 도구로 글자를 찾아 화면 자리만 구하고(find.mjs) adb 손 누름(71 «가» · DOM .click() 안 씀).
       화면 밖이면 손가락으로 밀어 다시 찾는다(세 번까지) · 가려짐 · 없음 · 둘 이상이면 안 누르고 ⚪"""
    if DRY: log(f'  🔎 {name} «{t["text"]}» {t["phone"]} — 찾아서 손 누름'); return
    menu_y = run.MENU_Y
    for i in range(10):   # 옆으로 한 번 · 아래로 여러 번(단계 칸은 보이는 높이가 작아 한 번에 조금씩 밀린다 · 91판)
        r = json.loads(run.sh('node', os.path.join(HERE, 'find.mjs'), S23, t['text'], str(menu_y), check=False).strip().splitlines()[-1])
        if r['state'] in ('right', 'left') and r.get('swipeX') and i < 9:   # 옆으로 미는 칸 — 기사님 손으로 옆으로 밀어 그 단계로
            sw = r['swipeX']; x1, x2 = (sw['x1'], sw['x2']) if r['state'] == 'right' else (sw['x2'], sw['x1'])
            run.guard(S23); run.adb(S23, 'shell', 'input', 'swipe', str(x1), str(sw['y']), str(x2), str(sw['y']), '300'); log(f'  👋 {name} 옆 칸({r["state"]}) — 옆으로 밀어서 다시 찾음'); time.sleep(1); continue
        if r['state'] in ('below', 'above') and r.get('swipe') and i < 9:
            sw = r['swipe']; y1, y2 = (sw['y1'], sw['y2']) if r['state'] == 'below' else (sw['y2'], sw['y1'])
            run.guard(S23); run.adb(S23, 'shell', 'input', 'swipe', str(sw['x']), str(y1), str(sw['x']), str(y2), '400'); log(f'  👋 {name} 화면 밖({r["state"]}) — 밀어서 다시 찾음'); time.sleep(1); continue
        break
    if r['state'] != 'ok':
        shot(S23, f'nofind_{name}')
        if r['state'] == 'covered': raise ToolStop(f'⚪ 시험 도구 — «{r.get("text") or t["text"]}»가 가려져 있음({r.get("why", "")}) · 안 누름')
        raise ToolStop(f'⚪ 시험 도구 — «{t["text"]}» 단추 {r["state"]}: {r.get("why", "")} (자리 {r.get("x")},{r.get("y")})')
    if r['h'] < 96: log(f'  ⚠️ {name} 단추 높이 {r["h"]}px — 손가락(약 9mm ≈ 96px)보다 작음')
    run.tap_if(S23, r['x'], r['y'], run.any_px, f'{name} «{r["text"]}» (웹뷰 높이 {r["offsetY"]})'); time.sleep(1.5)
    # 🎯 누른 뒤 될 상태(skipIf)가 안 섰으면 글자 왼쪽 끝을 한 번 더 — 웹뷰 밖 겹창(JoyStick 띠 · 위치 단추)은 find.mjs 가 못 봐서 가운데 누름이 먹히지 않은 적이 있다(판 4 S18)
    if t.get('skipIf') and not s23_sees_all(t['skipIf']['see']):
        x = r['x'] - r.get('w', 0) // 2 + min(60, r.get('w', 0) // 4)   # 단추 안 — 좁은 단추에서 옆 단추를 누르지 않게
        log(f'  ↩️ {name} — 누른 뒤 «{" · ".join(t["skipIf"]["see"])}» 안 보임 · 왼쪽 끝({x},{r["y"]})을 다시 누름')
        run.tap_if(S23, x, r['y'], run.any_px, f'{name} 왼쪽 끝'); time.sleep(1.5)
        if not s23_sees_all(t['skipIf']['see']): shot(S23, f'notopen_{name}'); raise ToolStop(f'⚪ 시험 도구 — «{name}» 두 자리를 눌러도 «{" · ".join(t["skipIf"]["see"])}» 안 보임')

def s23_sees_all(words):
    """S23 웹뷰에 그 글자들이 다 보이나 — 글자 하나는 s23_sees"""
    return all(s23_sees(w) for w in words)

# ── 장소 · 콜 ──
def hav_m(a, b):
    R = 6371000; dl = math.radians(b[1] - a[1]); dn = math.radians(b[0] - a[0])
    h = math.sin(dl / 2) ** 2 + math.cos(math.radians(a[1])) * math.cos(math.radians(b[1])) * math.sin(dn / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def place(key, ref=None):
    """places 이름 · dest:near/far(그 순간 하차 목록 동 가운데 ref 에서 가까운/먼 것 · 동 단위 주소)"""
    if key in PLACES: return tuple(PLACES[key])
    if key.startswith('dest:'):
        if DRY: return (f'(그 순간 하차 목록 · {key})', '?', 0, 0)
        f = run.app_filter(); two = f.get('destinationDongSigungu', {}) or {}   # 이름이 두 시에 있는 동 → 그 하차 목록의 시(예: 송정동 → 이천시 · 광주시 송정동이 아님)
        cities = [c for c in (f.get('customCityFilters') or []) if c.endswith('시') and ' ' not in c]
        cands = []
        with sqlite3.connect(run.DB) as c:
            for d in f.get('destinationKeywords', []) or []:
                for city in ([two[d][0]] if d in two else cities):
                    addr = f'경기 {city} {d}'
                    r = c.execute('SELECT x, y FROM geocode_cache WHERE query IN (?, ?)', (addr, f'a1|{addr}')).fetchone()
                    if r: cands.append((addr, d, r[0], r[1])); break
        if not cands: raise ToolStop('⚪ 시험 도구 — 하차 목록 동 가운데 서버 캐시에 있는 주소가 없음')
        r0 = PLACES.get(ref or 'ian'); base = (r0[2], r0[3])
        cands.sort(key=lambda p: hav_m(base, (p[2], p[3])))
        parts = key.split(':'); k = int(parts[2]) if len(parts) > 2 else 1   # dest:near:K · dest:far:K — K번째(같은 길 기억에 안 걸리게 콜마다 다른 동)
        k = min(k, len(cands))
        return cands[-k] if parts[1] == 'far' else cands[k - 1]
    raise ToolStop(f'⚪ 시험 도구 — 장소 «{key}» 없음')

def do_call(c):
    pick, drop = place(c['pick']), place(c['drop'], c['pick'])
    if c['veh'] == 'filter': veh = None if DRY else (run.app_filter().get('allowedVehicleTypes') or ['1t'])[0]
    elif c['veh'] == 'snapshot': veh = None if DRY else ((SNAP.get('filter') or {}).get('allowedVehicleTypes') or ['1t'])[0]   # 그 순간 필터를 통과하는 차종(S01 떠 둔 값)
    else: veh = c['veh']
    if DRY: log(f'  📦 {c["net"]} {pick[0]} → {drop[0]} · {c["fare"]} · {veh} · {c.get("tag")} · bind {c.get("bind")}'); return
    n = app_mark(); sm = srv_mark(); fare = c['fare'] + (run.fare_bump() // 1000 % 10) * 1000   # 끝수 0~9천 원 — 시나리오 요금 차(높음/낮음)를 안 뒤집게
    body = {'pickup': dict(zip(('addressDetail', 'region', 'lon', 'lat'), pick)), 'dropoff': dict(zip(('addressDetail', 'region', 'lon', 'lat'), drop)), 'fare': fare, 'vehicleType': veh,
            'net': run.SIM_CODE[c['net']]}   # 🔀 받을 배차망 — 시뮬은 배차망마다 칸을 들고 있어 «누가 받나»가 시험의 사실이 되게(71 «가»)
    r = urllib.request.urlopen(urllib.request.Request('http://localhost:4000/api/sim/calls', json.dumps(body).encode(), {'Content-Type': 'application/json'}))
    log(f'📦 {c.get("tag")} {pick[0]} → {drop[0]} · {fare} · {veh} · {r.read().decode()[:40]}')
    if c.get('bind'): DROPS[c['bind']] = drop[1]; FARES[c['bind']] = fare
    run.call_seen(c['net'], n, drop[1])
    PENDING.update(bind=c.get('bind'), mark=sm, drop=drop[1], fare=fare, cmark=n)   # 넣기 직전 자리 — 원달앱이 본 뒤에 재면 그 사이 서버 줄을 놓친다(80판 S07)
    if c.get('bind'): CMARK[c['bind']] = n; SMARK[c['bind']] = sm   # 콜마다 넣은 순간의 원달앱 기록 자리 — 두 콜을 잇따라 넣으면 앞 콜 줄이 뒤 콜 자리보다 앞이다(79판 S07)
PENDING = {}
CMARK = {}   # 이름 → 그 콜을 넣은 순간의 원달앱 기록 줄 수
SMARK = {}   # 이름 → 그 콜을 넣기 직전의 서버 기록 줄 수

def seat(kind, b):
    """결재석 KEEP / 거절 — 서버가 그 콜을 판정해 결재석에 올린 뒤 · 결재 뒤 콜 번호를 bind"""
    if DRY: log(f'  {"✅ KEEP" if kind == "keep" else "✖ 거절"} bind {b.get("bind")}'); return
    m = SMARK.get(b.get('bind')) or PENDING.get('mark') or srv_mark(); a0 = app_mark()   # 콜마다 넣기 직전 자리(두 콜을 잇따라 넣는 장면)
    oid = bind_call(b, m)
    seat_tap(kind, b, m)
    wait_for('srv', m, rf'결재 처리 완료 \({re.escape(oid)}', 30, f'{b.get("bind")} 결재({oid[:8]})')
    # 원달앱이 결재를 받아 집행할 때까지 — 다음 줄에서 시뮬 배차망을 바꾸면 결재 전 화면이 바뀌어 F36 장면과 겹친다(ef)
    if kind == 'keep': wait_for('app', a0, r'판결 KEEP 집행 완료|정상 결재 수신|즉각.*집행', 40, f'원달앱이 KEEP 을 받아 집행({b.get("bind")})')

def seat_tap(kind, b, m, limit=25):
    """🪑 결재석에 **그 콜**이 떠 있을 때만 누른다(71 F46 — 결재석이 둘째 콜로 바뀐 직후 «거절»이 살릴 콜을 거절함).
       그 콜 = 넣을 때 적은 요금(«6.1만원» · JudgmentSeat 머리줄). find.mjs 가 그 요금이 적힌 결재석 칸의 거절(앞) · KEEP(뒤) 단추 자리를 준다 —
       다른 콜이 떠 있거나 판정 전(단추 꺼짐)이면 누르지 않고 기다린다 · 겹쳐 뜨면 그 콜 칸의 단추 · 한도 넘으면 ⚪"""
    fare = FARES.get(b.get('bind')) or PENDING.get('fare')
    if not fare: raise ToolStop(f'⚪ 시험 도구 — 결재석에서 찾을 요금 없음({b.get("bind")})')
    want = f'seat:{fare / 10000:.1f}만원:{"keep" if kind == "keep" else "reject"}'
    what = f'결재석 {"KEEP" if kind == "keep" else "거절"}({b.get("bind")} · {fare / 10000:.1f}만원)'
    wait_for('srv', m, r'판정 색 표시', 20, '관제웹 결재석에 판정 색')
    end = time.time() + limit; last = None
    while time.time() < end:
        r = json.loads(run.sh('node', os.path.join(HERE, 'find.mjs'), S23, want, str(run.MENU_Y), check=False).strip().splitlines()[-1])
        if r['state'] == 'ok':
            run.guard(S23); run.adb(S23, 'shell', 'input', 'tap', str(r['x']), str(r['y'])); log(f'👆 {what} ({r["x"]},{r["y"]})'); shot(S23, f'tapped_{kind}_{b.get("bind")}'); return
        if r['state'] in ('none', 'disabled', 'hidden'):
            why = r.get('why') or r['state']
            if why != last: log(f'  ⏳ {what} — {why} · 기다림'); last = why
            time.sleep(0.3); continue
        shot(S23, f'seat_{r["state"]}_{b.get("bind")}')
        raise ToolStop(f'⚪ 시험 도구 — {what} 단추 {r["state"]}: {r.get("why", "")}')
    shot(S23, f'seat_none_{b.get("bind")}')
    raise ToolStop(f'⚪ 시험 도구 — {what} {limit}초 안에 결재석에 그 콜이 안 뜸 · 마지막: {last}')

def bind_call(b, m=None):
    """🔖 **그 콜의 번호를 요금으로 묶는다** — «지금 뜬 것 = 내 콜» 짐작을 하지 않는다(71 · F46 과 같은 뿌리).
       원달앱 «🚪 [상세 진입] {요금}원 (…) … · 세션 <콜 번호>»(HijackService.kt:1789 · 세션 = 서버 콜 번호) ↔ 서버 «order-evaluating (<콜 번호>)»를 짝짓는다.
       요금은 그 콜을 넣을 때 적은 값(끝수 더함) · 짝이 하나가 아니거나 서버 줄이 없으면 ⚪ «콜 번호를 못 묶음»"""
    if DRY: return 'dry'
    fare = FARES.get(b.get('bind')) or PENDING.get('fare')
    if not fare: raise ToolStop(f'⚪ 시험 도구 — 콜 번호를 못 묶음({b.get("bind")} · 넣은 요금 없음)')
    rx = rf'상세 진입\] {fare}원 .*세션 ((?:24H-)?[0-9a-f-]{{8,36}})'   # 인성 UUID · 화물24시 «24H-d7837085»(91판)
    t = wait_for('app', CMARK.get(b.get('bind')) or PENDING.get('cmark') or PENDING.get('amark') or 0, rx, 40, f'{b.get("bind")} 상세 진입 {fare}원')
    ids = sorted(set(re.findall(rx, t)))
    if len(ids) != 1: raise ToolStop(f'⚪ 시험 도구 — 콜 번호를 못 묶음({b.get("bind")} · {fare}원 상세 진입이 {len(ids)}개: {", ".join(i[:8] for i in ids)})')
    oid = ids[0]
    try: wait_for('srv', SMARK.get(b.get('bind')) or m or PENDING.get('mark') or 0, rf'order-evaluating \({re.escape(oid)}\)', 15, f'서버 order-evaluating {oid[:8]}')
    except Stop: raise ToolStop(f'⚪ 시험 도구 — 콜 번호를 못 묶음({b.get("bind")} · 원달앱 {oid[:8]} 를 서버가 심사에 올리지 않음)')
    if b.get('bind'): BIND[b['bind']] = oid[:8]
    log(f'  🔖 {b.get("bind")} = {oid[:8]} ({fare}원 · 원달앱 상세 진입 ↔ 서버 order-evaluating)')
    return oid

def open_is(b):
    """지금 원달앱이 연 상세가 그 콜인가 — 원달앱 마지막 «🚪 [상세 진입] {요금}원» 줄의 요금이 그 콜 요금인가(90판 S07: C1x 확정을 누르려다 그새 열린 C1 상세를 누름)"""
    t = adb(A24, 'shell', f"grep -F '상세 진입] ' {run.APP_LOG} | tail -1", check=False)
    m = re.search(r'상세 진입\] (\d+)원', t)
    return bool(m) and int(m.group(1)) == FARES.get(b)

def color_of(b):
    """그 콜의 판정 색 — 서버 «🎨 [판정] 🔵 70점 — 돈 3.7만 …» 줄(OrderEvaluator.ts:387 · 판정 색 설정이 매긴 결과)을 그 콜을 넣기 직전 자리 뒤에서 «돈 {요금}만»으로 찾는다 · 아직이면 None"""
    t = srv_since(SMARK.get(b) or 0)
    m = re.findall(rf'🎨 \[판정\] (\S+) (\d+)점([^\n]*?)— 돈 {FARES[b] / 10000:.1f}만', t)   # 점수 뒤에 «· 잡으면 사고 — N분 늦음(…)» 같은 덧말(= 까닭 · 셋째 칸)이 끼기도 한다(93판 S19)
    if m: return m[-1]
    # 점수 없는 판정(«🔴 잴 수 없음 — 돈 ⚠️ …» · 카카오 실패 등)에는 요금이 안 찍힌다 — 이 콜을 넣은 뒤 다음 콜을 넣기 전 사이에 그런 줄이 딱 하나면 이 콜의 것(판 4 S12)
    later = [v for k, v in SMARK.items() if k != b and v > (SMARK.get(b) or 0)]
    if later: t = ''.join(t.splitlines(True)[:min(later) - (SMARK.get(b) or 0)])
    m = re.findall(r'🎨 \[판정\] (\S+) 잴 수 없음([^\n]*)', t)
    return (m[0][0], '?', m[0][1]) if len(m) == 1 else None

def dismiss_preview(b):
    """👀 결재석 미리보기 칸 본문을 눌러 치운다(기사님이 하는 것 · JudgmentSeat «미리보기 — 눌러서 치우기») — 안 보이면 ⚪ · 누른 뒤에도 남으면 ⚪(판 5 S12)"""
    end = time.time() + 10; r = None
    while time.time() < end:
        r = json.loads(run.sh('node', os.path.join(HERE, 'find.mjs'), S23, 'leaf:눌러서 치우기', str(run.MENU_Y), check=False).strip().splitlines()[-1])
        if r['state'] == 'ok': break
        time.sleep(1)
    if not r or r['state'] != 'ok': raise ToolStop(f'⚪ 시험 도구 — {b} 결재석 미리보기 칸을 못 찾음({(r or {}).get("state")})')
    run.tap_if(S23, r['x'], r['y'], run.any_px, f'{b} 결재석 미리보기 치우기'); time.sleep(1.5)
    if s23_sees('눌러서 치우기'): shot(S23, f'preview_left_{b}'); raise ToolStop(f'⚪ 시험 도구 — {b} 미리보기를 눌렀는데 그대로 있음')
    log(f'  👀 {b} 결재석 미리보기 치움')

CONFIRM = {'insung': 'a24.insung.detail.confirm', 'hwamul24': 'a24.hwamul24.detail.confirm'}   # 손 확정 단추(인성 «확정» · 화물24시 «배차신청»)
CLOSE = {'insung': 'a24.insung.detail.close'}   # 손 확정 뒤 KEEP 이 오면 기사님이 누르는 «닫기»(화물24시는 신청 뒤 같은 화면에 머문다 — 누를 닫기가 없고 다음 장면이 시뮬레이터를 목록으로 다시 연다)

def decide(v):
    """🎨 기사님이 고르는 자리 — 판정 색은 기록만 하고, 잡을지는 시나리오(want · 없으면 keep)대로 한다(기사님 «색으로 거르지 않는다 · 그냥 시험이니까 진행»).
       v = {bind · how: hand|auto|view · net · sec · want: keep|reject}
       hand(알람 · 직접): 원달앱이 그 콜 상세를 열면 want 대로 — keep 이면 손 확정(→ KEEP → 닫기)
       auto(자동): 원달앱 확정 뒤 결재석 — keep 이면 결재석 KEEP · reject 면 결재석 거절(실행서 5-1)
       view(픽커 · 문제 콜처럼 안 잡는 자리): 원달앱 상세 진입을 기다려 색만 적고 누르지 않음
       판정이 기대와 달라 장면이 갈리면 도구 문제가 아니라 기록할 사실 — 🔵 아닌 손 확정 자리는 ⚪ «판정 ○ — 안 잡음»(뒤 장면은 앞 장면 없음)"""
    b, how = v.get('bind'), v['how']
    if DRY: log(f'  🎨 {b} — 판정 색으로({how}: 🔵 면 {"손 확정" if how == "hand" else "결재석 KEEP" if how == "auto" else "보기만"} · 아니면 {"안 누름" if how != "auto" else "결재석 거절"})'); return
    end = time.time() + v.get('sec', 60); c = None
    while time.time() < end and not c:
        if how != 'auto' and f'상세 진입] {FARES[b]}원' not in app_since(CMARK.get(b) or 0): time.sleep(1); continue
        c = color_of(b)
        if not c: time.sleep(1)
    if not c: raise ToolStop(f'⚪ 시험 도구 — {b} {FARES[b]}원 판정 색을 {v.get("sec", 60)}초 안에 못 읽음')
    want = v.get('want', 'keep')
    log(f'  🎨 {b} {FARES[b]}원 판정 {c[0]} {c[1]}점(기록만) → 시나리오대로 {"잡음" if want == "keep" else "거절"}')
    blue = want == 'keep'   # 색으로 거르지 않는다 — 시나리오가 잡기로 한 콜은 잡는다(기사님 «합짐은 🔵만 그런 거 없어 · 그냥 시험이니까 진행해» · 71)
    if how == 'view':
        note(CUR[0], f'{b} 판정(보기만)', True, f'{c[0]} {c[1]}점 · 안 누름')
        if v.get('dismiss'): dismiss_preview(b)
        return
    if how == 'auto':
        seat('keep' if blue else 'reject', {'bind': b})
        note(CUR[0], f'{b} 판정 → 결재석', True, f'{c[0]} {c[1]}점 → {"KEEP" if blue else "거절"}')
        return
    if not blue: note(CUR[0], f'{b} 판정(보기만)', True, f'{c[0]} {c[1]}점 · 안 누름'); return
    net = v.get('net', 'insung')
    if not open_is(b): raise ToolStop(f'⚪ 시험 도구 — {b} 상세가 이미 닫힘(지금 열린 상세는 다른 콜) · 안 누름')
    tap(CONFIRM[net]); keep_server({'bind': b})
    if net in CLOSE: tap(CLOSE[net])
    note(CUR[0], f'{b} {c[0]} 손 확정', True, f'{c[1]}점')

def keep_if_blue(binds, sec):
    """🔵 콜만 잡는다 — 원달앱이 연 콜(«상세 진입] {요금}원»)마다 판정 색을 읽어 🔵 면 확정 → KEEP → 닫기 · 아니면 누르지 않고 다음 콜을 기다린다.
       점수 · 요금으로 고르지 않는다 · 다 🔵 가 아니면 ⚪ «파랑 콜 없음»"""
    if DRY: log(f'  🔵 {", ".join(binds)} 가운데 판정 🔵 인 콜이 열리면 확정 → KEEP → 닫기 · {sec}초'); return
    end = time.time() + sec; seen = {}
    while time.time() < end:
        for b in binds:
            if b in seen: continue
            if f'상세 진입] {FARES[b]}원' not in app_since(CMARK.get(b) or 0): continue
            c = color_of(b)
            if not c: continue
            seen[b] = c; take = b == binds[-1]   # 시나리오가 잡기로 한 콜(마지막 이름 · S07 은 C1) — 색은 기록만(71 · 기사님)
            log(f'  🎨 {b} {FARES[b]}원 판정 {c[0]} {c[1]}점(기록만) → {"시나리오 첫짐 · 잡음" if take else "보기만"}')
            if take:
                if not open_is(b): log(f'  ↪️ {b} 상세가 이미 닫힘(다른 콜이 열림) — 안 누름 · 다음 콜'); continue
                tap('a24.insung.detail.confirm'); keep_server({'bind': b}); tap('a24.insung.detail.close')
                note(CUR[0], f'{c[0]} 콜 잡음', True, f'{b} {FARES[b]}원 {c[1]}점' + ('' if b == 'C1' else ' · ⚠️ 뒤 장면은 C1(이안로지스 하차)을 기대 — 다른 콜을 잡아 뒤가 어긋날 수 있음'))
                return
        if len(seen) == len(binds): break
        time.sleep(1)
    raise ToolStop(f'⚪ 시나리오 콜({binds[-1]})이 {sec}초 안에 안 열림 — ' + (' · '.join(f'{b} {seen[b][0]} {seen[b][1]}점' for b in seen) or '판정 읽은 콜 없음'))

def keep_server(b, m=None):
    """서버 · 원달앱이 결재를 스스로 낸 콜(자동 KEEP 등) — 번호는 요금으로 묶고, 그 번호의 «결재 처리 완료»를 기다린다"""
    if DRY or not b.get('bind'): return
    m = m or PENDING.get('mark') or srv_mark()
    oid = bind_call(b, m)
    wait_for('srv', m, rf'결재 처리 완료 \({re.escape(oid)}', 30, f'{b["bind"]} 결재({oid[:8]})')

# ── 동작 사전 ──
def act(a):
    (k, v), = a.items()
    if DRY and k not in ('tap', 'call', 'keep', 'reject', 'joystick', 'tap_if_cod', 'type'): log(f'  · {k} {v}'); return
    if k == 'reset_calls': log('🟡 9e: `pnpm reset:calls` 를 돌리고 서버가 다시 뜨면 진행(이 단계는 서버 기동 줄을 기다림)')
    elif k == 'check' and v == 'connected':
        urllib.request.urlopen('http://localhost:4000/api/health', timeout=5)
        wait_for('app', max(0, app_mark() - 400), r'scrap\] 화면', 30, '원달앱 보고')
        if 'kr.co.onedal.dashboard' not in run.focus_of(S23): __import__('g').revive_G5()
    elif k == 'snapshot':   # 시작 때 기사님 필터 · 설정 · 모드 — out/start_filter.json 에 따로 남김 · 이미 있으면(앞 판이 S99 로 되돌리지 못함) 덮지 않고 그 값을 쓴다
        if os.path.exists(START_FILE):
            SNAP.update(json.load(open(START_FILE)))
            log(f'📸 아직 되돌리지 않은 시작 값이 있음 — 덮지 않음({START_FILE}) · 모드 {SNAP.get("mode")} · 목적지 {(SNAP.get("filter") or {}).get("destinationCity")} · 최저 {(SNAP.get("filter") or {}).get("minFare")}')
            return
        with sqlite3.connect(run.DB) as c:
            for t in ('user_filters', 'user_settings'): SNAP[t] = [list(r) for r in c.execute(f'SELECT * FROM {t}').fetchall()]
            c.row_factory = sqlite3.Row
            SNAP['filter_rows'] = [dict(r) for r in c.execute('SELECT * FROM user_filters').fetchall()]   # S99 가 시작 필터로 되돌릴 때 칸 이름으로 읽는다
        SNAP['mode'] = run.supplied_mode(); SNAP['filter'] = run.app_filter()
        SNAP['home'], opened = home_on()
        if opened: tidy_s23('A24')   # 판 시작 때 귀가 — S99 는 이 값으로 되돌린다(손으로 대신 켠 귀가도 끔 · 판 4 → 판 5) · 보려고 연 필터 창은 닫는다
        json.dump({k2: SNAP[k2] for k2 in ('user_filters', 'user_settings', 'filter_rows', 'mode', 'filter', 'home')}, open(START_FILE, 'w'), ensure_ascii=False, indent=1, default=list)
        log(f'📸 떠 둠({START_FILE}) — 필터 · 설정 · 모드 {SNAP["mode"]} · 목적지 {SNAP["filter"].get("destinationCity")} · 최저 {SNAP["filter"].get("minFare")}')
    elif k == 'mode':   # 모드 단추는 관제앱 폰 줄(«A24»)에 있다 — 필터 창 · 서랍이 가리면 못 찾으니 먼저 화면을 정리한다(108판 S05)
        if not DRY: tidy_s23('A24')
        run.set_mode(v)
    elif k == 'sim':   # «picker» 또는 {net · noReopen} — noReopen 이면 신호로 못 바꿀 때 다시 켜지 않고 ⚪
        if isinstance(v, dict): run.sim_open(v['net'], no_reopen=v.get('noReopen', False), fresh=v.get('fresh', False))
        else: run.sim_open(v)
    elif k == 'call': do_call(v)
    elif k == 'tap':
        tap(v)
        if v == 's23.filter.home.on' and not DRY: HOME_BY_SCRIPT[0] = True
    elif k == 'type':   # {tap · value} — 칸을 누르고 지운 뒤 숫자를 넣는다 · value «snapshot:minFare+1000» 은 S01 떠 둔 값에서
        val = v['value']
        if isinstance(val, str) and val.startswith('snapshot:'):
            m = re.match(r'snapshot:(\w+)([+-]\d+)?', val)
            if DRY: log(f'  ⌨️ {v["tap"]} ← {val}'); return
            val = int((SNAP.get('filter') or {}).get(m.group(1)) or 0) + int(m.group(2) or 0)
        if DRY: log(f'  ⌨️ {v["tap"]} ← {val}'); return
        tap(v['tap'])
        dev = A24 if TAPS[v['tap']]['phone'] == 'A24' else S23
        adb(dev, 'shell', 'input', 'keyevent', 'KEYCODE_MOVE_END')
        for _ in range(12): adb(dev, 'shell', 'input', 'keyevent', 'KEYCODE_DEL')
        adb(dev, 'shell', 'input', 'text', str(val)); log(f'⌨️ {v["tap"]} ← {val}'); time.sleep(1)
    elif k == 'keep_if_blue': keep_if_blue(v['binds'], v.get('sec', 90))
    elif k == 'decide': decide(v)   # 기사님이 고르는 자리 — 그 순간 판정 색으로(🔵 = 잡음) · 알람 · 직접은 손 확정 / 자동은 결재석 KEEP · 거절(실행서 5-1 · 71)   # 원달앱이 연 콜마다 판정 색 — 🔵 면 그 자리에서 확정 → KEEP → 닫기(기사님 «판정이 파랑이면 바로 잡는다» · 71)
    elif k == 'forget_seen': run.forget_seen(v or '판 시작')   # 원달앱 «본 콜» · «같은 길» 기억 비움 — 앞 판 회차보다 크게(82판)
    elif k == 'server_fresh':   # {sec · bootWindowMin} — R0 뒤 서버가 새로 섰나를 사실로(71 · 77판 «기동» 줄을 R0 가 먼저 찍어 놓침)
        server_fresh(v.get('sec', 120), v.get('bootWindowMin', 15))
    elif k == 'tidy_s23':   # S23 출발 화면 맞추기 — 펼친 필터 창 접기 · 열린 서랍 닫기(값은 안 바꿈) · 모드 줄 보임 확인(71 · 77판 S02)
        tidy_s23(v.get('mustSee', 'A24'))
    elif k == 'filter_revert_if_unsaved':   # 판이 남긴 «서버와 다른» 고친 값은 판이 치운다 — 💾 서버 저장 안 «저장 전»이 보이면 «되돌리기» → «저장 전» 사라짐 확인(71 · 관제앱 c0ba1918 저장 줄)
        if DRY: log('  ↩︎ 필터 💾 안 «저장 전»이면 되돌리기 → «저장 전» 사라짐 확인'); return
        tap('s23.filter.open')
        if s23_sees('저장 전'):
            tap('s23.filter.revert')
            end = time.time() + 5
            while time.time() < end and s23_sees('저장 전'): time.sleep(0.5)
            if s23_sees('저장 전'): raise ToolStop('⚪ 시험 도구 — 되돌리기 뒤에도 💾 안 «저장 전»이 보임')
            log('  ↩︎ 필터 고친 값 되돌림 — «저장 전» 사라짐')
        else: log('  필터 💾 안 «저장 전» 없음 — 되돌릴 것 없음')
    elif k == 'home_off_if_mine':   # 판 끝 귀가 — 이번 판에 스크립트가 켰을 때만 «↩️ 복귀 켬» 단추로 끈다 · 아니면 켜져 있어도 적기만(71 · 실행서 5-1)
        home_off_if_mine()
    elif k == 'set_filter':   # 시험용 필터로 맞춤 — 관제앱 «서버 저장»과 같은 길(소켓 update-filter + saveAsDefault) · 시작 필터가 무엇이든 시험이 같은 조건에서 돈다
        if DRY: log(f'  🎛️ 시험용 필터 {v} — 서버 저장'); return
        sm, am = srv_mark(), app_mark()
        before = run.app_filter()   # 보내기 전 원달앱 필터 — 이미 같으면 서버가 lastFilterJson 캐시로 다시 안 보낸다(filterManager.broadcastFilter) · 장면이 안 서면 S99 정리를 안 돌리는 게 설계라(기사님 «가») 판이 멈춘 채 다시 돌면 이미 같은 값일 수 있다
        def _eq(a, b):   # 9 와 9.0 처럼 같은 숫자를 글자 비교로 다르다고 보면 안 된다
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool): return float(a) == float(b)
            return a == b
        already_same = all(_eq(before.get(k2), v2) for k2, v2 in v.items() if k2 in before)
        log('🎛️ ' + run.sh('node', os.path.join(HERE, 'set_filter.mjs'), json.dumps(v, ensure_ascii=False), check=True).strip())
        wait_for('srv', sm, r'영구 설정\(baseFilter\) DB 저장 완료', 15, '서버 저장')
        if already_same: log('📭 원달앱 필터 이미 같음 — 서버가 다시 안 보냄(캐시) · «필터 도착» 기다림 건너뜀')
        else: wait_for('app', am, r'\[필터 도착\]|\[필터 바뀜\]', 20, '원달앱 필터 받음')
        bad = filter_diff(v)
        if bad: raise Stop(f'시험용 필터가 DB 에 다 안 들어감 — {bad}')
        note(CUR[0], f'DB 필터 {len(v)}칸 = 시험용', True, '같음')
        f = run.app_filter()
        log(f'🎛️ 시험용 필터 맞춤 — 원달앱 목적지 {f.get("destinationCity")} · 최저 {f.get("minFare")}')
    elif k == 'restore_filter':   # 판 끝 — S01 이 떠 둔 기사님 필터(목적지 · 제외 지역 · 최저)로 같은 길로 되돌린다
        start = (SNAP.get('filter') or {})
        row = start_row()
        if DRY: log('  🎛️ 시작 필터로 되돌림(목적지 · 제외 지역 · 최저)'); return
        if not row: raise ToolStop('⚪ 시험 도구 — 시작 필터 기록이 없음(S01 을 이번 판에 돌렸나)')
        back = filter_of_row(row)
        sm = srv_mark(); log('🎛️ ' + run.sh('node', os.path.join(HERE, 'set_filter.mjs'), json.dumps(back, ensure_ascii=False), check=True).strip())
        wait_for('srv', sm, r'영구 설정\(baseFilter\) DB 저장 완료', 15, '서버 저장')
        bad = filter_diff(back)
        if bad: raise Stop(f'시작 필터로 다 안 돌아감 — {bad}')
        log(f'🎛️ 시작 필터 {len(back)}칸으로 되돌림 — DB 와 같음'); RESTORED[0] = True
    elif k == 'restore_dest':   # 시작 목적지가 «이천시»가 아니었으면 UI 로 시작 값을 다시 골라 저장해야 한다(DB 에 직접 안 씀 · ef)
        start = (SNAP.get('filter') or {}).get('destinationCity')
        if start in (None, '이천시'): log(f'목적지 되돌림 필요 없음(시작 {start})'); return
        raise ToolStop(f'⚪ 시험 도구 — 시작 목적지 {start} 로 되돌릴 UI 단계가 아직 없음(목적지 고름 창 사진 뒤) — 71 에게: 관제웹에서 손으로 {start} 고르고 «💾 서버 저장»')
    elif k == 'tap_if_cod':
        if DRY: log(f'  👆? {v} (착불 콜이면)'); return
        t = TAPS.get(v, {})
        if t.get('text'):   # 착불 칸은 착불 콜일 때만 선다 — 그 글자 단추가 없으면 착불 아님으로 건너뜀
            r = json.loads(run.sh('node', os.path.join(HERE, 'find.mjs'), S23, t['text'], str(run.MENU_Y), check=False).strip().splitlines()[-1])
            if r['state'] == 'none': log(f'  착불 칸 없음(착불 아닌 콜) — 건너뜀'); return
            return tap_text(v, t)
        if t.get('x') is None: log(f'  착불 단추 좌표 없음 — 건너뜀'); return
        tap(v)
    elif k in ('keep', 'reject'): seat(k, v)
    elif k == 'keep_server': keep_server(v)
    elif k == 'mark_srv':   # 서버 기록 기준점을 지금으로 — 뒤 wait_srv 가 이 뒤에 선 줄만 본다(같은 줄이 장면 앞쪽에 먼저 찍혀도 헷갈리지 않게 · 105판 S02)
        if DRY: log('  📍 서버 기준점'); return
        PENDING['smark2'] = srv_mark()
    elif k == 'wait_srv':   # {re · sec} — mark_srv 뒤에 그 서버 줄이 서기를 기다림
        if DRY: log(f'  ⏳ srv «{v["re"]}» {v["sec"]}초(기준점 뒤)'); return
        wait_for('srv', PENDING.get('smark2') or srv_mark(), v['re'], v['sec'], v['re']); note(CUR[0], f'srv(기준점 뒤): {v["re"][:40]}', True, '섬')
    elif k == 'expect_app_filter':   # {칸: 값} — 원달앱이 받은 필터가 그 값이 될 때까지 20초 · 장면 가운데 확인(적용 뒤 · 저장 뒤)
        if DRY: log(f'  🔎 원달앱 필터 {v} 기다림'); return
        end = time.time() + 20
        while time.time() < end:
            f = run.app_filter()
            if all(f.get(k2) == v2 for k2, v2 in v.items()): break
            time.sleep(1)
        for k2, v2 in v.items(): note(CUR[0], f'원달앱 {k2} = {v2}', f.get(k2) == v2, f'원달앱 {f.get(k2)}')
    elif k == 'mode_net_matrix':   # 모드마다 · 배차망마다 목록 페이지에 들어가 원달앱이 받은 필터를 서버가 보낸 것과 견주고 칸별로 기록 · 끝은 알람 · 인성
        modes = v.get('modes') or ['AUTO', 'MANUAL', 'SIMULATION', 'ALARM']
        app_nets = app_networks(); sim_keys = sim_networks(); to_run = {x: y for y, x in run.SIM_CODE.items()}
        order = [c for c in app_nets if c != 'insung'] + (['insung'] if 'insung' in app_nets else [])
        for md in modes:
            if DRY: log(f'  🎛️ 모드 {md} → 배차망 {", ".join(order)} — 칸마다 원달앱 필터 = 서버'); continue
            run.set_mode(md)
            for c in order:
                if c not in sim_keys or c not in to_run: note(CUR[0], f'{md} · {c}', None, '⚪ 시뮬에 없음'); continue
                try:   # 한 칸이 막혀도 다음 칸 · 다음 모드로 — 모드마다 모든 배차망을 목록까지 다 본다
                    m = app_mark(); run.sim_open(to_run[c], no_reopen=True)
                    wait_for('app', m, f'타겟 앱 자동 전환 완료: {app_nets[c]}', 25, f'{md} · {c} 자동 전환')
                    if run.HOME_MISSED[0] == to_run[c]:
                        note(CUR[0], f'{md} · {c} 원달앱이 홈을 알아봄', False, f'🔴 원달앱이 {run.SIM_LABEL[to_run[c]]} 홈을 8초 안에 «페이지»로 못 알아봄 — 다음 칸을 보려고 시험 스크립트가 목록 단추를 눌러 넘김(판정은 🔴 그대로)')
                    wait_for('app', m, f'\\[페이지\\] {run.SIM_LABEL[to_run[c]]} .*→ LIST', 25, f'{md} · {c} 목록')
                    note(CUR[0], f'{md} · {c} 목록까지', True, '섬')
                except (Stop, ToolStop) as e:
                    note(CUR[0], f'{md} · {c} 목록까지', None if isinstance(e, ToolStop) else False, str(e)[:120]); continue
                time.sleep(2); f = run.app_filter()
                note(CUR[0], f'{md} · {c} 원달앱 필터', True,
                     f'목적지 {f.get("destinationCity")} · 최저 {f.get("minFare")} · 켜짐 {f.get("isActive")} · 키워드 {len(f.get("destinationKeywords") or [])} · 차종 {len(f.get("allowedVehicleTypes") or [])}')
    elif k == 'sim_all_nets':   # 배차망을 모두 차례로 — 목록은 상수가 아니라 원달앱 플러그인(code · label)과 시뮬 SIM_NET_LIST 에서 그때 읽는다 · 끝은 인성
        app_nets = app_networks(); sim_keys = sim_networks()
        to_run = {v: k for k, v in run.SIM_CODE.items()}   # 시뮬 코드 → 시험 스크립트 이름(kakaopicker → picker)
        order = [c for c in app_nets if c != 'insung'] + (['insung'] if 'insung' in app_nets else [])
        log(f'  🔀 원달앱 배차망 {", ".join(f"{c}({app_nets[c]})" for c in order)} · 시뮬 배차망 {", ".join(sim_keys)}')
        for c in order:
            if c not in sim_keys or c not in to_run:
                note(CUR[0], f'{c} 자동 전환', None, f'⚪ 시뮬에 «{c}» 배차망이 없음 — 원달앱 «{app_nets[c]}» 은 실물로만 확인'); continue
            if DRY: log(f'  🔀 시뮬 {c} → 원달앱 «자동 전환 완료: {app_nets[c]}» 20초'); continue
            m = app_mark(); run.sim_open(to_run[c], no_reopen=True)
            wait_for('app', m, f'타겟 앱 자동 전환 완료: {app_nets[c]}', 20, f'{c} 자동 전환')
            note(CUR[0], f'{c} 자동 전환', True, '섬')
    elif k == 'dashboard_fresh':   # 관제앱 다시 열기 — 서버를 다시 띄워도 관제앱은 옛 콜을 들고 있다 · 통계 띠(MorningCard «오늘은 닫기»)가 보이면 닫는다
        if DRY: log('  📱 S23 관제앱 닫았다 다시 열기 → «진행 중인 콜이 없습니다» 확인 → 통계 띠 보이면 «오늘은 닫기»'); return
        adb(S23, 'shell', 'am', 'force-stop', 'kr.co.onedal.dashboard'); time.sleep(2)
        adb(S23, 'shell', 'monkey', '-p', 'kr.co.onedal.dashboard', '-c', 'android.intent.category.LAUNCHER', '1', check=False)
        end = time.time() + 30
        while time.time() < end and not s23_sees('진행 중인 콜이 없습니다'): time.sleep(2)
        if not s23_sees('진행 중인 콜이 없습니다'): raise ToolStop('⚪ 관제앱을 다시 열었는데 30초 안에 «진행 중인 콜이 없습니다»가 안 보임')
        log('📱 관제앱 다시 엶 — «진행 중인 콜이 없습니다»')
        f = json.loads(run.sh('node', os.path.join(HERE, 'find.mjs'), S23, 'aria:오늘은 닫기', str(run.MENU_Y), check=False).strip().splitlines()[-1])
        if f.get('state') == 'ok':
            adb(S23, 'shell', 'input', 'tap', str(f['x']), str(f['y'])); time.sleep(2); log('📱 통계 띠 «오늘은 닫기»')
        else: log('📱 통계 띠 없음 — 안 누름')
    elif k == 'mark':   # 원달앱 기다림의 기준 줄을 지금으로 — 그 뒤에 선 줄만 본다(S16: 픽커로 바꾼 뒤의 «인성콜» 페이지)
        PENDING['amark'] = app_mark(); log('  📍 원달앱 기준 줄을 지금으로')
    elif k == 'wait_app': wait_for('app', PENDING.get('amark') or max(0, app_mark() - 200), sub(v['re']), v['sec'], v['re'])
    elif k == 'joystick':   # 하루 경로 한 벌(DAY) — start: 에이전트가 손으로 한 번 걸고 시험 스크립트가 집에서 일시정지 · stopAt: «재생» → S23 위치가 그곳 450m 앞이면 «일시정지»(뒤에서 지켜봄 · 집은 경로 끝이라 저절로 섬)
        r = SCEN['routes']['DAY']
        if v.get('start'):
            if DRY: log(f'  🟡 에이전트: JoyStick «{r["gpx"]}» 걸기(텔레포트 시작) → 시험 스크립트가 집에서 일시정지'); return
            log(f'🟡 에이전트: JoyStick «경로 설정 → {r["gpx"]} → 도착시 멈춤 · 텔레포트 시작 → 시작» — 집으로 뛰면 시험 스크립트가 일시정지')
            g = __import__('g'); P = SCEN['places'][r['stops'][0]]; end = time.time() + 900   # JoyStick 시작 전 광고가 6~9분 걸린 적 있어(110판) 5분 → 15분
            while time.time() < end:   # 집 300m 안에 mock 위치가 서면 곧바로 — 움직임 확인을 먼저 하면 그 사이 집을 지나친다
                f = g.fused_last(); xy = g._latlng(f)
                if 'mock' in f and xy and g._dist_m(xy, (P[3], P[2])) < 300: break
                time.sleep(1)
            else: raise ToolStop('⚪ 시험 도구 — 15분 안에 JoyStick 위치가 집으로 안 옴(경로 걸기 확인)')
            adb(S23, 'shell', 'monkey', '-p', 'kr.co.onedal.dashboard', '-c', 'android.intent.category.LAUNCHER', '1'); time.sleep(1.5)   # JoyStick 화면이 앞이면 tap_if 가 막는다 — 관제앱을 먼저 앞으로
            for _ in range(4):   # 경로를 건 직후에는 띠가 늦게 뜬다 — ❚❚ 를 3초 간격으로 다시 찾는다 · 이미 서 있으면(▶ 보임) 안 누른다
                if joy_find(TAPS['joy.play']['color']): break
                try: joy_tap('joy.pause'); break
                except Stop: time.sleep(3)
            joy_still('집')
            bad = [f for f in (g.fused_last() for _ in range(5)) if 'mock' not in f]
            if bad: raise ToolStop(f'⚪ 시험 도구 — 위치 섞임(진짜 fused {len(bad)}/5)')
            return
        stop = v['stopAt']
        if DRY: log(f'  ▶️ JoyStick 재생 → ' + (f'{stop} 450m 앞에서 일시정지' if stop != r['stops'][-1] else '경로 끝(집)에서 저절로 섬')); return
        if joy_find(TAPS['joy.pause']['color']): log('▶ 안 누름 — 띠에 ❚❚ 가 보임(이미 달리는 중)')
        else: joy_tap_wait('joy.play')
        if not joy_moving():   # 경로를 건 직후 JoyStick 이 한 번 더 스스로 서는 버릇 — ▶ 가 아직 보이면 한 번 더 누른다(이미 달리면 ▶ 대신 ❚❚ 라 못 찾음 → 건너뜀)
            log('▶ 눌렀는데 10초 안에 안 움직임 — 한 번 더')
            try: joy_tap_wait('joy.play')
            except Stop: pass
            if not joy_moving(): raise ToolStop(f'⚪ 시험 도구 — ▶ 를 두 번 눌러도 S23 위치가 안 움직임({stop} 가는 길)')
        __import__('g').mock_guard(f'DAY → {stop}')
        if v.get('wait'):   # 설 때까지 기다림 — 선 뒤에 할 일이 있는 장면(S20: 곤지암 765 지나 서서 C7 넣기 · 집에 닿은 뒤 하차 확인) · 없으면 뒤에서 지켜보고 다음 줄로(S11 · S12 처럼 달리며 할 일)
            if stop == r['stops'][-1]: joy_arrive_end(SCEN['places'][stop])
            elif not joy_pause_near(stop, strict=True): raise ToolStop(f'⚪ 시험 도구 — {stop} 앞에서 일시정지 못 함(위 줄 참고)')
        elif stop != r['stops'][-1]: threading.Thread(target=joy_pause_near, args=(stop,), daemon=True).start()
    elif k == 'ble':
        adb(A24, 'shell', 'cmd', 'bluetooth_manager', 'enable' if v == 'on' else 'disable'); log(f'A24 블루투스 {v}')
    elif k == 'sleep': time.sleep(v)
    elif k == 'photo': shot(A24 if v == 'A24' else S23, f'day_{CUR[0]}')
    elif k == 'restore': restore()
    else: raise ToolStop(f'⚪ 시험 도구 — 모르는 동작 «{k}»')
CUR = ['']

JOY_STOP, JOY_BACK = (244, 67, 54), (33, 150, 243)   # 띠의 빨간 ■ 과 그 오른쪽 약 230픽셀의 파란 ◀◀ — 띠를 알아보는 표지

def joy_find(color, y0=300, y1=1600, step=3, tol=30):
    """JoyStick 가로 띠 안에서 그 색(▶ 초록 · ❚❚ 노랑) 덩어리의 가운데 — 띠는 끌어 옮길 수 있어 자리를 고정하지 않는다.
       먼저 «빨간 ■ 오른쪽 200~260픽셀에 파란 ◀◀» 인 자리를 띠로 잡고, 찾는 색은 그 줄 안(■ 와 ◀◀ 사이)에서만 본다 — 지도 위 비슷한 색(길 · 표지)을 안 잡게.
       폰 안에서 찍은 원본(raw)에서 y0~y1 줄만 한 번에 받는다(무선 adb 로 전체 png 를 받아 풀면 느림) · 아래 단계 시트(높이 약 1780)는 범위 밖"""
    adb(S23, 'shell', 'screencap', '/data/local/tmp/joy.raw')
    w = int(adb(S23, 'shell', 'dd if=/data/local/tmp/joy.raw bs=4 count=1 2>/dev/null | od -An -tu4').split()[0])
    off, n = 16 + y0 * w * 4, (y1 - y0) * w * 4
    raw = subprocess.run(['adb', '-s', S23, 'exec-out', f'tail -c +{off + 1} /data/local/tmp/joy.raw | head -c {n}'], capture_output=True, timeout=30).stdout
    rows = len(raw) // (w * 4)
    at = lambda x, y: raw[(y * w + x) * 4:(y * w + x) * 4 + 3]
    near = lambda c, want: all(abs(c[i] - want[i]) < tol for i in range(3))
    bar = [(x, y) for y in range(0, rows, step) for x in range(0, w - 260, step)
           if near(at(x, y), JOY_STOP) and any(near(at(x + d, y), JOY_BACK) for d in range(200, 261, 3))]
    if len(bar) < 5: return None
    bx, by = sorted(b[0] for b in bar)[len(bar) // 2], sorted(b[1] for b in bar)[len(bar) // 2]
    hits = [(x, y) for y in range(max(0, by - 40), min(rows, by + 40)) for x in range(bx, min(w, bx + 230))
            if near(at(x, y), color)]
    if len(hits) < 10: return None
    xs, ys = sorted(h[0] for h in hits), sorted(h[1] for h in hits)
    return xs[len(xs) // 2], y0 + ys[len(ys) // 2]

def joy_tap(name):   # JoyStick 경로 띠(가로 띠 · 설정 «조이스틱 유형»)의 ❚❚/▶ — 화면에서 그 색 덩어리를 찾아 누른다 · 색은 taps.json · 못 찾으면 안 누르고 멈춤(실행기가 사람 몫으로 넘김)
    t = TAPS[name]; run.guard(S23)
    at = joy_find(t['color'])   # ▶ · ❚❚ 만 쓰면 띠는 늘 떠 있다 — ■(중단)를 누르거나 경로가 끝나야 사라진다(기사님) · 펼치려고 다른 아이콘을 누르지 않는다(헛누름)
    if not at: shot(S23, f'nofind_{name}'); raise Stop(f'«{t["say"]}» 를 화면의 경로 띠에서 못 찾음(경로가 끝났거나 ■ 로 멈춤) — 안 누르고 멈춤')
    adb(S23, 'shell', 'input', 'tap', str(at[0]), str(at[1])); log(f'👆 {t["say"]} ({at[0]},{at[1]}) — 색으로 찾음')

def joy_tap_wait(name, limit_s=1800):
    """JoyStick ▶/❚❚ 를 누른다 — 못 찾으면(광고 · Play 스토어 창 · 띠 가림) 넘어가지 않고 사진 찍고 기사님을 불러 기다린다(기사님: «못 찾았으면 나에게 이야기하고 대기»)
       화면이 관제앱으로 돌아오고 그 단추가 다시 보이면 3초 안에 눌러 이어 간다 · 한도를 넘기면 ⚪"""
    try: return joy_tap(name)
    except Stop as e: why = str(e)
    t = TAPS[name]; log(f'  ⏳ 기사님: [S23] JoyStick «{t["say"]}» 를 못 찾음 — {why} · 화면을 관제앱(경로 띠 보임)으로 돌려 주시면 이어 감')
    end = time.time() + limit_s
    while time.time() < end:
        time.sleep(3)
        if 'kr.co.onedal.dashboard' in run.focus_of(S23) and joy_find(t['color']): log(f'  ▶ 다시 보임 — 이어 감'); return joy_tap(name)
    raise ToolStop(f'⚪ 시험 도구 — {limit_s}초 안에 JoyStick «{t["say"]}» 가 다시 안 보임')

def joy_moving(sec=10, m=30):   # ▶ 가 먹었나 — sec 초 안에 mock 위치가 m 넘게 움직이면 참
    g = __import__('g'); a = g._latlng(g.fused_last()); end = time.time() + sec
    while time.time() < end:
        time.sleep(2); b = g._latlng(g.fused_last())
        if a and b and g._dist_m(a, b) > m: return True
    return False

def joy_off_at_end():
    """경로 끝에 선 뒤 JoyStick 을 끈다 — 끝에서 왼쪽 세로 메뉴를 저절로 펼쳐 관제앱 손짓을 막는다(판 10 · 12 S21) · 파란 단추는 안 누른다(판 8)
       끈 뒤에도 마지막 모의 위치가 «마지막 위치»로 남아 위치가 튀지 않는다(S01 · S99 에서 확인) · S99 가 어차피 끄는 앱"""
    time.sleep(3); adb(S23, 'shell', 'am', 'force-stop', 'com.theappninjas.fakegpsjoystick')
    adb(S23, 'shell', 'monkey', '-p', 'kr.co.onedal.dashboard', '-c', 'android.intent.category.LAUNCHER', '1', check=False); time.sleep(2)
    log('  ⏹ 경로 끝 — JoyStick 끔(메뉴가 손짓을 막지 않게) · 관제앱 앞으로')

def joy_arrive_end(P, limit_s=1800):   # 경로 끝(집)에 닿아 «도착시 멈춤»으로 설 때까지 — 100m 안 + 5초 사이 30m 안
    g = __import__('g'); to = (P[3], P[2]); end = time.time() + limit_s; idle = 0
    while time.time() < end:
        a = g._latlng(g.fused_last())
        if not (a and g._dist_m(a, to) < 100):   # 끝이 아닌데 JoyStick 이 서 있으면(▶ 보임) 영영 안 닿는다 — 15초 넘으면 곧바로 멈춘다(판 8: 30분 헛기다림)
            idle = idle + 2 if joy_find(TAPS['joy.play']['color']) else 0
            if idle >= 15: raise ToolStop(f'⚪ 시험 도구 — JoyStick 이 서 있는데 {P[0].split()[-1]} 가 아님(누가 세웠거나 경로가 끝남)')
        if a and g._dist_m(a, to) < 100:   # 경로 끝 점은 집에서 17m — 사람 · hold_drive 가 끝 근처에서 세운 것을 «끝»으로 읽지 않게 좁게
            time.sleep(5); b = g._latlng(g.fused_last())
            if b and g._dist_m(a, b) < 30:
                log(f'⏹ JoyStick 경로 끝 — {P[0].split()[-1]}에 섬'); joy_off_at_end(); return
        time.sleep(2)
    raise ToolStop(f'⚪ 시험 도구 — {limit_s}초 안에 경로 끝({P[0].split()[-1]})에 안 섬')

def joy_still(where, sec=15):   # 일시정지가 먹었나 — 5초 사이 mock 위치가 30m 안이면 섬
    g = __import__('g'); end = time.time() + sec
    while time.time() < end:
        a = g._latlng(g.fused_last()); time.sleep(5); b = g._latlng(g.fused_last())
        if a and b and g._dist_m(a, b) < 30: log(f'⏸ JoyStick 일시정지 — {where}에 섬'); return
    raise ToolStop(f'⚪ 시험 도구 — 일시정지를 눌렀는데 {sec}초 안에 안 섬({where})')

JOY_LOCK = __import__('threading').Lock()   # ❚❚/▶ 는 한 단추라 두 길(목표 앞 감시 · 실행기 사람 기다림)이 겹쳐 누르면 두 번 눌려 도로 달린다 — 상태 보기와 누르기를 이 자물쇠 안에서 한 번에

def joy_pause_near(stop, near_m=450, limit_s=1800, strict=False):   # 뒤에서 지켜보다 그곳 450m 앞에서 일시정지 — 200km/h 면 1초에 55m · 누르는 사이 지나가도 서버 도착 500m 안
    g = __import__('g'); P = SCEN['places'][stop]; to = (P[3], P[2]); end = time.time() + limit_s
    try:
        idle = 0
        while time.time() < end:
            xy = g._latlng(g.fused_last())
            if strict and not (xy and g._dist_m(xy, to) < near_m):   # 기다림 줄 — 목표 앞이 아닌데 서 있으면 15초 안에 멈춤(뒤 감시는 사람 기다림 동안 세운 것일 수 있어 안 봄)
                idle = idle + 1 if joy_find(TAPS['joy.play']['color']) else 0
                if idle >= 15: log(f'🔴 시험 도구 — JoyStick 이 서 있는데 {stop} 앞이 아님(누가 세웠거나 경로가 끝남)'); return False
            if xy and g._dist_m(xy, to) < near_m:
                with JOY_LOCK:
                    if joy_find(TAPS['joy.pause']['color']): joy_tap_wait('joy.pause')
                joy_still(P[0].split()[-1]); return True
            time.sleep(1)
        log(f'🔴 시험 도구 — {limit_s}초 안에 {stop} 450m 앞에 안 옴 · 일시정지 안 누름')
    except Exception as e: log(f'🔴 시험 도구 — {stop} 일시정지 실패: {e}')

def checks(step, ck):
    if DRY or not ck: return
    for k, v in ck.items():
        if k == 'app_filter':
            f = run.app_filter()
            for fk, fv in v.items():
                if isinstance(fv, str) and fv.startswith('snapshot'):   # «snapshot» · «snapshot+1000» — S01 떠 둔 값에서
                    m = re.match(r'snapshot([+-]\d+)?', fv); want = int(SNAP.get('filter', {}).get(fk) or 0) + int(m.group(1) or 0)
                else: want = fv
                note(step, f'원달앱 {fk} = {want}', f.get(fk) == want, f'원달앱 {f.get(fk)}')
        elif k == 'db_same_as_snapshot':
            with sqlite3.connect(run.DB) as c:
                for t in v:
                    same = [list(r) for r in c.execute(f'SELECT * FROM {t}').fetchall()] == [list(r) for r in (SNAP.get(t) or [])]   # 판 상태 파일로 되살리면 줄이 tuple 이 아니라 list
                    note(step, f'{t} = 시작 때', same, '같음' if same else '다름 — 71 에게(되돌릴 값은 장부 사진)')
        elif k == 'not_server':
            t = srv_since(STEP_MARK[0]); note(step, f'안 섬: {sub(v)}', not re.search(sub(v), t), '안 섬' if not re.search(sub(v), t) else '섬')
        elif k == 'via' and not DRY and any(b not in BIND for b in v):   # 못 잡은 콜은 빼고 본다
            missing = [b for b in v if b not in BIND]; note(step, '지나침/도착', None, f'{", ".join(missing)} 콜이 이번 판에 없음 — 그 콜은 안 봄')
            v = {b: m for b, m in v.items() if b in BIND}
            if v: checks(step, {'via': v})
        elif k == 'via':
            t = srv_since(STEP_MARK[0])
            for b, want in v.items():
                oid = BIND.get(b, '?'); via = '지나침' if re.search(r'\[지나침\] 하차지[^\n]*' + oid, t) else ('도착 감지' if re.search(r'하차지 도착\] ' + oid, t) else '안 섬')
                note(step, f'{b} 하차 {want}', via == want, f'{via}로 섬(기대 {want})')
        elif k == 'app_filter_eq_server':
            t = srv_since(STEP_MARK[0]); f = run.app_filter()
            nk = re.findall(r'destinationKeywords (\d+)개', t); ld = re.findall(r'추가 가능 차종: \[([^\]]*)\]', t)
            car = [x.strip() for x in ld[-1].split(',') if x.strip()] if ld else None
            note(step, '원달앱 필터 = 서버가 보낸 것', bool(nk) and len(f.get('destinationKeywords') or []) == int(nk[-1]) and car == [x.strip() for x in (f.get('allowedVehicleTypes') or [])], f'키워드 {len(f.get("destinationKeywords") or [])}/{nk[-1] if nk else "?"} · 차종 {f.get("allowedVehicleTypes")}/{car}')
        elif k == 'count_server':   # {정규식: 번수} — 단계 안에서 정확히 그만큼
            t = srv_since(STEP_MARK[0])
            for rx, n in v.items():
                got = len(re.findall(sub(rx), t)); note(step, f'«{rx[:30]}» {n}번', got == n, f'{got}번')
        elif k == 'first_open':   # [이름 …] — 그 콜들 가운데 원달앱이 먼저 연 것을 적기만(판정 아님 · 71)
            t = app_since(PENDING['amark'])
            at = {b: (t.find(f'상세 진입] {FARES[b]}원') if b in FARES else -1) for b in v}
            seen = sorted([b for b in v if at[b] >= 0], key=lambda b: at[b])
            note(step, '원달앱이 먼저 연 콜(기록만)', True, ' → '.join(f'{b} {FARES[b]}원' for b in seen) or '이 단계 안에 연 콜 없음')
        elif k == 'none_app':   # [정규식] — 단계 안 원달앱 기록에 안 섬
            t = app_since(PENDING['amark'])
            for rx in v: note(step, f'원달앱 안 섬: {rx[:30]}', not re.search(sub(rx), t), '안 섬' if not re.search(sub(rx), t) else '섬')
        elif k == 'app_last':   # {re · want} — 원달앱 오늘 기록에서 그 줄의 마지막 값
            # 폰 grep 은 \S · \w 를 모른다(79판 S02 — 줄이 있는데 None) — 오늘 기록 뒤쪽을 받아 PC 쪽 정규식으로 마지막 줄을 본다
            key = max(re.split(r'[\\\[\]().*+?|^$]|\\[A-Za-z]', v['re']), key=len).strip()   # 정규식 안 가장 긴 글자 토막(예 «공급 연결» · «모드 테두리»)
            t = adb(A24, 'shell', f"grep -F '{key}' {run.APP_LOG} | tail -200", check=False)
            ms = re.findall(v['re'], t); got = ms[-1] if ms else None
            note(step, f'원달앱 마지막 «{v["re"][:24]}» = {v["want"]}', got == v['want'], str(got))
        elif k == 'server_last':
            with open(run.SRV_LOG, encoding='utf8', errors='ignore') as f: ms = re.findall(v['re'], f.read())
            got = ms[-1] if ms else v.get('default')
            note(step, f'서버 마지막 «{v["re"][:24]}» = {v["want"]}', got == v['want'], str(got))
        elif k == 'server_last_set':   # {re · want: [..]} — 서버 마지막 줄 값을 « ∪ »로 나눈 모음 = want 모음(차례 무관 — 필터는 두 모음뿐 · 71)
            with open(run.SRV_LOG, encoding='utf8', errors='ignore') as f: ms = re.findall(v['re'], f.read())
            got = sorted(x.strip() for x in ms[-1].split('∪')) if ms else None
            note(step, f'서버 마지막 «{v["re"][:24]}» 모음 = {" · ".join(sorted(v["want"]))}', got == sorted(v['want']), ' · '.join(got) if got else '없음')
        elif k == 'app_filter_city':
            f = run.app_filter(); city = f.get('destinationCity')
            bad = [x for x in (f.get('excludedKeywords') or []) if v['city'].rstrip('시') in x]
            note(step, f'원달앱 목적지 {v["city"]}', city == v['city'], str(city))
            note(step, f'제외에 {v["city"]} 없음', not bad, '없음' if not bad else ' · '.join(bad[:5]))
        elif k == 's23_no_mock':   # JoyStick 이 꺼졌나 — fused 마지막 줄에 mock 이 안 붙을 때까지(9e 가 끄는 시간)
            g = __import__('g'); end = time.time() + v.get('sec', 180); f = g.fused_last()
            while 'mock' in f and time.time() < end: time.sleep(5); f = g.fused_last()
            note(step, 'S23 가짜 위치 꺼짐(mock 0)', 'mock' not in f, f[:80])
        elif k == 's23_no_net_location':   # «Google 위치 정확도» 꺼짐 — 켜져 있으면 와이파이 · 기지국 위치가 JoyStick 사이에 끼어 도착이 안 선다(판 2 · 3) · 위치 기록의 network provider 가 enabled=false
            t = adb(S23, 'shell', 'dumpsys', 'location', check=False)
            m = re.search(r'network provider:(?:\n(?![^\n]*provider:)[^\n]*?){0,8}?\n\s*enabled=(\w+)', t)   # 그 provider 칸 안의 첫 enabled= (다른 provider 칸으로 넘어가지 않음)
            note(step, 'S23 «Google 위치 정확도» 꺼짐', (m.group(1) == 'false') if m else None, f'network provider enabled={m.group(1)}' if m else '⚪ 위치 기록 모양을 모름(network provider 칸의 enabled= 를 못 찾음)')
        elif k == 'app_pickup_has':   # 원달앱이 받은 상차 목록(pickupKeywords)에 그 동이 있나 — 콜을 넣기 전에 «상차 목록 밖»으로 헛 ⚪ 가 날 자리를 가린다(판 6 · 7 C7) · 서버 상차 목록 줄은 곳 수만 찍어 못 씀
            end = time.time() + v.get('sec', 30); kws = []
            while time.time() < end:
                kws = run.app_filter().get('pickupKeywords') or []
                if v['dong'] in kws: break
                time.sleep(2)
            note(step, f'원달앱 상차 목록에 {v["dong"]}', v['dong'] in kws, f'{len(kws)}곳' + ('' if v['dong'] in kws else ' — 없음'))
        elif k == 's23_joy_off':   # JoyStick 이 꺼졌나 — 프로세스로 본다(끈 뒤에도 마지막 위치는 진짜 위치가 들어오기 전까지 mock 으로 남는다 · 판 4 S99)
            pid = adb(S23, 'shell', 'pidof', 'com.theappninjas.fakegpsjoystick', check=False).strip()
            note(step, 'S23 JoyStick 꺼짐(프로세스 없음)', not pid, f'pid {pid}' if pid else '없음')
        elif k == 'web_drive':
            t = srv_since(SMARK.get('C1', STEP_MARK[0])); dv = re.findall(r'주행판정\] ([^\n]*)', t)   # 운행 중은 첫 출발에 한 번 — 첫짐을 잡은 때부터 센다
            note(step, '관제웹 «운행 중»', any('→ drive' in d or d.startswith('drive') for d in dv), ' | '.join(d[:30] for d in dv) or '주행판정 줄 0')
STEP_MARK = [0]
STOOD, ATTEMPTED = set(), set()   # 이번 판에 선 장면 · 돌리려 한 장면
STATE = os.path.join(HERE, 'out', 'day_state.json')   # 판 상태 — 막힌 장면부터 --from 으로 이어 갈 때 읽는다(71 · 기사님 «가»)

def save_state():
    if DRY: return
    st = {'BIND': BIND, 'FARES': FARES, 'DROPS': DROPS, 'CMARK': CMARK, 'SMARK': SMARK, 'SNAP': SNAP, 'STOOD': sorted(STOOD),
          'HOME_BY_SCRIPT': HOME_BY_SCRIPT[0], 'RUN_MARK': RUN_MARK[0], 'PENDING': {k: PENDING[k] for k in ('bind', 'mark', 'drop', 'fare', 'cmark') if k in PENDING},
          'RUN_ID': os.environ.get('RUN_ID'), 'at': datetime.datetime.now().isoformat(timespec='seconds')}
    json.dump(st, open(STATE, 'w'), ensure_ascii=False, indent=1, default=list)

def load_state():
    """--from 으로 이어 갈 때 — 앞 장면이 묶은 콜 번호 · 요금 · 하차 동 · 기록 자리 · 시작 사진 · 선 장면을 되살린다(없으면 앞 장면 콜 없음 ⚪)"""
    try: st = json.load(open(STATE))
    except Exception: log('⚠️ 판 상태 파일 없음 — 앞 장면이 묶은 콜은 모름'); return
    for d, k in ((BIND, 'BIND'), (FARES, 'FARES'), (DROPS, 'DROPS'), (CMARK, 'CMARK'), (SMARK, 'SMARK'), (SNAP, 'SNAP'), (PENDING, 'PENDING')): d.update(st.get(k) or {})
    STOOD.update(st.get('STOOD') or []); HOME_BY_SCRIPT[0] = bool(st.get('HOME_BY_SCRIPT')); RUN_MARK[0] = st.get('RUN_MARK')
    log(f'📂 판 상태 되살림 — {st.get("RUN_ID")} {st.get("at")} · 묶은 콜 {", ".join(f"{k}={v}" for k, v in BIND.items()) or "없음"} · 선 장면 {len(STOOD)}개')

PROGRESS_DIR = os.path.join(HERE, 'out', 'progress')   # 판마다 파일 하나 — plan.html 이 progress.json 을 1초마다 다시 읽어 체크박스를 켠다
PROGRESS_LATEST = os.path.join(PROGRESS_DIR, 'progress.json')   # 화면이 늘 같은 이름으로 fetch
PROGRESS = [None]   # None = 이번 실행은 기록 안 함(--dry 등)
PREV_SCENES = {}    # 판 시작 전 progress.json 에 있던 덜 끝난 장면 — 판 전에 장면 표에서 눌러 둔 손 줄을 이어받는다

def read_latest():
    try: return json.load(open(PROGRESS_LATEST))
    except Exception: return None

def save_progress():
    """장면 표에서 사람이 누른 체크(dev 서버가 같은 파일에 적음)를 덮지 않는다 — 손 줄(handIdx)은 파일이 이기고,
    day.py 가 적는 줄은 day.py 가 아직 안 적은 자리만 파일 값을 받는다"""
    if PROGRESS[0] is None: return
    disk = read_latest()
    if disk and disk.get('file') == PROGRESS[0]['file']:
        by = {sc['id']: sc for sc in disk.get('scenes', [])}
        for sc in PROGRESS[0]['scenes']:
            d = by.get(sc['id'])
            if not d or len(d.get('steps', [])) != len(sc['steps']): continue
            hand = sc.get('handIdx')   # 없으면 day.py 가 아직 시작 안 한 장면 — 줄 전부 사람 몫
            for i, v in enumerate(d['steps']):
                if hand is None or i in hand or (sc['steps'][i] is None and v is not None): sc['steps'][i] = v
    for p in (PROGRESS[0]['file'], PROGRESS_LATEST):
        json.dump(PROGRESS[0], open(p, 'w'), ensure_ascii=False, indent=1, default=list)

def start_progress(run_id, started):
    if DRY: return
    os.makedirs(PROGRESS_DIR, exist_ok=True)
    old_latest = read_latest() or {}
    PREV_SCENES.update({sc['id']: sc for sc in old_latest.get('scenes', []) if not sc.get('done')})
    f = os.path.join(PROGRESS_DIR, f'{started:%Y%m%d_%H%M%S}_{run_id}.json')
    # 덜 끝난 장면(판 전에 장면 표에서 누른 손 줄)을 새 기록에 바로 옮긴다 — 장면이 시작되기 전에 화면에서 체크가 사라지지 않게
    PROGRESS[0] = {'file': f, 'run_id': run_id, 'started': started.isoformat(timespec='seconds'),
                   'scenes': [{k: v for k, v in sc.items() if k != 'handIdx'} for sc in PREV_SCENES.values()]}
    save_progress()
    old = sorted(p for p in glob.glob(os.path.join(PROGRESS_DIR, '*.json')) if p not in (PROGRESS_LATEST, f))
    for p in old[:-4]: os.remove(p)   # 방금 만든 파일 + 지난 4개 = 5개만 남긴다(방금 파일은 후보에서 뺌 — 이름 정렬에 안 기댐)

def progress_scene_start(s):
    """장면 하나를 시작 — plan.html 의 <ol> 과 같은 전체 줄 수(사람이 미리 하는 것 · 명령 자체 · do 항목 ·
    설명서대로 손 · 사람이 나중에 하는 것 · 결과 알림)만큼 ⬜(None)을 만들어 둔다. 무엇을 했다는 말은 안
    담는다 — plan.html 이 day1.json 을 labels.js 의 sceneRows() 로 다시 풀어 쓴다"""
    if PROGRESS[0] is None: return
    pre, do, post = s.get('agentPre', []), s.get('do', []), s.get('agentPost', [])
    or_hand = [w for w in s.get('wait', []) if w.get('orHand')]
    do_start = len(pre) + 1
    or_hand_start = do_start + len(do)
    total = or_hand_start + len(or_hand) + len(post) + 1
    steps = [None] * total
    steps[len(pre)] = True   # 명령 자체 — 이 장면이 지금 실제로 돌고 있으니 참
    post_start = or_hand_start + len(or_hand)
    hand_idx = list(range(len(pre))) + list(range(post_start, post_start + len(post)))   # day.py 가 안 하는 줄 — 사람이 장면 표에서 누른다
    scenes = PROGRESS[0]['scenes']
    prev = next((x for x in scenes if x['id'] == s['id']), None)   # 판을 열 때 옮겨 둔 장면 — 사람이 누른 손 줄을 이어받고 자리를 넘긴다
    if prev:
        if len(prev.get('steps', [])) == total:
            for i in range(len(pre)): steps[i] = prev['steps'][i]
        scenes.remove(prev)
    scenes.append({'id': s['id'], 'done': False, 'ok': None, 'doStart': do_start,
                                   'orHandStart': or_hand_start, 'handIdx': hand_idx, 'steps': steps})
    save_progress()

def progress_step(i, ok):
    if PROGRESS[0] is None: return
    sc = PROGRESS[0]['scenes'][-1]; sc['steps'][sc['doStart'] + i] = ok
    save_progress()

def progress_or_hand(j, ok):
    if PROGRESS[0] is None: return
    sc = PROGRESS[0]['scenes'][-1]; sc['steps'][sc['orHandStart'] + j] = ok
    save_progress()

def progress_scene_done(ok):
    if PROGRESS[0] is None: return
    sc = PROGRESS[0]['scenes'][-1]; sc['done'] = True; sc['ok'] = ok; sc['steps'][-1] = ok
    save_progress()

def restore():
    if SNAP.get('mode') and run.supplied_mode() != SNAP['mode']: run.set_mode(SNAP['mode'])
    if RESTORED[0] and os.path.exists(START_FILE) and (not SNAP.get('mode') or run.supplied_mode() == SNAP['mode']):
        os.remove(START_FILE); log(f'📸 필터 · 모드를 시작 값으로 되돌림 — {START_FILE} 지움(다음 판 S01 이 새로 뜸)')
    log('🟡 9e: JoyStick «중단» → 앱 완전 종료 · S23 dumpsys 로 mock 없음 확인')

def build_routes():
    """경로 GPX — 서버 POST /api/sim/route(개발 빌드 · 카카오 구간마다 1번)로 points 를 잇고 legs 를 이어 쓴다 · 파일이 있으면 안 만듦(카카오 다시 안 부름)"""
    for leg, r in SCEN['routes'].items():
        if leg == 'how': continue
        path = os.path.join(HERE, r['gpx'])
        if os.path.exists(path): log(f'{leg} {r["gpx"]} 있음 — 그대로'); continue
        pts = [{'x': PLACES[k][2], 'y': PLACES[k][3]} for k in r['points']]
        res = json.load(urllib.request.urlopen(urllib.request.Request('http://localhost:4000/api/sim/route', json.dumps({'points': pts}).encode(), {'Content-Type': 'application/json'}), timeout=60))
        line = [p for lg in res['legs'] for p in lg]
        if any(not lg for lg in res['legs']): log(f'⚠️ {leg} 비어 있는 구간 — {res.get("legInfo")}')
        with open(path, 'w', encoding='utf8') as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="onedal day.py"><trk><name>' + leg + '</name><trkseg>\n')
            for p in line: f.write(f'<trkpt lat="{p["y"]:.6f}" lon="{p["x"]:.6f}"></trkpt>\n')
            f.write('</trkseg></trk></gpx>\n')
        log(f'🗺️ {leg} {r["gpx"]} — 점 {len(line)} · {res.get("distance", 0) / 1000:.1f}km · 9e: S23 Download 로 넣기(adb push)')

def main():
    if '--routes' in sys.argv: build_routes(); return
    steps = SCEN['steps']
    if arg('--from'): steps = steps[[s['id'] for s in steps].index(arg('--from')):]
    if arg('--only'): steps = [s for s in steps if s['id'] in arg('--only').split(',')]
    last = [] if '--no-cleanup' in sys.argv else [s for s in SCEN['steps'] if s.get('always')]   # 한 장면씩 돌릴 때는 끝 정리(S99)를 붙이지 않는다
    started = datetime.datetime.now(); stop_all = False; halted = None
    start_progress(os.environ.get('RUN_ID', '판 이름 없음'), started)
    # 📂 S01(판 시작)이 빠진 실행이면 앞 실행의 판 상태(묶은 콜 · 시작 기록 SNAP)를 되살린다 — 한 장면씩(--only) 돌릴 때도(102판 S03: 시작 최저 6000 을 몰라 «0 + 1000» 으로 셈)
    if (arg('--from') or arg('--only')) and 'S01' not in [x['id'] for x in steps] and not DRY: load_state()
    # ⛔ --failed S09,… — 그 장면은 안 섰다고 치고(제품 🔴 로 기록됨) 기대는 뒤 장면은 ⚪ «앞 장면 없음»으로 넘긴다 · 판은 안 세운다(71 «최대한 진행»)
    if arg('--stood'):   # 도구가 멈춘 뒤 설명서대로 손으로 마친 장면 — 선 것으로 치고 뒤 장면이 기댄다(93판 S14)
        for x in arg('--stood').split(','): STOOD.add(x); ATTEMPTED.add(x)
        log(f'✋ 손으로 마친 장면으로 침: {arg("--stood")}')
    if arg('--unbind'):   # 그 콜은 이번 판에 없는 것으로(설명서 주의대로 손을 했어야 하는데 장면이 손을 안 넣은 콜 — 93판 S13 C2)
        for b in arg('--unbind').split(','):
            if BIND.pop(b, None): log(f'⛔ {b} 를 이번 판에 없는 것으로 침(--unbind)')
    if arg('--failed'):
        for x in arg('--failed').split(','):
            STOOD.discard(x); ATTEMPTED.add(x)
            for st in SCEN['steps']:   # 안 선 장면이 묶은 콜도 이번 판에 없는 것으로 — 서버가 미리보기로 치운 콜을 기다리지 않게(92판 S13)
                if st['id'] == x:
                    for d in st.get('do', []):
                        b = (d.get('call') or {}).get('bind') or (d.get('decide') or {}).get('bind')
                        if b and BIND.pop(b, None): log(f'⛔ {x} 의 {b} 를 이번 판에 없는 것으로 침')
        log(f'⛔ 안 선 것으로 침: {arg("--failed")} — 기대는 장면은 앞 장면 없음으로 넘김')
    partial = bool(arg('--from') or arg('--only'))
    if not DRY:
        # 📡 첫 장면 전에 두 폰이 다 닿나 — 하나라도 안 닿으면 아무 장면도 돌리지 않는다(76판 · 옛 포트로 S23 을 못 본 채 판이 흐름 · 71)
        bad = run.phones_ready()
        if bad:
            for name, dev, why in bad: log(f'⛔ {name}({dev or "이름 없음"}) 안 닿음 — {why}')
            log('⛔ 두 폰이 다 닿지 않아 시작하지 않음 — 무선 adb 를 다시 켜거나 S23=<ip:포트> 를 주고 다시'); return
        log(f'📡 두 폰 닿음 — A24 {A24} · S23 {S23}')
        if os.environ.get('JOY_RESUME'):   # 앞 판이 주행 중에 멈췄을 때 — 그 주행 장면을 다시 돌지 않고 재생 · 그곳 앞 일시정지 감시만 다시 건다
            stop = os.environ['JOY_RESUME']; joy_tap('joy.play'); threading.Thread(target=joy_pause_near, args=(stop,), daemon=True).start(); log(f'▶️ 이어 가기 — JoyStick 재생 · {stop} 앞 일시정지 감시')
        # 🔁 이어 가기는 막힌 장면이 같은 길 콜을 다시 넣는다 — 앞 시도에서 연 길은 원달앱이 «이미 본 콜»로 다시 안 연다(91판 S09) · 그래서 기억부터 비운다
        if arg('--from'): run.forget_seen(f'이어 가기 {arg("--from")} — 앞 시도에서 연 같은 길 콜을 다시 볼 수 있게')
        signal.signal(signal.SIGINT, lambda *a: (_ for _ in ()).throw(KeyboardInterrupt()))
        signal.signal(signal.SIGTERM, lambda *a: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        for s in [x for x in steps if not x.get('always')]:
            if os.path.exists(os.path.join(HERE, 'out', 'STOP')): log('⏹️ out/STOP — 멈춤(정리는 돈다)'); break
            CUR[0] = s['id']; log(f'━━ {s["id"]} {s["say"]}' + (f'  ❓{s["ask"]}' if s.get('ask') and DRY else ''))
            if s.get('skip'):   # 사용설명서가 «하지 마세요»라 한 장면 — 돌리지 않고 까닭만 적는다(뒤 장면이 기대면 앞 장면 없음)
                ATTEMPTED.add(s['id']); note(s['id'], '장면', None, f'뺌 — {s["skip"]}'); continue
            # 🔗 기대는 앞 장면(needs · day1.json 의 사실)이 이번 판에 서지 않았으면 돌리지 않는다 — 76판 S08 이 안 섰는데 S09 가 콜을 넣어 확정까지 감(71)
            #    --from · --only 로 시작점 앞을 건너뛰었으면 그 앞 장면은 이미 했다고 본다(로그에 적음)
            needs = s.get('needs', [])
            unmet = [n for n in needs if n not in STOOD and (n in ATTEMPTED or not partial)]
            trusted = [n for n in needs if n not in STOOD and n not in ATTEMPTED and partial]
            if DRY and needs: log(f'  🔗 기대는 앞 장면: {", ".join(needs)}')
            if trusted: log(f'  🔗 {", ".join(trusted)} 는 이번 판 시작점 앞 — 이미 했다고 봄')
            if unmet and not DRY:
                ATTEMPTED.add(s['id'])
                note(s['id'], '장면', None, f'⚪ 앞 장면 없음 — {", ".join(unmet)} 이 서지 않아 돌리지 않음')
                if s.get('onFail') == 'stop': stop_all = True; break
                continue
            ATTEMPTED.add(s['id'])
            if not DRY: STEP_MARK[0] = srv_mark(); PENDING['amark'] = app_mark()
            t0 = time.time()
            progress_scene_start(s)
            try:
                for i, a in enumerate(s.get('do', [])):
                    try: act(a)
                    except BaseException: progress_step(i, False); raise
                    progress_step(i, True)
                or_hand_j = 0
                for w in s.get('wait', []):
                    if w.get('ifBound') and w['ifBound'] not in BIND and not DRY:   # 그 콜을 못 잡은 판(제품 🔴 로 기록) — 그 콜을 보는 기다림만 건너뛴다
                        note(s['id'], f'{w["ifBound"]} 기다림', None, f'{w["ifBound"]} 콜이 이번 판에 없음 — 건너뜀'); continue
                    src, rx = ('srv', w['server']) if 'server' in w else ('app', w['app'])
                    if DRY: log(f'  ⏳ {src} «{rx}» {w["sec"]}초'); continue
                    mk = SMARK.get(w['sinceBind'], STEP_MARK[0]) if w.get('sinceBind') and src == 'srv' else (STEP_MARK[0] if src == 'srv' else PENDING['amark'])   # 한 번만 찍히는 줄(출발)은 그 콜을 잡은 때부터 센다
                    if w.get('orHand'):   # 사용설명서 주의 — 저절로 안 서면 기사님 손으로(관제앱 단계 시트) · 🔴 가 아니라 «설명서대로 손»(71 · 기사님 «가»)
                        j = or_hand_j; or_hand_j += 1
                        try:
                            t = wait_for(src, mk, sub(rx), w['sec'], sub(rx)); note(s['id'], f'{src}: {rx[:40]}', True, '섬')
                            progress_or_hand(j, True)
                        except Stop as e:
                            hm = srv_mark()
                            for name in w['orHand']: tap(name)
                            t = wait_for('srv', hm, w['handRe'], 30, w['handRe'])
                            note(s['id'], f'{rx[:30]} → 손', None, f'설명서 주의대로 손 — {w.get("why", "")} ({e})')
                            progress_or_hand(j, True)
                        continue
                    t = wait_for(src, mk, sub(rx), w['sec'], sub(rx))
                    note(s['id'], f'{src}: {rx[:40]}', True, '섬')
                STOOD.add(s['id'])   # 동작 · 기다림이 다 섰다 = 장면이 섰다(판정 🔴 와 상관없이 뒤 장면이 기댈 수 있다)
                checks(s['id'], s.get('check'))
                if not DRY and time.time() - t0 > s.get('limitSec', 600): note(s['id'], '한도 시간', False, f'{time.time() - t0:.0f}초 > {s["limitSec"]}')
            except ToolStop as e:
                note(s['id'], '장면', None, str(e))
                if s.get('onFail') == 'stop':   # 뒤 단계가 이 단계에 기대면(귀가 등) 시험 도구로 막혀도 판을 세운다
                    if DRY: log(f'  ⏹️ (실행이면 여기서 멈춤 — onFail stop)')
                    else: stop_all = True
            except KeyboardInterrupt: log('⏹️ 신호 — 멈춤(정리는 돈다)'); stop_all = True
            except Exception as e:
                note(s['id'], '장면', False, str(e))
                if not DRY: shot(S23, f'day_{s["id"]}_fail')
                if s.get('onFail') == 'stop': stop_all = True
            progress_scene_done(s['id'] in STOOD)
            save_state()
            # ⏸ 처음 막힌 장면에서 멈춘다 — 고친 뒤 그 장면부터 --from 으로 이어 간다 · 그 사이 R0 · S99 정리는 안 한다(이어 갈 콜 · 위치를 지우지 않음 · 71 · 기사님 «가»)
            if not DRY and s['id'] not in STOOD: halted = s['id']; break
            if stop_all: break
    finally:
        if halted:
            log(f'⏸ 멈춤 — {halted} 이 안 섬 · 정리(S99) 안 돎 · 고친 뒤 이어 가기: RUN_ID={os.environ.get("RUN_ID", "")} python3 -u day.py day1.json --from {halted}'); last = []
        # ⛔ 출발 장면(start · S00 · S01)이 안 섰으면 아무것도 안 건드렸으니 정리도 안 돈다(71 · 77판 S00 뒤 S99 가 귀가를 켬)
        unstarted = [x['id'] for x in SCEN['steps'] if x.get('start') and x['id'] in ATTEMPTED and x['id'] not in STOOD]
        if unstarted and not DRY:
            log(f'⛔ 출발 안 섬({", ".join(unstarted)}) — 정리할 것 없음 · {", ".join(x["id"] for x in last)} 안 돎'); last = []
        for s in last:   # 정리는 동작마다 따로 — 하나가 막혀도 나머지 · 판정은 돈다
            CUR[0] = s['id']; log(f'━━ {s["id"]} {s["say"]}')
            for a in s.get('do', []):
                try: act(a)
                except ToolStop as e: note(s['id'], f'정리 {list(a)[0]}', None, str(e))
                except Exception as e: note(s['id'], f'정리 {list(a)[0]}', False, str(e))
            try: checks(s['id'], s.get('check'))
            except ToolStop as e: note(s['id'], '정리 판정', None, str(e))
            except Exception as e: note(s['id'], '정리 판정', False, str(e))
        if not DRY:
            json.dump(RESULTS, open(os.path.join(HERE, 'out', 'day_results.json'), 'w'), ensure_ascii=False, indent=1)
            try:
                _, changed = ledger.append(os.environ.get('RUN_ID', '판 이름 없음'), started, RESULTS, f'24 day.py {SCEN["id"]} · 단계 {len(steps)} · 시뮬 다시 켬 {len(run.SIM_REOPENS)}번', A24, S23)
                log(f'📒 장부 덧붙임 · {", ".join(changed) or "F 변화 없음"}')
            except Exception as e: log(f'⛔ 장부 못 씀: {e}')
        bad = [f'{k}:{r["what"]}' for k, rows in RESULTS.items() for r in rows if r['ok'] is False]
        log(f'━━ 끝 — 🔴 {len(bad)} · ' + ' · '.join(bad[:10]))

if __name__ == '__main__':
    main()
