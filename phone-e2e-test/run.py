#!/usr/bin/env python3
"""
71판 자동 폰 시험(38 v71 V1~V5) — 24 · 레포 밖 스크립트.
쓰는 법: python3 run.py probe | V1 | V2 | V3 | V4 | V5 | restore
지킬 것(코드로 막음):
  - uiautomator 안 씀 · 누르기 전마다 raw 화면 색으로 그 자리에 그 단추가 있나 확인 · 아니면 멈춤
  - 누르기 전마다 앞 창 확인 — 알림 · 권한(위치 허락 등) 창이면 사진을 찍고 멈춤
  - 단계 단추(«하차 완료» 등)는 아예 안 누름 — 하차가 필요한 장면은 PC 관제웹(71)
  - 필터 · 설정 단추는 안 누름 · 콜은 onedal-sim 개별콜만(카카오 픽커 실물은 안 엶)
"""
import math, os, json, re, struct, subprocess, sys, time, urllib.request, sqlite3, datetime

A24 = 'R59W600X91K'
S23_MODEL = 'SM-S711N'   # S23 FE — 무선 adb 포트는 켤 때마다 바뀐다

def find_s23():
    """📡 S23 adb 이름 — 환경 변수 S23 이 있으면 그것, 없으면 `adb mdns services` 의 _adb-tls-connect 줄 가운데 모델이 S23 인 것 하나.
       박힌 옛 포트로 돌지 않는다(76판 — 옛 포트로 S08 · S08b 가 S23 을 못 본 채 S09 가 진행됨 · 71). 못 찾거나 둘 이상이면 None — 실행기가 시작 전에 멈춘다"""
    if os.environ.get('S23'): return os.environ['S23']
    # 이미 붙은 폰부터 — 무선 adb 알림(mdns)은 붙어 있어도 잠시 비는 때가 있다(102판 S03 · 붙어 있는데 «이름 없음»으로 멈춤)
    try: devs = subprocess.run(['adb', 'devices'], capture_output=True, text=True, timeout=10).stdout
    except Exception: devs = ''
    on = [l.split()[0] for l in devs.splitlines()[1:] if l.strip().endswith('device') and re.match(r'\d+\.\d+\.\d+\.\d+:\d+$', l.split()[0])]
    hit = [a for a in on if subprocess.run(['adb', '-s', a, 'shell', 'getprop', 'ro.product.model'], capture_output=True, text=True, timeout=10).stdout.strip() == S23_MODEL]
    if len(hit) == 1: return hit[0]
    try: out = subprocess.run(['adb', 'mdns', 'services'], capture_output=True, text=True, timeout=10).stdout
    except Exception: return None
    hits = []
    for addr in re.findall(r'_adb-tls-connect\._tcp\s+(\d+\.\d+\.\d+\.\d+:\d+)', out):
        subprocess.run(['adb', 'connect', addr], capture_output=True, text=True, timeout=10)
        model = subprocess.run(['adb', '-s', addr, 'shell', 'getprop', 'ro.product.model'], capture_output=True, text=True, timeout=10).stdout.strip()
        if model == S23_MODEL: hits.append(addr)
    return hits[0] if len(set(hits)) == 1 else None

S23 = find_s23()

def phones_ready():
    """두 폰이 다 닿나 — [(이름, adb 이름, 까닭)] 안 닿는 것만. 빈 목록이면 다 닿음"""
    bad = []
    for name, dev in (('A24', A24), ('S23', S23)):
        if not dev: bad.append((name, None, 'adb 이름을 못 찾음(S23 환경 변수 없음 · adb mdns services 에 S23 무선 adb 없음)')); continue
        r = subprocess.run(['adb', '-s', dev, 'get-state'], capture_output=True, text=True, timeout=10)
        if r.stdout.strip() != 'device': bad.append((name, dev, (r.stderr or r.stdout).strip()[:120] or '응답 없음'))
    return bad
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))   # 레포 맨 위 — 이 폴더는 레포 바로 아래
SRV_LOG = f'{REPO}/onedal-web/server/logs/server-{datetime.date.today():%Y-%m-%d}.log'
DB = f'{REPO}/onedal-web/server/local.db'
APP_LOG = f'/sdcard/Android/data/com.onedal.app/files/logs/1dal-{datetime.date.today():%Y-%m-%d}.log'
os.makedirs(OUT, exist_ok=True)

class Stop(Exception): pass
class ToolStop(Stop):
    """⚪ 시험 도구가 막힌 것 — 원달앱이 틀린 것이 아니다(장면은 🔴 가 아니라 «시험 도구»로 적고 다음 장면으로)"""

def sh(*a, check=True):
    try: r = subprocess.run(a, capture_output=True, text=True, timeout=20)
    except subprocess.TimeoutExpired: raise Stop(f'20초 넘게 응답 없음: {" ".join(a)[:80]} — PC 잠자기 · 무선 adb 확인')
    if check and r.returncode != 0: raise Stop(f'명령 실패: {" ".join(a)} → {r.stderr.strip()[:200]}')
    return r.stdout
def adb(dev, *a, check=True): return sh('adb', '-s', dev, *a, check=check)
def log(msg): print(f'{datetime.datetime.now():%H:%M:%S} {msg}', flush=True)

# ── 화면 ──
def shot(dev, name):
    p = os.path.join(OUT, f'{datetime.datetime.now():%H%M%S}_{name}.png')
    with open(p, 'wb') as f: f.write(subprocess.run(['adb', '-s', dev, 'exec-out', 'screencap', '-p'], capture_output=True, timeout=20).stdout)
    log(f'📸 {p}'); return p
def pixels(dev):
    """폰 안에서 화면을 파일로 찍고, 묻는 점만 dd 로 읽어 온다 — 무선 adb 로 10MB 를 매번 받으면 한 번에 2~3초라 8초 결재석을 놓친다"""
    adb(dev, 'shell', 'screencap', '/data/local/tmp/v71.raw')
    w = int(adb(dev, 'shell', 'dd if=/data/local/tmp/v71.raw bs=4 count=1 2>/dev/null | od -An -tu4').split()[0])
    cache = {}
    def px(x, y):
        if (x, y) not in cache:
            o = 16 + (y * w + x) * 4
            cache[(x, y)] = tuple(int(v) for v in adb(dev, 'shell', f'dd if=/data/local/tmp/v71.raw bs=1 skip={o} count=3 2>/dev/null | od -An -tu1').split())
        return cache[(x, y)]
    return px

FOCUS_OK = {A24: ('com.onedal.simulator',), S23: ('kr.co.onedal.dashboard',)}
PICKER_PKG = 'com.kakaomobility.flexer'
def focus_of(dev):
    f = adb(dev, 'shell', 'dumpsys', 'window', check=False)
    m = re.search(r'mCurrentFocus=Window\{\S+ \S+ ([^}]+)\}', f)
    return m.group(1) if m else '?'
def picker_watch():
    """A24 앞 화면이 실물 카카오 픽커면 아무것도 안 누르고 멈춤(71 · 사진)"""
    cur = focus_of(A24)
    if PICKER_PKG in cur: shot(A24, 'picker_front'); raise Stop(f'A24 앞 화면이 실물 픽커: {cur} — 아무것도 안 누르고 멈춤(사진)')
def guard(dev):
    """앞 창이 알림 · 권한 창 · 실물 픽커면 사진 찍고 멈춤"""
    cur = focus_of(dev)
    if dev == S23 and 'fakegpsjoystick' in cur and 'AdActivity' in cur:   # JoyStick 광고(경로를 건 직후 등 · 판 9 S06) — 뒤로 가기로 닫고 관제앱을 앞으로 · 광고 단추는 안 누른다
        shot(dev, 'joy_ad')
        if 'AdActivity' in focus_of(dev): adb(dev, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'); time.sleep(2)   # 본 그 순간에도 광고면만 — 저절로 닫힌 뒤 BACK 이 JoyStick 화면에 가면 그 앱을 뒤로 보낸다
        adb(dev, 'shell', 'monkey', '-p', 'kr.co.onedal.dashboard', '-c', 'android.intent.category.LAUNCHER', '1', check=False); time.sleep(2)
        cur = focus_of(dev); log(f'📺 JoyStick 광고 닫음(뒤로 가기) — 앞 창 {cur}')
        if 'kr.co.onedal.dashboard' not in cur: shot(dev, 'joy_ad_after'); raise Stop(f'JoyStick 광고를 닫았는데 앞 창이 관제앱이 아님: {cur} — 멈춤(사진)')
    if dev == S23 and cur == 'com.android.systemui':   # 이름 없는 시스템 창 — «온도가 낮아 충전이 느려짐 · 확인»(10-23 00:55 · 01:00 S23 사진 · 폰이 차가우면 몇 분마다) · 알림 서랍은 NotificationShade 라 안 걸린다
        shot(dev, 'sys_dialog')
        for key in ('KEYCODE_ENTER', 'KEYCODE_DPAD_CENTER'):   # 기본 단추(확인)에 초점 · 누름 — 좌표는 안 누른다
            if focus_of(dev) == 'com.android.systemui': adb(dev, 'shell', 'input', 'keyevent', key); time.sleep(1)
        cur = focus_of(dev); log(f'🔔 S23 시스템 창 닫음(기본 단추 키) — 앞 창 {cur}')
    if dev == S23 and cur == 'NotificationShade':   # 알림 서랍이 내려와 있음(알림 · 손 스침) — 걷기만 한다 · 알림은 누르지 않는다
        shot(dev, 'shade'); adb(dev, 'shell', 'cmd', 'statusbar', 'collapse'); time.sleep(1)
        cur = focus_of(dev); log(f'🔔 S23 알림 서랍 걷음 — 앞 창 {cur}')
    if PICKER_PKG in cur: shot(dev, 'picker_front'); raise Stop(f'앞 화면이 실물 픽커: {cur} — 안 누르고 멈춤(사진)')
    if any(k in cur for k in ('Dialog', 'permission', 'Permission', 'Alert', 'Chooser')) or not any(p in cur for p in FOCUS_OK[dev]):
        shot(dev, 'guard_stop'); raise Stop(f'앞 창이 예상 밖: {cur} — 멈춤(사진)')

JOY_BUTTON = (213, 462)   # S23 화면 위 JoyStick 파란 위치 단추 가운데(1080×2340 · 판 8 사진) — 이 둘레는 누르지 않는다

def tap_if(dev, x, y, pred, what):
    guard(dev)
    px = pixels(dev)
    c = px(x, y)
    if not pred(c, px): shot(dev, f'no_{what}'); raise Stop(f'«{what}» 자리 색이 아님 {c} — 안 누르고 멈춤')
    if dev == S23 and math.hypot(x - JOY_BUTTON[0], y - JOY_BUTTON[1]) < 70 and c[2] > 200 and c[0] < 80:   # JoyStick 파란 위치 단추 — 판 8 에 이것을 누른 뒤 메뉴가 펼쳐지고 경로 띠가 사라졌다(까닭은 재현 전) · 실행기는 안 누름
        shot(dev, f'joybutton_{what}'); raise Stop(f'«{what}» 자리가 JoyStick 위치 단추 — 안 누르고 멈춤(메뉴 · 경로 띠를 건드림)')
    adb(dev, 'shell', 'input', 'tap', str(x), str(y)); log(f'👆 {what} ({x},{y}) 색 {c}')

# 색 판별(70판 raw 값 · 1080x2340)
teal = lambda c, px: c[0] < 90 and c[1] > 130 and c[2] > 120             # 인성 상세 «확정» (38,166,154)
keep_card = lambda c, px: c[2] - c[0] > 40 and (lambda r: r[2] - r[0] < 35)(px(140, 1950))   # 결재석 KEEP 칸 (66,92,136) · 거절 (31,41,62)
not_white = lambda c, px: not (c[0] > 240 and c[1] > 240 and c[2] > 240)
any_px = lambda c, px: True

# ── 기록 ──
def app_mark(): return int(adb(A24, 'shell', f'[ -f {APP_LOG} ] && wc -l < {APP_LOG} || echo 0').strip() or 0)   # 자정 넘어 원달앱이 아직 한 줄도 안 쓴 날은 파일이 없다 — 0 줄로 본다(10-23 00:01)
def app_since(n): return adb(A24, 'shell', f'tail -n +{n + 1} {APP_LOG}', check=False)
def srv_mark(): return sum(1 for _ in open(SRV_LOG, encoding='utf8', errors='ignore'))
def srv_since(n):
    with open(SRV_LOG, encoding='utf8', errors='ignore') as f: return ''.join(f.readlines()[n:])
def wait_for(src, mark, pattern, sec, what):
    end = time.time() + sec
    while time.time() < end:
        picker_watch()
        txt = app_since(mark) if src == 'app' else srv_since(mark)
        seen = f'[이미 본 콜] 경기 광주 초월읍 → {DROP_CITY} {LAST["dong"]} {LAST["fare"]}원'
        # 처음 보기 전에 «이미 본 콜»이면 판을 넘은 겹침 — 본 뒤 다시 훑기의 «이미 본 콜»은 정상
        if src == 'app' and LAST['dong'] and seen in txt and f'{LAST["dong"]})' not in txt[:txt.index(seen)]:
            raise Stop(f'«이미 본 콜»로 건너뜀 — {LAST["dong"]} {LAST["fare"]}')
        m = re.search(pattern, txt)
        if m: log(f'✅ {what}: {txt[max(0, m.start() - 60): m.end() + 60].strip()[:200]}'); return txt
        time.sleep(0.7)
    raise Stop(f'⏱️ {sec}초 안에 «{what}» 없음')
def app_filter():
    x = adb(A24, 'shell', 'run-as', 'com.onedal.app', 'cat', 'shared_prefs/OneDalPrefs.xml')
    m = re.search(r'name="activeFilter">([^<]*)', x)
    import html; return json.loads(html.unescape(m.group(1))) if m else {}

# ── 시뮬 콜(PC → 로컬 서버) ──
DONGS = []   # 지금 원달앱 필터의 하차 목록 중 이천시 동 — 실행할 때 읽음(필터는 안 바꿈)
def pickup_from_filter(exclude=()):
    """그 순간 원달앱 필터의 상차 목록(pickupKeywords)에서 상차지 하나 — 시군구는 reservedPickupGroups 에서 찾고,
       서버 지오 캐시(geocode_cache · 숫자 없는 주소는 «a1|» 열쇠)에 있는 주소를 먼저 고른다(카카오 0번).
       목록 밖 상차지를 넣으면 원달앱이 맞게 막는다 — 시험이 «막힘»을 실패로 읽지 않게(73판 G4)"""
    f = app_filter(); groups = f.get('reservedPickupGroups', {}) or {}
    city_of = {d: c for c, ds in groups.items() for d in ds}
    cands = []
    for d in f.get('pickupKeywords', []) or []:
        if d in exclude or d not in city_of: continue
        c = city_of[d]; addr = f'{c} {d}' if c.startswith('서울') else f'경기 {c} {d}'
        cands.append((d, addr))
    if not cands: raise Stop('상차 목록이 비었거나 시군구를 못 찾음 — 필터는 안 바꾼다 · 71 에게')
    with sqlite3.connect(DB) as c:
        for d, addr in cands:
            row = c.execute('SELECT x, y FROM geocode_cache WHERE query IN (?, ?)', (addr, f'a1|{addr}')).fetchone()
            if row: log(f'🗺️ 상차지(그 순간 상차 목록 · 캐시) {addr}'); return (addr, d, row[0], row[1])
    d, addr = cands[0]; log(f'🗺️ 상차지(그 순간 상차 목록 · 캐시 없음 — 서버가 카카오를 한 번 부름) {addr}')
    return (addr, d, 127.3, 37.3)

DROP_CITY = '경기 이천시'
def dongs():
    if not DONGS:
        f = app_filter(); DONGS.extend(d for d in f.get('reservedPickupGroups', {}).get('이천시', []) if d in f.get('destinationKeywords', []))
        log(f'🗺️ 하차 동(필터에서 읽음 · 이천시) {len(DONGS)}곳')
    return DONGS
USED = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'used_calls.json')
LAST = {'dong': None, 'fare': None}
def sim_call(fare, vehicle, pickup=('경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점', '초월읍', 127.312587, 37.363298), dong=None):
    """같은 상차 · 하차 · 요금은 원달앱이 «이미 본 콜»로 건너뜀 — 쓴 조합을 파일에 남겨 판을 넘어 겹치지 않게(요금은 10원 끝수만 바꿈)"""
    try: used = set(json.load(open(USED)))
    except Exception: used = set()
    # 원달앱은 상차 · 하차가 같으면 요금이 달라도 «이미 본 콜» — 안 쓴 동을 먼저 고른다
    used_dongs = {u.split('|')[0] for u in used}
    if not dong:
        fresh = [d for d in dongs() if d not in used_dongs and d != pickup[1]]   # 상차와 같은 동은 하차로 안 고름
        if not fresh: raise Stop('하차 동을 다 씀 — used_calls.json 정리 필요(71 에게)')
        dong = fresh[0]
    used.add(f'{dong}|{fare}'); json.dump(sorted(used), open(USED, 'w'), ensure_ascii=False)
    LAST.update(dong=dong, fare=fare)
    body = {'pickup': dict(zip(('addressDetail', 'region', 'lon', 'lat'), pickup)),
            'dropoff': {'addressDetail': f'{DROP_CITY} {dong}', 'region': dong, 'lon': 127.44, 'lat': 37.27},
            'fare': fare, 'vehicleType': vehicle}
    r = urllib.request.urlopen(urllib.request.Request('http://localhost:4000/api/sim/calls', json.dumps(body).encode(), {'Content-Type': 'application/json'}))
    log(f'📦 콜 넣음 → {dong} · {fare} · {vehicle} · {r.read().decode()[:60]}'); return dong

# ── 시뮬 앱 고르기(A24) ──
# 시뮬레이터는 개별콜 목록이 열려 있으면 서버 대기열을 3초마다 물어 넣은 콜을 띄운다(server simCallQueue).
# 그래서 «이미 그 배차망 목록이면 다시 켜지 않는다» · 콜을 넣은 뒤 원달앱이 그 콜을 6초 안에 못 읽을 때만 다시 켠다(`call_seen`).
# 다시 켜는 것은 원달앱에게도 «페이지가 바뀌는» 소음이라 횟수를 센다(`SIM_REOPENS` · 판 보고).
SIM_TAB = {'insung': (690, 135), 'hwamul24': (846, 135), 'picker': (989, 135)}
SIM_LABEL = {'insung': '인성콜', 'hwamul24': '화물24시', 'picker': '픽커'}   # 원달앱 «📄 [페이지] {배차망} … → {화면}»의 배차망 이름(HijackService.kt)
SIM_REOPENS = []   # (시각, 배차망, 까닭)

def sim_on_list(net):
    """A24 앞 화면이 시뮬이고, 원달앱이 마지막으로 본 페이지가 그 배차망의 목록인가"""
    if 'com.onedal.simulator' not in focus_of(A24): return False
    t = adb(A24, 'shell', f"grep -F '📄 [페이지]' {APP_LOG} | tail -1", check=False)
    return f'[페이지] {SIM_LABEL[net]} ' in t and t.rstrip().endswith('→ LIST')

HOME_MISSED = [None]   # 원달앱이 홈을 못 알아봐 시험 스크립트가 단추 색으로 넘긴 배차망 — 부른 쪽이 🔴 로 적는다(넘긴 것은 다음 칸을 보려는 것뿐)
HOME_BTN = {'insung': ((300, 916), (89, 132, 176)), 'picker': ((538, 2088), (74, 116, 218))}   # 시뮬 배차망 홈의 «목록으로» 단추 자리 · 색 — 화물24시는 흰 단추라 색으로 못 가려 뺌
SIM_CODE = {'insung': 'insung', 'hwamul24': 'hwamul24', 'picker': 'kakaopicker'}   # 서버 · 원달앱 · 시뮬 배차망 이름

def sim_switch(net):
    """🔀 시뮬이 배차 화면에 떠 있으면 다시 켜지 않고 «배차망 바꿔» 신호로만 바꾼다(38 F36 · 71 «가») — 앞 배차망의 잡은 콜 · 연 상세가 남는다.
       껍데기 앱이 `--es net` 을 웹 화면 `window.__onedalSimSwitch` 로 넘긴다. 처음 보는 배차망은 홈에서 시작하니 홈 → 목록 한 번.
       못 바꾸면(시뮬이 안 떠 있음 · 설정 화면 · 25초 안에 그 배차망 페이지가 안 섬) False — 부른 쪽이 «시뮬 이상»으로 다시 켠다"""
    if not adb(A24, 'shell', 'pidof', 'com.onedal.simulator', check=False).strip(): return False
    a = app_mark()
    adb(A24, 'shell', 'am', 'start', '-n', 'com.onedal.simulator/.MainActivity', '--es', 'net', SIM_CODE[net], check=False)
    log(f'🔀 시뮬 배차망 바꿈 신호 — {net}')
    start = time.time(); tapped_home = False; HOME_MISSED[0] = None
    end = time.time() + 25   # 원달앱이 새 배차망 화면을 알아보는 데 10초 넘게 걸린 적이 있다(102판 S02 픽커 홈 10.2초)
    while time.time() < end:
        if sim_on_list(net): log(f'🔀 시뮬 {net} 목록 — 보던 화면 그대로'); return True
        since = app_since(a)
        if 'com.onedal.simulator' in focus_of(A24) and 'holding=true' in since and '→ UNKNOWN' in since:   # 원달앱이 앞 배차망 계약을 들고 있어 새 배차망을 일부러 안 읽음(F36) — 시뮬이 앞에 있으면 바뀐 것으로 본다(92판 S16)
            shot(A24, f'sim_{net}_holding'); log(f'🔀 시뮬 {net} — 원달앱이 계약을 들고 있어 그 배차망을 안 읽음(holding) · 시뮬 화면은 사진으로'); return True
        # 🏠 원달앱이 새 배차망 홈을 «페이지»로 알아보지 못할 때(108판 S03 픽커 홈 40초 넘게 기록 없음 · 장부 F66) — 8초 뒤, 시뮬 앞 화면의 홈 단추 색이 그 배차망 것이면 목록 단추를 누른다
        # 🏠 원달앱이 홈을 알아봤나 — «📄 [페이지] …» 줄을 안 찍고 «읽기 나눔 → HOME» · 서버 보고 «[scrap] 화면 HOME» 으로만 남길 때가 있다(108판 픽커 — 관제앱 폰 칸엔 «홈(출근 전)»)
        home_seen = re.search(r'\[scrap\] 화면 HOME|읽기 나눔\] \S+→HOME', since) and f'자동 전환 완료' in since
        if home_seen and not tapped_home and HOME_BTN.get(net) and 'com.onedal.simulator' in focus_of(A24):
            (hx, hy), _ = HOME_BTN[net]
            tapped_home = True; tap_if(A24, hx, hy, any_px, f'{net} 홈 → 목록(원달앱이 홈을 알아봄 — 서버 보고 화면 HOME)'); time.sleep(3)
            if sim_on_list(net): shot(A24, f'sim_{net}'); return True
        if not tapped_home and time.time() > start + 8 and f'[페이지] {SIM_LABEL[net]} ' not in since and not home_seen and HOME_BTN.get(net) and 'com.onedal.simulator' in focus_of(A24):
            (hx, hy), want = HOME_BTN[net]
            c = pixels(A24)(hx, hy)
            if all(abs(c[i] - want[i]) <= 25 for i in range(3)):
                tapped_home = True; HOME_MISSED[0] = net; adb(A24, 'shell', 'input', 'tap', str(hx), str(hy)); log(f'👆 {net} 홈 → 목록 — 원달앱이 홈을 안 알아봐 단추 색({c})으로 보고 누름'); time.sleep(3)
                if sim_on_list(net): shot(A24, f'sim_{net}'); return True
        if f'[페이지] {SIM_LABEL[net]} ' in since:
            if '→ LIST' not in app_since(a).split(f'[페이지] {SIM_LABEL[net]} ')[-1].split('\n')[0]:
                home = {'insung': (300, 916), 'hwamul24': (281, 541), 'picker': (538, 2088)}[net]
                if 'com.onedal.simulator' in focus_of(A24):
                    tap_if(A24, *home, any_px, f'{net} 홈 → 목록(처음 본 배차망)'); time.sleep(3)
                    if sim_on_list(net): shot(A24, f'sim_{net}'); return True
                return False
        time.sleep(1)
    return False

def sim_open(net, why='처음', no_reopen=False, fresh=False):
    """그 배차망 목록이 이미 열려 있으면 그대로 · 아니면 다시 켜서 탭 → 개별콜 → 화면으로 시작 → 홈 → 목록"""
    # 🧹 판 첫 열기는 깨끗이 다시 켠다 — 시뮬은 배차망을 바꿀 때 다시 안 켜서(b852fdc4) 앞 판 콜이 목록에 남는데, R0 는 서버 회차를 0 으로 되돌려 시뮬이 새 판을 모른다(81판 S06: 80판 6만원 콜을 열었음)
    if fresh: why = '판 첫 열기 — 앞 판 콜 지움'
    elif why == '처음':
        if sim_on_list(net): log(f'시뮬 {net} 목록이 이미 열려 있음 — 다시 안 켬'); return
        # 같은 배차망의 상세에 있으면 시뮬이 스스로 목록으로 돌아온다(인성 상세 10초) — 12초까지 기다린 뒤에만 다시 켠다
        if 'com.onedal.simulator' in focus_of(A24) and f'[페이지] {SIM_LABEL[net]} ' in adb(A24, 'shell', f"grep -F '📄 [페이지]' {APP_LOG} | tail -1", check=False):
            end = time.time() + 12
            while time.time() < end:
                if sim_on_list(net): log(f'시뮬 {net} 상세 → 목록으로 돌아옴 — 다시 안 켬'); return
                time.sleep(1)
        why = '목록이 아님'
    if not fresh and sim_switch(net): return
    if not fresh: why = f'{why} · 바꿈 신호로 안 섬'
    # 🔀 다시 켜면 앞 배차망의 잡은 콜 · 연 상세가 사라진다 — 그것을 보는 장면(S16 F36)은 다시 켜지 않고 멈춘다(71)
    if no_reopen and not fresh: raise ToolStop(f'⚪ 시험 도구 — 시뮬 {net} 이 신호로 안 바뀜(다시 켜면 앞 배차망 화면이 사라져 장면이 안 섬) · 껍데기 앱 b852fdc4 · 시뮬 :5173 새 판인지')
    SIM_REOPENS.append((datetime.datetime.now().strftime('%H:%M:%S'), net, why)); log(f'🔁 시뮬 다시 켬({len(SIM_REOPENS)}번째) — {net} · {why}')
    adb(A24, 'shell', 'am', 'force-stop', 'com.onedal.simulator'); time.sleep(1)
    adb(A24, 'shell', 'monkey', '-p', 'com.onedal.simulator', '-c', 'android.intent.category.LAUNCHER', '1', check=False); time.sleep(5)
    tap_if(A24, *SIM_TAB[net], any_px, f'시뮬 탭 {net}'); time.sleep(1)
    tap_if(A24, 883, 316, any_px, '개별콜'); time.sleep(1)
    tap_if(A24, 538, 2112, any_px, '화면으로 시작'); time.sleep(3)
    home = {'insung': (300, 916), 'hwamul24': (281, 541), 'picker': (538, 2088)}[net]
    tap_if(A24, *home, any_px, f'{net} 홈 → 목록'); time.sleep(3)
    shot(A24, f'sim_{net}')

def forget_seen(why):
    """원달앱의 «본 콜» 기억을 비운다 — 서버 회차를 올리면(개발 빌드 · routes/sim.ts call-memory/round) 폰이 다음 보고 응답에서 스스로 비운다.
       ⚠️ 시뮬 목록에 남은 옛 콜도 다시 판정된다 — 자동 모드면 잡힐 수 있어, 판 시작과 «이미 본 콜»로 막혔을 때만 쓴다"""
    a = app_mark()
    # 🔢 R0 가 서버를 다시 띄우면 회차가 0 으로 돌아가 한 번 올리면 늘 1 — 원달앱이 앞 판에 받은 번호와 같아 안 비운다(82판 S05 «이미 본 콜»).
    #    그래서 앞 판에 쓴 회차보다 커질 때까지 올리고 그 값을 적어 둔다
    try: last = json.load(open(_ROUND))['round']
    except Exception: last = 0
    for _ in range(last + 2):
        r = json.load(urllib.request.urlopen(urllib.request.Request('http://localhost:4000/api/sim/call-memory/round', b'{}', {'Content-Type': 'application/json'})))
        if r['round'] > last: break
    json.dump({'round': r['round']}, open(_ROUND, 'w'))
    log(f'🧹 본 콜 기억 비움 요청 — {why} · 회차 {last} → {r["round"]}')
    wait_for('app', a, r'본 콜 기억 비움', 25, '원달앱이 본 콜 기억을 비움')

_ROUND = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'round_seq.json')   # 앞 판에 쓴 «본 콜» 기억 회차
_FARE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fare_seq.json')
def fare_bump():
    """요금 끝수 차례(천 원 단위 · 0~39 돌림) — 시뮬이 요금을 천 원 단위로 깎아, 같은 동 쌍을 짧은 사이에 다시 넣어도 지문(상차+하차+요금)이 안 겹치게 파일에 남긴다"""
    try: k = json.load(open(_FARE))
    except Exception: k = 0
    json.dump((k + 1) % 40, open(_FARE, 'w')); return k * 1000

def call_seen(net, mark, key, sec=6):
    """넣은 콜(하차 동 등 `key`)을 원달앱이 목록에서 읽었나.
       · 6초 안에 못 읽으면 그때만 시뮬을 다시 켠다(콜은 대기열에 남아 다시 뜬다)
       · «이미 본 콜»로 건너뛰었으면 읽은 것이 아니다 — 본 콜 기억을 비우고 다시 기다린다(같은 콜이 새로 판정된다)"""
    read = r'(필터|파싱|통과 콜|상세 진입)[^\n]*' + re.escape(key)
    any_ = r'(필터|파싱|통과 콜|이미 본 콜|상세 진입)[^\n]*' + re.escape(key)
    try: t = wait_for('app', mark, any_, sec, f'원달앱이 {key} 콜을 봄')
    except Stop:
        sim_open(net, why=f'{key} 콜을 {sec}초 안에 못 읽음')
        t = wait_for('app', mark, any_, 25, f'다시 켠 뒤 원달앱이 {key} 콜을 봄')
    if re.search(read, t): return t
    # 🔕 «같은 길 한 번»(원달앱 AlarmedRoutes · 상차 · 하차 열쇠 · 요금 안 봄 · 목록에서 10분 안 보여야 잊음)은 회차 비우기로 안 풀린다
    if re.search(r'🔕 \[이미 본 콜\][^\n]*' + re.escape(key), t):
        raise ToolStop(f'⚪ 시험 도구 — 같은 길({key}) 콜을 원달앱이 10분 안에 이미 열었음(«같은 길 한 번» · 앞 시도 콜이 시뮬 목록에 남아 있으면 안 잊음)')
    # ⏭️ 지문(상차+하차+요금) 기억 — 알람 · 직접에서만 비운다. 자동에서 비우면 시뮬 목록의 옛 콜을 잡아 결재석 · 안전취소 · 취소 횟수가 결과에 섞인다(71)
    if supplied_mode() == 'AUTO': raise ToolStop(f'⚪ 시험 도구 — {key} 콜이 «이미 본 콜»(자동이라 기억을 안 비움)')
    forget_seen(f'{key} 콜이 «이미 본 콜»로 건너뜀')
    return wait_for('app', mark, read, 30, f'기억을 비운 뒤 원달앱이 {key} 콜을 읽음')

# ── S23 모드 — 단추는 글자로 찾는다(tap_mode · find.mjs) · 맞았나는 원달앱 받은 모드(저장 칸)로 본다 ──
def supplied_mode():
    """관제앱이 블루투스로 준 이 폰 몫의 모드(원달앱 저장 칸) — 원달앱이 붙어 있으면 이 값으로 돈다"""
    m = re.search(r'name="suppliedMode">([A-Z]+)<', adb(A24, 'shell', 'run-as', 'com.onedal.app', 'cat', 'shared_prefs/OneDalPrefs.xml', check=False))
    return m.group(1) if m else None
def running_mode():
    """원달앱은 모드가 바뀔 때만 «[도는 모드] A → B»를 적는다 — 블루투스가 잠깐 끊기면 기록은 ALARM 인데 받은 모드는 AUTO 일 수 있다(72판 M1).
       그래서 받은 모드(저장 칸)를 먼저 보고, 계약 안 함(SIMULATION)처럼 저장 칸이 못 가리는 것만 기록 줄로 본다"""
    sup = supplied_mode()
    t = adb(A24, 'shell', f"grep -E '도는 모드\\]|모드 테두리\\]' {APP_LOG} | tail -1", check=False)
    m = re.search(r'(?:도는 모드|모드 테두리)\] \S+ → (\w+)', t); last = m.group(1) if m else None
    return last if last == 'SIMULATION' and sup in ('AUTO', 'SIMULATION') else (sup or last)
MENU_Y = 176   # ☰ 가운데의 화면 y(1080×2340 · 71판 사진) — find.mjs 가 웹뷰 시작 높이를 그 순간 재는 기준
FIND = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'find.mjs')
MODE_LABEL = {'ALARM': '알람', 'AUTO': '자동', 'MANUAL': '직접'}   # shared modeTable.ts label

def find(spec):
    return json.loads(sh('node', FIND, S23, spec, str(MENU_Y), check=False).strip().splitlines()[-1])

def tap_find(spec, what, wait=5):
    """🔤 S23 단추를 글자로 그 순간 찾아 adb 손 누름(find.mjs) — 가려져 있으면 안 누르고 ⚪ · 없으면 wait 초까지 다시 봄"""
    end = time.time() + wait
    while True:
        r = find(spec)
        if r['state'] == 'ok':
            guard(S23)   # 앞 창이 관제앱이 아니면 안 누름 — 글자는 뒤에 있는 관제앱 화면에서 찾으므로 다른 앱(광고) 위를 누를 수 있다(86판 S10)
            adb(S23, 'shell', 'input', 'tap', str(r['x']), str(r['y'])); log(f'👆 {what} ({r["x"]},{r["y"]}) «{r.get("text", "")}»'); return r
        if r['state'] == 'covered': shot(S23, f'covered_{what}'); raise ToolStop(f'⚪ 시험 도구 — «{r.get("text") or what}»가 가려져 있음({r.get("why", "")}) · 안 누름')
        if time.time() >= end: shot(S23, f'nofind_{what}'); raise ToolStop(f'⚪ 시험 도구 — «{what}»({spec}) {r["state"]}: {r.get("why", "")}')
        time.sleep(0.5)

def tap_mode(cur, key):
    """🎛️ 모드 단추 — A24 폰 줄의 모드 단추(title «… 모드를 바꾸려면 누릅니다» · DeviceControlPanel.tsx:299)를 눌러 펼치고,
       그 줄 안의 «알람 · 자동 · 직접»(글이 똑같은 단추) 또는 «계약 안 함 …»을 누른다 — 좌표 · 칸 색으로 찾지 않는다(77판 통계 띠로 화면이 밀림)"""
    # 모드 단추 title 은 둘 — 명령과 도는 모드가 같으면 «… — 모드를 바꾸려면 누릅니다», 다르면(그 배차망이 자동을 못 함) «명령: … · 이 배차망에서는 …으로 돈다»(DeviceControlPanel.tsx:305)
    spec = 'in:A24>title:모드를 바꾸려면' if find('in:A24>title:모드를 바꾸려면').get('state') != 'none' else 'in:A24>title:이 배차망에서는'
    tap_find(spec, '모드 단추'); time.sleep(1)
    if key == 'TOGGLE': tap_find('in:A24>^계약 안 함', '계약 안 함 켬/끔')
    else: tap_find(f'in:A24>={MODE_LABEL[key]}', f'모드 {MODE_LABEL[key]}')
    time.sleep(2)

def mode_after(prev, sec=6):
    """누른 뒤 받은 모드가 바뀔 때까지 — 관제앱 → 블루투스 → 원달앱 저장 칸이 몇 초 걸린다"""
    end = time.time() + sec
    while time.time() < end:
        cur = running_mode()
        if cur != prev: return cur
        time.sleep(0.5)
    return running_mode()
def set_mode(target):
    """target: ALARM · AUTO · MANUAL · SIMULATION(자동 + 계약 안 함). 누른 뒤 원달앱 «도는 모드» 기록으로 맞았나 본다 — 틀리면 멈춤"""
    cur = running_mode(); log(f'지금 도는 모드 {cur} → {target}')
    if cur == target: return
    if target in ('AUTO', 'SIMULATION'):
        if cur not in ('AUTO', 'SIMULATION'): tap_mode(cur, 'AUTO'); cur = mode_after(cur)
        if cur != target: tap_mode(cur, 'TOGGLE'); cur = mode_after(cur)
    else:
        if cur == 'SIMULATION': tap_mode(cur, 'TOGGLE'); cur = mode_after(cur)   # 계약 안 함부터 끔(알람에서는 그 칸이 안 보임)
        tap_mode(cur, target); cur = mode_after(cur)
    if cur != target: shot(S23, 'mode_wrong'); raise Stop(f'모드가 {target} 이 아니라 {cur}')
    log(f'✅ 도는 모드 {cur}')

BG = (17, 24, 39)
off_bg = lambda c: max(abs(a - b) for a, b in zip(c, BG)) > 12
seat_up = lambda c, px: off_bg(c) and off_bg(px(140, 2001)) and off_bg(px(722, 1900))   # 판정 색(꿀 파랑 · 똥 …)마다 KEEP 칸 색이 달라 «바탕이 아님»만 본다 — 치워졌는지는 서버 기록이 가린다
def keep_on_seat(m, what):
    """서버가 판정을 보낸 뒤(order-evaluated) 0.3초마다 raw 색 확인 — 누르기 직전 서버 기록에 그 콜이 치워졌으면(콜 치움 · order-canceled) 안 누르고 실패
       (13:15:02 — 치운 뒤 같은 자리의 진행 중 경로 줄 파랑을 KEEP 으로 보고 누름)"""
    wait_for('srv', m, r'판정 색 표시', 20, '관제웹 결재석에 판정 색')
    end = time.time() + 12
    while time.time() < end:
        if re.search(r'콜 치움|order-canceled', srv_since(m)): shot(S23, f'gone_{what}'); raise Stop(f'«{what}» 전에 콜이 치워짐 — 안 누름')
        guard(S23); px = pixels(S23); c = px(722, 2001)
        if seat_up(c, px):
            if re.search(r'콜 치움|order-canceled', srv_since(m)): shot(S23, f'gone_{what}'); raise Stop(f'«{what}» 직전 콜이 치워짐 — 안 누름')
            adb(S23, 'shell', 'input', 'tap', '722', '2001'); log(f'👆 {what} (722,2001) 색 {c}'); shot(S23, f'tapped_{what}'); return
        time.sleep(0.2)
    shot(S23, f'no_{what}'); raise Stop(f'«{what}» 칸을 못 봄')

def counts():
    with sqlite3.connect(DB) as c:
        sc = c.execute("SELECT COUNT(*) FROM orders WHERE status='SAFE_CANCEL' AND COALESCE(targetApp,'insung')='insung'").fetchone()[0]
    ck = srv_since(0).count('취소 카운트 +1 반영')
    return sc, ck

# ── 장면 ──
def V1():
    log('V1 화물24시 손 진입 — 앞 조건: A24 알람'); sim_open('hwamul24')
    n = app_mark(); d = sim_call(5000, '1t')
    wait_for('app', n, rf'24시 필터\].*도착지\({DROP_CITY} {d}\)', 20, f'원달앱이 목록 줄을 봄({d} · 요금 미달 — 안 엶)')
    tap_if(A24, 962, 733, not_white, '화물24시 목록 요금 글자(손 진입)')
    t = wait_for('app', n, r'\[삑\]|요건 미달', 20, '삑 또는 요건 미달')
    if '요건 미달' in t: raise Stop('X12 실패 — 요건 미달')
    shot(S23, 'V1_s23')

def V2():
    log('V2 손 확정 단계 바로 · 배지 — 앞 조건: A24 알람'); sim_open('insung')
    n, m = app_mark(), srv_mark(); sim_call(50000, '1t')
    wait_for('app', n, r'상세 진입', 20, '원달앱이 상세를 엶')
    wait_for('app', n, r'\[삑\]', 15, '원달앱 팝업 읽기 끝 · 삑(기사님이 누르실 때)')
    for _ in range(8):
        try: tap_if(A24, 156, 2001, teal, '인성 상세 «확정»'); break
        except Stop as e:
            if '앞 창' in str(e): raise
            time.sleep(0.5)
    else: raise Stop('확정 단추를 못 봄')
    wait_for('srv', m, r'출생\].*상차지 통화', 15, '상차지 통화 단계 출생(도착 전)')
    shot(S23, 'V2_hand_alarm')
    set_mode('SIMULATION'); shot(S23, 'V2_folded_yellow'); sim_open('insung')
    n, m = app_mark(), srv_mark(); sim_call(30000, app_filter().get('allowedVehicleTypes', ['오토바이'])[0])
    wait_for('app', n, r'확정 안 누름|상세 진입', 25, '원달앱이 연습 상세를 엶')
    keep_on_seat(m, '결재석 KEEP(연습)')
    wait_for('srv', m, r'연습 결재 처리 완료', 15, '연습 끝')
    shot(S23, 'V2_practice_badges')
    V2_tail()

def V2_tail():
    n, m = app_mark(), srv_mark(); sim_call(31000, app_filter().get('allowedVehicleTypes', ['오토바이'])[0])
    wait_for('app', n, r'상세 진입', 25, '원달앱이 상세를 엶(계약 안 함)')
    wait_for('app', n, r'\[삑\]', 15, '원달앱 팝업 읽기 끝 · 삑(기사님이 누르실 때)')
    for _ in range(8):
        try: tap_if(A24, 156, 2001, teal, '인성 상세 «확정»(계약 안 함 · 손)'); break
        except Stop as e:
            if '앞 창' in str(e): raise
            time.sleep(0.5)
    wait_for('srv', m, r'출생\].*상차지 통화', 15, '손 확정 콜 상차지 통화 바로')
    shot(S23, 'V2_hand_direct')
    set_mode('ALARM')
def V2b():
    log('V2 뒤 절반 — 연습 KEEP · 계약 안 함 손 확정')
    set_mode('SIMULATION'); shot(S23, 'V2_folded_yellow'); sim_open('insung')
    n, m = app_mark(), srv_mark(); sim_call(30000, app_filter().get('allowedVehicleTypes', ['오토바이'])[0])
    wait_for('app', n, r'확정 안 누름|상세 진입', 25, '원달앱이 연습 상세를 엶')
    keep_on_seat(m, '결재석 KEEP(연습)')
    wait_for('srv', m, r'연습 결재 처리 완료', 15, '연습 끝')
    shot(S23, 'V2_practice_badges')
    V2_tail()
def V3():
    log('V3 만석 → 픽커 멈춤 — 만들 수 있을 때만'); set_mode('AUTO'); sim_open('insung')
    for i in range(8):   # 81/100 · 남은 19박스 = 승용차(5) 셋 + 오토바이(1) 넷
        f = app_filter()
        if f.get('captureHold') == '만석': break
        veh = (f.get('allowedVehicleTypes') or ['승용차'])
        n, m = app_mark(), srv_mark(); sim_call(20000 + i * 1000, veh[-1])
        wait_for('app', n, r'확정 버튼 클릭', 30, '원달앱 자동 확정')
        keep_on_seat(m, f'결재석 KEEP(만석 쌓기 {i + 1})')
        wait_for('srv', m, r'결재 처리 완료', 15, 'KEEP')
        time.sleep(3)
    f = app_filter()
    if f.get('captureHold') != '만석': log(f'➖ 여덟 콜로 만석 못 만듦(captureHold={f.get("captureHold")} · 차종 {f.get("allowedVehicleTypes")}) — V3 뺌'); set_mode('ALARM'); return
    set_mode('ALARM'); sim_open('picker'); n = app_mark()
    sim_call(20000, '오토바이')
    wait_for('app', n, r'픽커 잡기 보류\] 만석', 25, '픽커 보류(만석)')
    time.sleep(5)
    if re.search(r'상세 진입', app_since(n)): raise Stop('만석인데 픽커가 상세를 엶')
    log('✅ 만석 동안 픽커 상세 안 엶 — 하차(PC 모의 주행)는 71')
def V4():
    log('V4 X1-a — 관제앱만 껐다 켬 · 앞 조건 자동'); set_mode('AUTO'); time.sleep(3); n, m = app_mark(), srv_mark()
    adb(S23, 'shell', 'am', 'force-stop', 'kr.co.onedal.dashboard'); t0 = time.time(); time.sleep(1)
    adb(S23, 'shell', 'am', 'start', '-n', 'kr.co.onedal.dashboard/.MainActivity', check=False)
    wait_for('srv', m, r'소켓 연결', 30, '관제웹 다시 붙음'); log(f'붙기까지 {time.time() - t0:.1f}초(5초 안이면 모드 그대로가 통과)')
    time.sleep(3); guard(S23); shot(S23, 'V4')
    if re.search(r'도는 모드\] AUTO → ALARM', app_since(n)): log('🔴 모드 흔들림')
    else: log('✅ 원달앱 도는 모드 그대로')
    t = srv_since(m); g = re.search(r'^(\S+).*관제웹 잠깐 끊김', t, re.M); c = re.search(r'^(\S+).*\[소켓 연결\]', t, re.M)
    log(f'서버 끊김 {g.group(1) if g else "?"} → 붙음 {c.group(1) if c else "?"}')
    log('원달앱 «도는 모드» 줄: ' + ' | '.join(re.findall(r'\S+ \S+ .*?도는 모드\][^\n]*', app_since(n))[:4]))
    set_mode('ALARM')

def a24_net(on):
    """A24 블루투스는 건드리지 않는다 — 껐다 켜면 원달앱 공급이 다시 안 붙는다(71판 · 접근성 다시 활성화로만 붙음)"""
    v = 'enable' if on else 'disable'
    adb(A24, 'shell', 'svc', 'wifi', v); adb(A24, 'shell', 'svc', 'data', v)
    log(f'A24 wifi · 데이터 {"켬" if on else "끔"}')
def s23_bt(on):
    adb(S23, 'shell', 'cmd', 'bluetooth_manager', 'enable' if on else 'disable'); log(f'S23 블루투스 {"켬" if on else "끔"}')
def V5():
    """원달앱은 블루투스가 끊기면 자동 → 알람이라 S23 을 먼저 끄면 자동 확정 · 안전취소가 안 선다 —
       자동 확정을 본 순간 A24 만 끊고(S23 은 그대로 서버에 KEEP), 원달앱 안전취소가 «취소»를 누르게 한다"""
    log('V5 KEEP 이 폰에 못 감 — 앞 조건: 자동 · 1박스 남음(오토바이)')
    sc0, ck0 = counts(); log(f'시작 전 SAFE_CANCEL {sc0} · 취소 카운트 줄 {ck0}')
    set_mode('AUTO'); sim_open('insung'); n, m = app_mark(), srv_mark(); sim_call(26000, '오토바이')
    wait_for('app', n, r'\[AUTO\] 확정 버튼 클릭', 30, '원달앱 자동 확정(상세 보고는 그 앞)')
    s23_bt(False); a24_net(False)   # 결재가 블루투스로 못 가게 S23 쪽을 끊는다 — 자동 확정 뒤라 안전취소는 이미 섰다
    try:
        keep_on_seat(m, '결재석 KEEP(A24 끊김)')
        wait_for('srv', m, r'결재 처리 완료', 15, '서버 KEEP')
        wait_for('app', n, r'못 보낸 자동 취소', 70, '원달앱 안전취소 «취소» 누름 · 저장 칸')
    finally:
        a24_net(True); s23_bt(True)
    wait_for('app', n, r'다시 보냄', 120, '저장 칸 다시 보냄')
    t = wait_for('srv', m, r'KEEP 못 감', 30, '서버 KEEP 못 감')
    time.sleep(5); t = srv_since(m)
    log(f'KEEP 못 감 {t.count("KEEP 못 감")}번(1 이 통과)')
    sc1, ck1 = counts(); log(f'끝 SAFE_CANCEL {sc1}(+{sc1 - sc0}) · 취소 카운트 줄 {ck1}(+{ck1 - ck0}) — 둘 다 +1 이 통과')
    shot(S23, 'V5_red_line'); set_mode('ALARM')

def restore():
    adb(A24, 'shell', 'svc', 'wifi', 'enable', check=False); adb(A24, 'shell', 'svc', 'data', 'enable', check=False)
    adb(S23, 'shell', 'cmd', 'bluetooth_manager', 'enable', check=False); time.sleep(3)
    log('A24 wifi ' + adb(A24, 'shell', 'settings', 'get', 'global', 'wifi_on').strip() + ' · data ' + adb(A24, 'shell', 'settings', 'get', 'global', 'mobile_data').strip())
    log('A24 bluetooth ' + adb(A24, 'shell', 'settings', 'get', 'global', 'bluetooth_on').strip())
    log('S23 bluetooth ' + adb(S23, 'shell', 'settings', 'get', 'global', 'bluetooth_on').strip())
    f = app_filter(); log(f'A24 isActive {f.get("isActive")} · captureHold {f.get("captureHold")}')

def probe():
    for dev in (A24, S23):
        guard(dev); px = pixels(dev); log(f'{dev} 색 — ' + ' '.join(f'{p}:{px(*p)}' for p in [(156, 2001), (722, 1950), (140, 1950), (948, 328)]))
        shot(dev, 'probe')

if __name__ == '__main__':
    try: {'probe': probe, 'V1': V1, 'V2': V2, 'V2b': V2b, 'V2t': V2_tail, 'V3': V3, 'V4': V4, 'V5': V5, 'restore': restore}[sys.argv[1]]()
    except Stop as e: log(f'⛔ 멈춤: {e}'); sys.exit(2)
