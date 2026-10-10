"""
하루 일과 실행기 — 시나리오(day1.json)를 읽어 단계마다 do → wait → check → 판정 → onFail. 단계는 코드에 박지 않는다(기사님 «json 으로 자동화»).
누를 자리는 taps.json 한 곳. 결과는 장부(ledger.append)에 단계 이름으로 붙는다.
쓰는 법: S23=172.30.1.18:<포트> RUN_ID=76판 python3 -u day.py day1.json [--from S05] [--only S03,S04] [--no-cleanup] [--dry]
  --dry : 폰 · 서버 없이 단계 · 이름 · 좌표 · 장소를 풀어 보기만(빈 좌표 · 모르는 낱말을 미리 찾음)
"""
import glob, json, os, re, sys, time, signal, datetime, math, sqlite3, urllib.request
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

def home_off_if_mine():
    on = json.loads(run.sh('node', os.path.join(HERE, 'find.mjs'), S23, 'see:복귀 켬', str(run.MENU_Y), check=False).strip().splitlines()[-1])['state'] == 'ok'
    if not HOME_BY_SCRIPT[0]:
        if on: note(CUR[0], '귀가', None, '기사님 손 — 귀가 켜져 있음(이번 판에 스크립트가 켜지 않아 안 끔)')
        else: log('  귀가 꺼져 있음 — 할 것 없음')
        return
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
        if all(json.loads(run.sh('node', os.path.join(HERE, 'find.mjs'), S23, f'see:{w}', str(run.MENU_Y), check=False).strip().splitlines()[-1])['state'] == 'ok' for w in t['skipIf']['see']):
            log(f'  ⏭️ {name} — 이미 그 상태(«{" · ".join(t["skipIf"]["see"])}» 보임) · 안 누름'); return
    if t.get('text'): return tap_text(name, t)
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
        f = run.app_filter(); groups = f.get('reservedPickupGroups', {}) or {}
        city_of = {d: c for c, ds in groups.items() for d in ds}
        cands = []
        with sqlite3.connect(run.DB) as c:
            for d in f.get('destinationKeywords', []) or []:
                if d not in city_of: continue
                addr = f'경기 {city_of[d]} {d}'
                r = c.execute('SELECT x, y FROM geocode_cache WHERE query IN (?, ?)', (addr, f'a1|{addr}')).fetchone()
                if r: cands.append((addr, d, r[0], r[1]))
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
    m = re.findall(rf'🎨 \[판정\] (\S+) (\d+)점[^\n]*?— 돈 {FARES[b] / 10000:.1f}만', t)   # 점수 뒤에 «· 잡으면 사고 — N분 늦음(…)» 같은 덧말이 끼기도 한다(93판 S19)
    return m[-1] if m else None

CONFIRM = {'insung': 'a24.insung.detail.confirm', 'hwamul24': 'a24.hwamul24.detail.confirm'}   # 손 확정 단추(인성 «확정» · 화물24시 «배차신청»)
CLOSE = {'insung': 'a24.insung.detail.close'}   # 손 확정 뒤 KEEP 이 오면 기사님이 누르는 «닫기»(화물24시는 신청하면 배차내역으로 가서 없음)

def decide(v):
    """🎨 기사님이 고르는 자리를 그 순간 판정 색 하나로(기사님 «알람이든 자동이든 필터를 통과하면 판정이 서고, 판정을 보고 고른다» · 71).
       v = {bind · how: hand|auto|view · net · sec}
       hand(알람 · 직접): 원달앱이 연 그 콜이 🔵 면 손 확정(→ KEEP → 닫기) · 아니면 안 누름
       auto(자동): 원달앱 확정 뒤 결재석 판정 — 🔵 면 결재석 KEEP · 아니면 결재석 거절(실행서 5-1 «결재석 KEEP / 거절»)
       view(픽커 등 안 잡는 자리): 누르지 않고 색만 적음
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
    if how == 'view': note(CUR[0], f'{b} 판정(보기만)', True, f'{c[0]} {c[1]}점 · 안 누름'); return
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
    elif k == 'snapshot':
        with sqlite3.connect(run.DB) as c:
            for t in ('user_filters', 'user_settings'): SNAP[t] = c.execute(f'SELECT * FROM {t}').fetchall()
            c.row_factory = sqlite3.Row
            SNAP['filter_rows'] = [dict(r) for r in c.execute('SELECT * FROM user_filters').fetchall()]   # S99 가 시작 필터로 되돌릴 때 칸 이름으로 읽는다
        SNAP['mode'] = run.supplied_mode(); SNAP['filter'] = run.app_filter()
        log(f'📸 떠 둠 — 필터 · 설정 · 모드 {SNAP["mode"]} · 목적지 {SNAP["filter"].get("destinationCity")} · 최저 {SNAP["filter"].get("minFare")}')
        if SNAP['filter'].get('destinationCity') != '이천시': log(f'⚠️ 시작 목적지가 이천시가 아님 — S04 저장이 목적지까지 DB 에 넣는다 · S99 에서 되돌림 필요(ef)')
    elif k == 'mode': run.set_mode(v)
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
        log('🎛️ ' + run.sh('node', os.path.join(HERE, 'set_filter.mjs'), json.dumps(v, ensure_ascii=False), check=True).strip())
        wait_for('srv', sm, r'영구 설정\(baseFilter\) DB 저장 완료', 15, '서버 저장')
        wait_for('app', am, r'\[필터 도착\]|\[필터 바뀜\]', 20, '원달앱 필터 받음')
        f = run.app_filter(); bad = {k2: f.get(k2) for k2, v2 in v.items() if k2 in ('destinationCity', 'minFare') and f.get(k2) != v2}
        if bad: raise Stop(f'시험용 필터가 원달앱에 안 감 — {bad}')
        log(f'🎛️ 시험용 필터 맞춤 — 원달앱 목적지 {f.get("destinationCity")} · 최저 {f.get("minFare")}')
    elif k == 'restore_filter':   # 판 끝 — S01 이 떠 둔 기사님 필터(목적지 · 제외 지역 · 최저)로 같은 길로 되돌린다
        start = (SNAP.get('filter') or {})
        row = next((r for r in SNAP.get('filter_rows') or [] if r.get('destination_city') == start.get('destinationCity') and r.get('min_fare') == start.get('minFare')), None)
        if DRY: log('  🎛️ 시작 필터로 되돌림(목적지 · 제외 지역 · 최저)'); return
        if not row: raise ToolStop('⚪ 시험 도구 — 시작 필터 기록이 없음(S01 을 이번 판에 돌렸나)')
        back = {'destinationCity': row['destination_city'], 'excludedRegions': json.loads(row['excluded_regions'] or '[]'), 'minFare': row['min_fare']}
        sm = srv_mark(); log('🎛️ ' + run.sh('node', os.path.join(HERE, 'set_filter.mjs'), json.dumps(back, ensure_ascii=False), check=True).strip())
        wait_for('srv', sm, r'영구 설정\(baseFilter\) DB 저장 완료', 15, '서버 저장')
        log(f'🎛️ 시작 필터로 되돌림 — {back}')
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
    elif k == 'joystick':
        leg = v['leg']; r = SCEN['routes'][leg]
        if DRY: log(f'  🟡 9e: JoyStick {leg} ({r["gpx"]}) 시작 — {r["say"]}'); return
        log(f'🟡 9e: JoyStick «중단 → {r["gpx"]} 고름 → 시작» — {r["say"]}')
        __import__('g').mock_guard(leg)
    elif k == 'ble':
        adb(A24, 'shell', 'cmd', 'bluetooth_manager', 'enable' if v == 'on' else 'disable'); log(f'A24 블루투스 {v}')
    elif k == 'sleep': time.sleep(v)
    elif k == 'photo': shot(A24 if v == 'A24' else S23, f'day_{CUR[0]}')
    elif k == 'restore': restore()
    else: raise ToolStop(f'⚪ 시험 도구 — 모르는 동작 «{k}»')
CUR = ['']

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
        elif k == 'web_drive':
            t = srv_since(SMARK.get('C1', STEP_MARK[0])); dv = re.findall(r'주행판정\] ([^\n]*)', t)   # 운행 중은 첫 출발에 한 번 — 첫짐을 잡은 때부터 센다
            note(step, '관제웹 «운행 중»', any('→ drive' in d or d.startswith('drive') for d in dv), ' | '.join(d[:30] for d in dv) or '주행판정 줄 0')
STEP_MARK = [0]
STOOD, ATTEMPTED = set(), set()   # 이번 판에 선 장면 · 돌리려 한 장면
STATE = os.path.join(HERE, 'out', 'day_state.json')   # 판 상태 — 막힌 장면부터 --from 으로 이어 갈 때 읽는다(71 · 기사님 «가»)

def save_state():
    if DRY: return
    st = {'BIND': BIND, 'FARES': FARES, 'DROPS': DROPS, 'CMARK': CMARK, 'SMARK': SMARK, 'SNAP': SNAP, 'STOOD': sorted(STOOD),
          'HOME_BY_SCRIPT': HOME_BY_SCRIPT[0], 'PENDING': {k: PENDING[k] for k in ('bind', 'mark', 'drop', 'fare', 'cmark') if k in PENDING},
          'RUN_ID': os.environ.get('RUN_ID'), 'at': datetime.datetime.now().isoformat(timespec='seconds')}
    json.dump(st, open(STATE, 'w'), ensure_ascii=False, indent=1, default=list)

def load_state():
    """--from 으로 이어 갈 때 — 앞 장면이 묶은 콜 번호 · 요금 · 하차 동 · 기록 자리 · 시작 사진 · 선 장면을 되살린다(없으면 앞 장면 콜 없음 ⚪)"""
    try: st = json.load(open(STATE))
    except Exception: log('⚠️ 판 상태 파일 없음 — 앞 장면이 묶은 콜은 모름'); return
    for d, k in ((BIND, 'BIND'), (FARES, 'FARES'), (DROPS, 'DROPS'), (CMARK, 'CMARK'), (SMARK, 'SMARK'), (SNAP, 'SNAP'), (PENDING, 'PENDING')): d.update(st.get(k) or {})
    STOOD.update(st.get('STOOD') or []); HOME_BY_SCRIPT[0] = bool(st.get('HOME_BY_SCRIPT'))
    log(f'📂 판 상태 되살림 — {st.get("RUN_ID")} {st.get("at")} · 묶은 콜 {", ".join(f"{k}={v}" for k, v in BIND.items()) or "없음"} · 선 장면 {len(STOOD)}개')

def restore():
    if SNAP.get('mode') and run.supplied_mode() != SNAP['mode']: run.set_mode(SNAP['mode'])
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
            try:
                for a in s.get('do', []): act(a)
                for w in s.get('wait', []):
                    if w.get('ifBound') and w['ifBound'] not in BIND and not DRY:   # 그 콜을 못 잡은 판(제품 🔴 로 기록) — 그 콜을 보는 기다림만 건너뛴다
                        note(s['id'], f'{w["ifBound"]} 기다림', None, f'{w["ifBound"]} 콜이 이번 판에 없음 — 건너뜀'); continue
                    src, rx = ('srv', w['server']) if 'server' in w else ('app', w['app'])
                    if DRY: log(f'  ⏳ {src} «{rx}» {w["sec"]}초'); continue
                    mk = SMARK.get(w['sinceBind'], STEP_MARK[0]) if w.get('sinceBind') and src == 'srv' else (STEP_MARK[0] if src == 'srv' else PENDING['amark'])   # 한 번만 찍히는 줄(출발)은 그 콜을 잡은 때부터 센다
                    if w.get('orHand'):   # 사용설명서 주의 — 저절로 안 서면 기사님 손으로(관제앱 단계 시트) · 🔴 가 아니라 «설명서대로 손»(71 · 기사님 «가»)
                        try: t = wait_for(src, mk, sub(rx), w['sec'], sub(rx)); note(s['id'], f'{src}: {rx[:40]}', True, '섬')
                        except Stop as e:
                            hm = srv_mark()
                            for name in w['orHand']: tap(name)
                            t = wait_for('srv', hm, w['handRe'], 30, w['handRe'])
                            note(s['id'], f'{rx[:30]} → 손', None, f'설명서 주의대로 손 — {w.get("why", "")} ({e})')
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
