"""
gaps 장면(38 gaps · 기사님 지시 둘) — 실패해도 판은 계속: 장면마다 한도 시간 · 넘거나 틀리면 🔴 + 두 폰 사진 + 서버 시각 → 되살리기 → 다음 장면
쓰는 법: python3 g.py G1 G5 G8 G6     (장면을 고른 차례대로 · 안 주면 추천 묶음)
JoyStick 화면 · 단추는 누르지 않는다(71 이 함) — «🟡 71: …»이 찍히면 24 가 71 에게 알린다.
"""
import json, os, re, signal, subprocess, sys, time, datetime
import run, ledger
from run import A24, S23, log, Stop, app_mark, app_since, srv_mark, srv_since, wait_for, tap_if, teal, shot, adb

MODA = ('경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점', '초월읍', 127.312587, 37.363298)       # g1a 끝 · g1b 처음
IAN = ('경기 이천시 신둔면 경충대로 3035-1 이안로지스', '신둔면', 127.407889, 37.297660)              # g1b 끝 128m 앞
GONJIAM = ('경기 광주시 곤지암읍 경충대로 41 서민행복주유소', '곤지암읍', 127.394927, 37.328137)           # 번지 있음(geocode_cache) · g1b 50% 지점에서 20m (합짐 상차) · F21
SUGWANG = ('경기 이천시 신둔면 경충대로 3282 우리주유소', '신둔면', 127.397183, 37.317400)   # 번지 있음(geocode_cache) · g1b2 10.02km 지점에서 33m · 끝에서 2.1km → 달리며 «지나침»(경유 하차) · 71 «가»
ACC_SERVICE = 'com.onedal.app/com.onedal.app.HijackService'
LIMIT_MIN = {'G11': 6, 'G1': 30, 'G3': 12, 'G4': 10, 'G5': 3, 'G6': 4, 'G8': 5, 'G9': 10, 'G10': 125}
RESULTS = {}

class Timeout(Stop): pass
def _alarm(signum, frame): raise Timeout('한도 시간 넘김')

def note(scene, key, ok, text):
    RESULTS.setdefault(scene, []).append({'what': key, 'ok': ok, 'text': text, 'at': datetime.datetime.now().strftime('%H:%M:%S')})
    log(f'{mark(ok)} {scene} {key} — {text}')

def mark(ok): return '✅' if ok is True else '🔴' if ok is False else '⚪'

def srv_time(txt, pat):
    m = re.search(r'^(\S+)[^\n]*' + pat, txt, re.M); return m.group(1) if m else None

def call(pick, drop, fare, vehicle):
    body = {'pickup': dict(zip(('addressDetail', 'region', 'lon', 'lat'), pick)),
            'dropoff': dict(zip(('addressDetail', 'region', 'lon', 'lat'), drop)), 'fare': fare, 'vehicleType': vehicle}
    import urllib.request
    r = urllib.request.urlopen(urllib.request.Request('http://localhost:4000/api/sim/calls', json.dumps(body).encode(), {'Content-Type': 'application/json'}))
    log(f'📦 콜 넣음 → {pick[0]} → {drop[0]} · {fare} · {vehicle} · {r.read().decode()[:50]}')

def hand_keep(scene, key, pick, drop, fare, net='insung'):
    """알람 · 원달앱 삑 뒤 손 확정 → 서버 KEEP · 단계 출생 — 원달앱이 콜을 6초 안에 못 읽을 때만 시뮬을 다시 켠다(run.call_seen)"""
    veh = (run.app_filter().get('allowedVehicleTypes') or ['1t'])[0]
    n, m = app_mark(), srv_mark(); call(pick, drop, fare + run.fare_bump(), veh)   # 시뮬은 요금을 천 원 단위로 깎는다 — 지문(상차+하차+요금)이 겹치지 않게 천 원씩
    run.call_seen(net, n, drop[1])
    wait_for('app', n, r'상세 진입', 25, f'{key} 원달앱 상세')
    wait_for('app', n, r'\[삑\]', 15, f'{key} 삑')
    for _ in range(8):
        try: tap_if(A24, 156, 2001, teal, f'{key} 인성 «확정»(손)'); break
        except Stop as e:
            if '앞 창' in str(e): raise
            time.sleep(0.5)
    else: raise Stop('확정 단추를 못 봄')
    t = wait_for('srv', m, r'결재 처리 완료', 15, f'{key} KEEP')
    oid = re.search(r'결재 처리 완료 \(([0-9a-f]{8})', t).group(1)
    note(scene, key, True, f'KEEP {srv_time(t, "결재 처리 완료")} · 콜 {oid}')
    # 손 확정 콜은 KEEP 이 와도 원달앱이 확정 뒤 상세에 머문다(DetailBackPolicy) — 기사님이 누르실 «닫기»를 스크립트가 대신 누른다(실행서 5-1 · 72판 F18/F20)
    wait_for('app', n, r'정상 결재 수신|즉각.*집행', 15, f'{key} KEEP 집행(원달앱)')
    for _ in range(8):
        try: tap_if(A24, 127, 2001, teal, f'{key} 인성 «닫기»(손 대신)'); break
        except Stop as e:
            if '앞 창' in str(e): raise
            time.sleep(0.5)
    else: raise Stop('닫기 단추를 못 봄')
    wait_for('app', n, r'복귀 감지\].*LIST', 15, f'{key} 목록 복귀')
    return oid, m

def wait_any(m, pats, sec, what):
    """여럿 가운데 먼저 선 것 — (이름, 시각)"""
    end = time.time() + sec
    while time.time() < end:
        run.picker_watch(); t = srv_since(m)
        for k, p in pats.items():
            at = srv_time(t, p)
            if at: return k, at
        time.sleep(2)
    raise Stop(f'⏱️ {sec}초 안에 «{what}» 없음')

def s23_loc():
    """S23 지금 위치(mock) · 속도 — dumpsys location Location[fused …]"""
    t = adb(S23, 'shell', 'dumpsys', 'location', check=False)
    m = re.search(r'Location\[fused ([\d.]+),(-?[\d.]+).*?vel=([\d.]+)', t)
    return (float(m.group(1)), float(m.group(2)), float(m.group(3))) if m else None

def hav_m(lat1, lon1, lat2, lon2):
    import math
    R = 6371000; p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))

# g1b 경로 파일 — 끝 정차점으로 «도착 감지(500m 안 · 30초 정지)»인지 «지나침»인지 기대를 가른다(74판 · 71)
G1B_GPX = os.environ.get('G1B_GPX') or next((f for f in ('onedal-g1b2-pickup-to-drop.gpx', 'onedal-g1b-pickup-to-drop.gpx') if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), f))), '')
def route_end(path):
    t = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), path), encoding='utf8').read()
    pts = re.findall(r'lat="([\d.]+)"\s+lon="([\d.]+)"', t); return float(pts[-1][0]), float(pts[-1][1])
def server_xy(stop):
    """서버가 그 주소로 쓰는 좌표(geocode_cache · 숫자 없는 주소는 «a1|» 열쇠) — 없으면 스크립트 좌표"""
    import sqlite3
    with sqlite3.connect(run.DB) as c:
        r = c.execute('SELECT y, x FROM geocode_cache WHERE query IN (?, ?)', (stop[0], f'a1|{stop[0]}')).fetchone()
    return (r[0], r[1]) if r else (stop[3], stop[2])
def drop_expect(stop):
    """그 하차지가 경로 끝 정차점에서 500m 안이면 서서 «도착 감지» · 아니면 달리며 «지나침»(서버 GPS_ARRIVAL 500m · pass 300/400m)"""
    if not G1B_GPX: return '지나침', None
    (ey, ex), (y, x) = route_end(G1B_GPX), server_xy(stop)
    d = hav_m(ey, ex, y, x); return ('도착 감지' if d <= 500 else '지나침'), round(d)

def fused_last():
    """S23 마지막 fused 위치 줄 — JoyStick 이 켜져 있으면 끝에 «mock» 이 붙는다(9e 표본 · 75판)"""
    t = adb(S23, 'shell', 'dumpsys', 'location', check=False)
    m = re.findall(r'Location\[fused [^\]]*\]', t); return m[-1] if m else ''

def _latlng(f):
    m = re.search(r'fused (-?[0-9.]+),(-?[0-9.]+)', f); return (float(m.group(1)), float(m.group(2))) if m else None
def _dist_m(a, b):
    import math
    return math.hypot((a[0]-b[0]) * 111000, (a[1]-b[1]) * 111000 * math.cos(math.radians(a[0])))
def mock_guard(leg, start_wait_s=180, n=5, gap_s=2):
    """경로를 건 뒤 — mock 위치로 움직이기 시작하면 10초에 다섯 번 읽어, mock 이 아닌 fused 가 한 번이라도 끼면 ⚪ 위치 섞임(75판 · 71 «가»)"""
    end = time.time() + start_wait_s; first = None
    while time.time() < end:
        f = fused_last()
        if 'mock' in f:
            xy = _latlng(f); first = first or xy
            if xy and first and _dist_m(first, xy) > 30: break   # mock 으로 30m 넘게 움직이기 시작 — 줄 전체를 견주면 시각 값(et=)이 늘 달라 서 있어도 움직인 것으로 봄(94판 S11)
        time.sleep(2)
    else: raise run.ToolStop(f'⚪ 시험 도구 — {leg} 를 건 뒤 {start_wait_s}초 안에 mock 위치로 안 움직임(JoyStick 시작 확인)')
    bad = []
    for _ in range(n):
        f = fused_last()
        if 'mock' not in f: bad.append(f[:90])
        time.sleep(gap_s)
    if bad:
        shot(S23, f'{leg}_mix')
        raise run.ToolStop(f'⚪ 시험 도구 — 위치 섞임({leg} · 진짜 fused {len(bad)}/{n}: {bad[0]}) · 9e: 그때 순서(광고 · 텔레포트 · 경로 이름)를 사진으로')
    log(f'✅ {leg} 위치 섞임 없음(fused mock {n}/{n})')

def joystick_started(route, dest, tol_m=200, timeout_min=25):
    """«시작» 누르고 광고 넘긴 뒤 바로 부른다 — 끝점(dest) 근처에서 vel 0 이 되는지 GPS 로 직접 본다.
       tol_m 안에 못 들어오고 2*tol_m 밖으로 다시 멀어지면(지나침) 그 자리에서 Stop — 한도 시간을 다 기다리지 않는다"""
    shot(S23, f'joy_{route}_설정화면')
    moved = False; closest = None
    end = time.time() + timeout_min * 60
    while time.time() < end:
        loc = s23_loc()
        if not loc: time.sleep(5); continue
        lat, lon, vel = loc
        d = hav_m(lat, lon, dest[3], dest[2])   # dest = (주소, 동, lon, lat)
        if closest is None or d < closest: closest = d
        if vel > 3: moved = True
        if d <= tol_m and vel < 2:
            shot(S23, f'joy_{route}_도착_vel0'); log(f'✅ {route} 도착 — {d:.0f}m · vel {vel}'); return True
        if moved and d > tol_m * 2 and closest is not None and closest <= tol_m * 1.5:
            shot(S23, f'joy_{route}_지나침'); raise Stop(f'{route} 지나침 — 가장 가까웠을 때 {closest:.0f}m, 지금 {d:.0f}m(vel {vel})')
        time.sleep(10)
    shot(S23, f'joy_{route}_타임아웃'); raise Stop(f'{route} {timeout_min}분 안에 {tol_m}m 안 · vel 0 못 봄(가장 가까웠을 때 {closest}m)')

# ── 장면 ──
def s23_fix():
    """S23 마지막 GPS 좌표(dumpsys location) — 같은 자리 함정 가르기"""
    t = adb(S23, 'shell', 'dumpsys', 'location', check=False)
    m = re.search(r'Location\[gps ([\d.]+),([\d.]+)', t); return m.groups() if m else None

def G1():
    """G1 30초 서 있음 → «도착 감지»(도착만 · 완료는 안 섬) + G2 합짐 + G7 운행 판정 · 출발 — 기준은 38 gaps expect · wrong"""
    run.set_mode('ALARM')
    run.sim_open('insung'); first, _ = hand_keep('G1', '첫짐', MODA, IAN, 27000)
    m = srv_mark(); a = app_mark()
    log('🟡 71: g1a 시작(상차지 1km 앞 → 모다아울렛 · 끝에서 40초)')
    mock_guard('g1a')
    try:
        k, at = wait_any(m, {'도착 감지': r'도착 감지\] 상차지', '지나침': r'\[지나침\] 상차지'}, 300, '상차지 도착')
        note('G1', '상차 «도착 감지»(500m · 5km/h 아래 30초)', k == '도착 감지', f'{k} {at}')
    except Stop:
        f1 = s23_fix(); time.sleep(3); f2 = s23_fix()
        note('G1', '상차 «도착 감지»', False, f'안 섬 — S23 좌표 {f1} → {f2}: ' + ('같은 자리 함정(geoMotion.ts:611 samePlace · JoyStick 유휴 범위 확인)' if f1 and f1 == f2 else '좌표는 흔들림 — 다른 까닭'))
    time.sleep(15); t = srv_since(m)
    note('G1', '서 있는 동안 상차 완료 안 섬', not re.search(r'상차 완료\] ' + first, t), srv_time(t, r'상차 완료\] ' + first) or '안 섬')
    note('G1', '도착 감지 한 번', len(re.findall(r'도착 감지\] 상차지', t)) <= 1, f'{len(re.findall(r"도착 감지\] 상차지", t))}번')
    merge = None
    try:   # G2 — 합짐 하나를 더 잡고 달린다(실패해도 G1 은 이어 감)
        f0 = run.app_filter(); run.sim_open('insung'); merge, mm = hand_keep('G2', '합짐', GONJIAM, SUGWANG, 21000)
        time.sleep(5); t = srv_since(mm); f1 = run.app_filter()
        note('G2', '추가 콜 확정(GATHERING 유지)', '추가 콜 확정' in t, srv_time(t, '추가 콜 확정') or '없음')
        note('G2', '경유 갱신', '경유 갱신' in t, (re.search(r'경유 갱신[^\n]*', t) or [''])[0][:80] or '없음')
        # 서버 dispatchEngine «🚚 [적재 용량] 내 차: X | 잡은 콜: [..] → 추가 가능 차종: [..]» — 합짐 뒤 잡은 콜 둘 이상 · 추가 가능 차종이 비지 않음(함께 실리는 최대라 만석 아님)
        ld = re.findall(r'적재 용량\] 내 차: (\S+) \| 잡은 콜: \[([^\]]*)\] → 추가 가능 차종: \[([^\]]*)\]', t)
        if ld:
            car, held, can = ld[-1]; n_held = len([h for h in held.split(',') if h.strip()])
            note('G2', '적재 용량(함께 실리는 최대 · 만석 아님)', n_held >= 2 and bool(can.strip()), f'내 차 {car} · 잡은 콜 [{held}] → 추가 가능 [{can}]')
        else: note('G2', '적재 용량(함께 실리는 최대 · 만석 아님)', False, '«🚚 [적재 용량]» 줄 없음')
        # 원달앱 필터 = 서버가 보낸 것인가(«바뀌었나»가 아니다 — 필터 판 이름이 내용 해시라 받을 것이 안 바뀌면 원달앱도 안 바뀌는 것이 설계 · F35)
        #   원달앱은 목록 읽기 첫머리에서만 필터 판을 견준다(HijackService.kt:1598) — hand_keep 이 목록 복귀를 기다린 뒤 읽는다
        nk = re.findall(r'경유 갱신\] KEEP 후 destinationKeywords (\d+)개', t)
        app_kw, app_car = len(f1.get('destinationKeywords') or []), [v.strip() for v in (f1.get('allowedVehicleTypes') or [])]
        srv_car = [v.strip() for v in ld[-1][2].split(',') if v.strip()] if ld else None
        same = bool(nk) and app_kw == int(nk[-1]) and srv_car is not None and app_car == srv_car
        note('G2', '원달앱 필터 = 서버가 보낸 것(블루투스)', same,
             f'하차 키워드 원달앱 {app_kw} · 서버 {nk[-1] if nk else "?"} · 차종 원달앱 {app_car} · 서버 {srv_car} (KEEP 전 원달앱 {len(f0.get("destinationKeywords") or [])} · {f0.get("allowedVehicleTypes")})')
    except run.ToolStop as e: note('G2', '장면', None, str(e))
    except Stop as e: fail('G2', e)
    m2 = srv_mark()
    log('🟡 71: g1b 시작(모다아울렛 → 이안로지스 128m 앞 · 끝에서 40초)')
    mock_guard('g1b')
    # 하차는 콜 번호가 붙는 «📦 [하차지 도착] 번호»로 보고, 그 콜에 «[지나침] 하차지 … 번호»가 없으면 «도착 감지(서서)»로 선 것이다
    arrived = lambda oid: r'하차지 도착\] ' + oid
    passed = lambda oid: r'\[지나침\] 하차지[^\n]*' + oid
    k1, d1 = drop_expect(IAN); log(f'기대 — 첫짐 하차 {k1}(경로 끝 {G1B_GPX} 에서 {d1}m)')
    want = {'첫짐 상차 완료(지나침 400m)': r'\[지나침\] 상차지[^\n]*' + first, f'첫짐 하차 «{k1}»': arrived(first)}
    kinds = {f'첫짐 하차 «{k1}»': (k1, first)}
    if merge:
        k2, d2 = drop_expect(SUGWANG); log(f'기대 — 합짐 하차 {k2}(경로 끝에서 {d2}m · 500m 안이면 서서 도착 감지)')
        want.update({'합짐 상차 지나침': r'\[지나침\] 상차지[^\n]*' + merge, f'합짐 하차 «{k2}»': arrived(merge)})
        kinds[f'합짐 하차 «{k2}»'] = (k2, merge)
    end = time.time() + 20 * 60; got = {}
    while time.time() < end and f'첫짐 하차 «{k1}»' not in got:
        run.picker_watch(); t = srv_since(m2)
        for kk, p in want.items():
            if kk not in got and (at := srv_time(t, p)): got[kk] = at; log(f'  · {kk} {at}')
        time.sleep(3)
    time.sleep(45); shot(S23, 'G1_end'); t = srv_since(m2)
    for kk in want:
        ok, txt = kk in got, got.get(kk, '안 섬')
        if ok and kk in kinds:   # 섰다면 «기대한 길»(도착 감지 / 지나침)로 섰나
            kind, oid = kinds[kk]; via = '지나침' if re.search(passed(oid), t) else '도착 감지'
            ok = via == kind; txt = f'{txt} · {via}로 섬(기대 {kind})'
        note('G2' if '합짐' in kk else 'G1', kk, ok, txt)
    note('G1', '끝에 서 있는 동안 첫짐 하차 완료 안 섬(2km 떠나야)', not re.search(r'하차 완료\] ' + first, t), srv_time(t, r'하차 완료\] ' + first) or '안 섬 — 판 끝 정리에서 71 이 넘김')
    # G7 — 주행판정 · 출발
    dv = re.findall(r'^(\S+).*주행판정\] ([^\n]*)', t, re.M)
    first_drive = next((x for x, s2 in dv if re.search(r'→ drive|^drive', s2.split('→')[-1].strip())), None)
    long_idle = any('→ idle' in s2 for _, s2 in dv[:-1])
    note('G7', '달리는 동안 «운행 중»', bool(first_drive) and not long_idle, ' | '.join(f'{x} {s2[:40]}' for x, s2 in dv) or '주행판정 줄 0')
    dep = srv_time(srv_since(m), r'🚀 \[출발\]')
    note('G7', '«🚀 출발» GATHERING → DELIVERING', bool(dep), dep or '안 섬')
    at2 = app_since(a); jl = re.findall(r'\[위치 점프\]', srv_since(m))
    note('G1', '위치 점프', not jl, f'{len(jl)}번'); bt = at2.count('공급 연결 끊김'); note('G1', '블루투스 끊김', bt == 0, f'{bt}번')

def G11():
    """서랍 «취소» 탭 연습 콜 줄에 노란 «🐥 연습 끝»(38 F10 · 기사님 «가») — 연습 KEEP 하나 → ☰ → «취소» 탭 → 사진 → ✕ · 판정은 사진(⚪ · 눈)
       모드는 SIMULATION(자동 + 계약 안 함)으로 바꾸고, 끝에 main 의 finally 가 시작 모드로 되돌린다"""
    run.set_mode('SIMULATION'); run.sim_open('insung')
    pick = run.pickup_from_filter()
    n, m = app_mark(), srv_mark(); d = run.sim_call(30000, (run.app_filter().get('allowedVehicleTypes') or ['1t'])[0], pickup=pick)
    run.call_seen('insung', n, d)
    wait_for('app', n, r'확정 안 누름|상세 진입', 25, '원달앱이 연습 상세를 엶')
    run.keep_on_seat(m, '결재석 KEEP(연습 · G11)')
    t = wait_for('srv', m, r'연습 결재 처리 완료', 15, '연습 끝(SAFE_CANCEL)')
    note('G11', '연습 KEEP → 연습 끝', True, srv_time(t, '연습 결재 처리 완료'))
    time.sleep(3)
    tap_if(S23, 73, 176, lambda c, px: max(c) > 150, '서랍 ☰'); time.sleep(2)
    tap_if(S23, 392, 291, lambda c, px: any(max(px(x, 291)) > 120 for x in range(360, 430, 3)), '서랍 «취소» 탭'); time.sleep(1.5)
    shot_path = shot(S23, 'G11_drawer_cancel')
    tap_if(S23, 700, 171, lambda c, px: any(max(px(x, 171)) > 120 for x in range(684, 716, 2)), '서랍 ✕'); time.sleep(1.5)
    note('G11', '서랍 연습 콜 줄 «🐥 연습 끝»', None, f'사진 {shot_path} — 노란 «🐥 연습 끝» 배지 · «안전취소» 글 없음을 눈으로(관제앱이 F10 커밋 뒤 빌드여야 보임)')

def G3(): note('G3', '귀가', None, '기사님 손 필요 · 건너뜀 — 귀가는 필터 창 귀가 버튼(«🧭 국면 전환 DEST → HOME»), 스크립트는 필터 단추를 안 누름')

def G4():
    """화물24시 콜을 자동으로 잡기 — AUTO · 결재석 KEEP(진행 중 콜 하나 남음 · 하차 정리는 71)"""
    run.set_mode('AUTO'); run.sim_open('hwamul24')
    pick = run.pickup_from_filter()   # 그 순간 상차 목록에서(목록 밖이면 원달앱이 맞게 막는다)
    n, m = app_mark(), srv_mark(); d = run.sim_call(30000, (run.app_filter().get('allowedVehicleTypes') or ['1t'])[0], pickup=pick)
    run.call_seen('hwamul24', n, d)
    wait_for('app', n, r'\[AUTO\] 확정 버튼 클릭', 40, '원달앱 화물24시 자동 확정(배차신청)')
    note('G4', '자동 확정 누름', True, '배차신청')
    tm = wait_for('app', n, r'안전취소 타이머 가동', 10, '안전취소 타이머'); note('G4', '안전취소 타이머 30초', True, '가동')
    run.keep_on_seat(m, '결재석 KEEP(화물24시)')
    t = wait_for('srv', m, r'결재 처리 완료', 15, 'KEEP')
    k = wait_for('app', n, r'판결 KEEP 집행 완료|안전취소 타임아웃', 40, '원달앱 KEEP 집행')
    note('G4', 'KEEP 받고 취소 안 함', '안전취소 타임아웃' not in k, '판결 KEEP 집행 완료' if '집행 완료' in k else '타임아웃 — 취소함')

def G5():
    """관제앱이 뒤로 갔을 때 — S23 에 설정 화면을 1분 띄움 · 관제웹 소켓 · 원달앱 모드가 버티나(고치기 전에는 🔴 로 나옴)"""
    run.set_mode('AUTO'); m, a = srv_mark(), app_mark()
    adb(S23, 'shell', 'am', 'start', '-a', 'android.settings.SETTINGS'); log('S23 설정 화면을 앞으로 · 60초')
    time.sleep(60); t, at = srv_since(m), app_since(a)
    g = srv_time(t, '관제웹 없음')
    note('G5', '뒤로 가면 5초 뒤 알람 · 위치 끊김', None, f'설계대로 · 기사님 정하실 것 ① — 관제웹 없음 {g or "안 섬"} · 원달앱 {"AUTO → ALARM" if "AUTO → ALARM" in at else "그대로"}')
    revive_G5()

def revive_G5():
    adb(S23, 'shell', 'am', 'start', '-n', 'kr.co.onedal.dashboard/.MainActivity', check=False); time.sleep(5); log('되살리기 G5 — 관제앱을 앞으로')

def G6_variant(gap_sec, label):
    """블루투스 껐다 켬 한 변형 — 71 지시(F25): «공급 연결 살아남» 직후 «관제앱 끊김·공급 연결 끊김»(옛 연결의 늦은 알림)이 이어지는지 본다"""
    a = app_mark()
    adb(A24, 'shell', 'cmd', 'bluetooth_manager', 'disable'); time.sleep(gap_sec); adb(A24, 'shell', 'cmd', 'bluetooth_manager', 'enable')
    log(f'A24 블루투스 껐다 켬({label} 간격)')
    try:
        wait_for('app', a, r'공급 연결 살아남', 60, f'{label} 블루투스 다시 붙음'); note('G6', f'{label} 60초 안에 다시 붙음', True, '붙음')
    except Stop:
        note('G6', f'{label} 60초 안에 다시 붙음', False, '안 붙음'); revive_G6(); return
    time.sleep(8); at = app_since(a)
    idx = at.find('공급 연결 살아남')
    tail = at[idx:] if idx >= 0 else at
    stale = re.search(r'관제앱 끊김[^\n]*\n[^\n]*공급 연결 끊김', tail)
    note('G6', f'{label} F25(살아남 직후 옛 연결 끊김 알림)', not bool(stale), (stale.group(0)[:200] if stale else '안 생김'))

def G6():
    """원달앱 폰 블루투스 껐다 켬 — 60초 안에 다시 붙나(고치기 전에는 🔴 로 나옴) · 되살리기는 접근성 비활성화 → 활성화 · 두 변형(3초·1초 간격)으로 F25 확인"""
    G6_variant(3, '3초')
    time.sleep(10)
    G6_variant(1, '1초')

def revive_G6():
    """기사님이 손으로 하신 것과 같은 일 — 원달앱 접근성 비활성화 → 활성화"""
    before = adb(A24, 'shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').strip()
    rest = ':'.join(s for s in before.split(':') if s and s != ACC_SERVICE)
    a = app_mark()
    adb(A24, 'shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', rest or 'null'); time.sleep(3)
    adb(A24, 'shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', ':'.join(x for x in (rest, ACC_SERVICE) if x))
    adb(A24, 'shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1'); log('되살리기 G6 — 원달앱 접근성 비활성화 → 활성화')
    try: wait_for('app', a, r'공급 연결 살아남', 90, '되살리기 뒤 블루투스'); note('G6', '되살리기 뒤 붙음', True, '붙음')
    except Stop: note('G6', '되살리기 뒤 붙음', False, '안 붙음 — 71 에게')

def G8():
    """관제웹만 잠깐 끊김 — S23 wifi · 데이터 3초 끊음. 무선 adb 도 함께 끊겨 폰 안에서 «끔 → 3초 → 켬»을 혼자 돌리고 다시 붙는다"""
    run.set_mode('AUTO'); m, a = srv_mark(), app_mark()
    adb(S23, 'shell', "nohup sh -c 'svc wifi disable; svc data disable; sleep 3; svc wifi enable; svc data enable' >/dev/null 2>&1 &", check=False)
    log('S23 wifi · 데이터 3초 끊음(폰 안에서)'); time.sleep(25)
    for _ in range(6):
        if 'connected' in subprocess.run(['adb', 'connect', S23], capture_output=True, text=True, timeout=20).stdout: break
        time.sleep(5)
    else: note('G8', '무선 adb 다시 붙음', False, '안 붙음 — 무선 디버깅이 꺼졌을 수 있음 · 71 에게'); return
    t, at = srv_since(m), app_since(a)
    g, c = srv_time(t, '관제웹 잠깐 끊김'), srv_time(t, r'\[소켓 연결\]')
    note('G8', '끊김 → 다시 붙음', bool(g and c), f'{g} → {c}')
    note('G8', '관제웹 없음 안 섬(5초 안)', '관제웹 없음' not in t, srv_time(t, '관제웹 없음') or '0')
    if '관제웹 없음' in t:   # 5초를 넘긴 경우 — 다시 붙으면 자동으로 돌아와야 함
        note('G8', '다시 붙은 뒤 자동으로 돌아옴', '관제웹 붙음' in t and 'ALARM → AUTO' in at, srv_time(t, '관제웹 붙음') or '관제웹 붙음 없음')
    else: note('G8', '5초 안 · 원달앱 자동 그대로', 'AUTO → ALARM' not in at, '흔들림' if 'AUTO → ALARM' in at else '그대로')

def G9(): raise Stop('로컬 서버(pnpm dev) 껐다 켜기는 기사님 허락이 있어야 — 이 스크립트는 하지 않는다')

def G10():
    """두 폰 2시간 — 10분마다 배터리 · 온도 · 원달앱 접근성 · 관제앱 앞 화면"""
    end = time.time() + 120 * 60; m, a = srv_mark(), app_mark()
    while time.time() < end:
        for dev, name in ((A24, 'A24'), (S23, 'S23')):
            b = adb(dev, 'shell', 'dumpsys', 'battery', check=False)
            lv = re.search(r'level: (\d+)', b); tp = re.search(r'temperature: (\d+)', b)
            log(f'{name} 배터리 {lv.group(1) if lv else "?"}% · 온도 {int(tp.group(1)) / 10 if tp else "?"}℃ · 앞 {run.focus_of(dev)[:50]}')
        acc = ACC_SERVICE in adb(A24, 'shell', 'settings', 'get', 'secure', 'enabled_accessibility_services', check=False)
        if not acc: note('G10', '원달앱 접근성', False, '꺼짐')
        time.sleep(600)
    t, at = srv_since(m), app_since(a)
    note('G10', '통신 두절 0', '통신 두절' not in t, f'{t.count("통신 두절")}번')
    note('G10', '블루투스 끊김 0', '공급 연결 끊김' not in at, f'{at.count("공급 연결 끊김")}번')
    note('G10', '2시간', True, '끝 — 배터리 · 온도는 위 줄(첫 측정 기준)')

REVIVE = {'G5': revive_G5, 'G6': revive_G6, 'G8': lambda: adb(S23, 'shell', 'svc', 'wifi', 'enable', check=False)}

def fail(scene, e):
    log(f'🔴 {scene} 실패 — {e}')
    RESULTS.setdefault(scene, []).append({'what': '장면', 'ok': False, 'text': str(e), 'at': datetime.datetime.now().strftime('%H:%M:%S')})
    for dev, n in ((A24, 'A24'), (S23, 'S23')):
        try: shot(dev, f'{scene}_fail_{n}')
        except Exception: pass
    log('서버 마지막 줄: ' + srv_since(max(0, srv_mark() - 1)).strip()[:120])

START_MODE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'start_mode.txt')
def mark_start():
    """R0(pnpm reset:calls) 전에 따로 부른다 — 서버 재기동 직후엔 블루투스 재접속 전이라 suppliedMode 를 잘못 읽을 수 있다(72판 — AUTO 인데 ALARM 으로 읽음)"""
    m = run.supplied_mode(); open(START_MODE_FILE, 'w').write(m or ''); log(f'시작 모드 미리 적어 둠 — {m}')

RUN_ID = os.environ.get('RUN_ID', '판 이름 없음')   # 판 이름 — `RUN_ID=74판 python3 g.py …` 로 준다(장부 runs 의 id)
STOP_FILE = 'out/STOP'   # 이 파일이 있으면 다음 장면 전에 멈춘다(finally 는 돈다) — `touch out/STOP`

class Interrupted(BaseException): pass
def _interrupt(signum, frame): raise Interrupted(f'신호 {signal.Signals(signum).name}')

def main(scenes):
    started = datetime.datetime.now()
    # 🔴 G10(2시간)은 따로 부를 때만 · 늘 맨 끝 — 앞 장면이 실패해도 2시간으로 흘러들지 않게
    scenes = [s for s in scenes if s != 'G10'] + (['G10'] if 'G10' in scenes else [])
    # 🔴 백그라운드(&)로 띄우면 SIGINT 가 무시된다 — 처리기를 직접 걸어 SIGINT · SIGTERM 도 finally(모드 되돌림 · 장부)를 탄다
    signal.signal(signal.SIGINT, _interrupt); signal.signal(signal.SIGTERM, _interrupt)
    if os.path.exists(STOP_FILE): os.remove(STOP_FILE)
    try: start = open(START_MODE_FILE).read().strip() or None
    except FileNotFoundError: start = None
    if start: log(f'시작 모드(R0 전에 적어 둔 값) {start} — 끝에 되돌린다 · 장면 {scenes}')
    else: start = run.supplied_mode(); log(f'⚠️ R0 전 기록이 없어 지금 읽음(서버 재기동 직후면 틀릴 수 있음) {start} — 장면 {scenes}')
    revive_G5()   # 판 시작 — S23 관제앱을 앞으로(앞 판이 남긴 화면이 있으면 누르기 전 확인에서 멈춘다)
    # 앞 판이 본 콜 지문이 이번 판 콜을 «이미 본 콜»로 막지 않게 — 단 자동(AUTO)이면 비운 순간 시뮬 목록의 옛 콜을 잡을 수 있어 건너뛴다
    if start == 'AUTO': log('본 콜 기억 비움 건너뜀 — 시작 모드 AUTO(옛 콜을 잡을 수 있음) · 막히면 call_seen 이 그 자리에서 비운다')
    else:
        try: run.forget_seen('판 시작(R0)')
        except Exception as e: log(f'⚠️ 본 콜 기억 비움 못 함: {e} — 막히면 call_seen 이 다시 비운다')
    signal.signal(signal.SIGALRM, _alarm)
    try:
        for sc in scenes:
            if os.path.exists(STOP_FILE): log(f'⏹️ {STOP_FILE} 있음 — {sc} 전에 멈춤(정리는 돈다)'); break
            log(f'━━ {sc} 시작 (한도 {LIMIT_MIN.get(sc, 10)}분)')
            signal.alarm(LIMIT_MIN.get(sc, 10) * 60)
            try: globals()[sc]()
            except run.ToolStop as e:
                note(sc, '장면', None, str(e)); log(f'⚪ {sc} 시험 도구로 멈춤 — 다음 장면으로')
            except Exception as e:
                fail(sc, e)
                try: (REVIVE.get(sc) or (lambda: None))()
                except Exception as e2: log(f'되살리기 실패 {e2}')
            finally: signal.alarm(0)
    except Interrupted as e:
        log(f'⏹️ {e} — 멈춤(정리는 돈다)')
    finally:
        try:
            if start and run.supplied_mode() != start: run.set_mode(start)
        except Exception as e: log(f'⛔ 모드 되돌리기 못 함: {e} — 71 에게')
        json.dump(RESULTS, open('out/g_results.json', 'w'), ensure_ascii=False, indent=1)
        try:   # 시험 장부에 한 판을 덧붙임(덮어쓰지 않음) — 고칠 곳 · 고친 뒤 확인을 따라가게
            _, changed = ledger.append(RUN_ID, started, RESULTS, f'24 g.py {" ".join(scenes)} · GPS JoyStick(71) · 시뮬 개별콜 · 시뮬 다시 켬 {len(run.SIM_REOPENS)}번', A24, S23)
            log(f'📒 장부 {ledger.LEDGER} — {RUN_ID} 덧붙임 · {", ".join(changed) or "F 변화 없음"}')
        except Exception as e: log(f'⛔ 장부 못 씀: {e} — 71 에게')
        log('━━ 끝 — out/g_results.json')
        log(f'🔁 시뮬 다시 켬 {len(run.SIM_REOPENS)}번 — ' + ' · '.join(f'{t} {net} {why}' for t, net, why in run.SIM_REOPENS))
        for sc, rows in RESULTS.items():
            for r in rows: log(f'{mark(r["ok"])} {sc} {r["what"]} — {r["text"]}')

if __name__ == '__main__':
    if sys.argv[1:2] == ['mark-start']: mark_start()
    else: main([a for a in sys.argv[1:] if a.startswith('G')] or ['G1', 'G5', 'G8', 'G6'])
