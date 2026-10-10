"""
M1 — S23 GPS JoyStick 경로 재생으로 실제 폰 위 모의 주행 (72판 · 실행은 판이 정해진 뒤)
JoyStick 화면 · 단추는 누르지 않는다(71 이 함). 이 스크립트는 A24 시뮬 · S23 모드 칸만 누른다.
쓰는 법: python3 m1.py   — 콜을 잡은 뒤 «71: 경로 재생 시작»을 찍고, S23 이 움직이기 시작하면 따라간다.
"""
import re, sys, time, math, statistics
import run
from run import A24, S23, log, Stop, app_mark, app_since, srv_mark, srv_since, wait_for, tap_if, teal, shot

HOME = (37.3776, 127.2947)
PICKUP = ('경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점', '초월읍', 127.312587, 37.363298)   # 경로 2.26km · 경로 위 0m
DROP = ('경기 이천시 신둔면 경충대로 3035-1 이안로지스', '신둔면', 127.407889, 37.297660)           # 경로 19.76km 에서 131m · 끝점에서 501m
MAX_MIN = 45

def km(a, b):
    R = 6371; dl = math.radians(b[0] - a[0]); dn = math.radians(b[1] - a[1])
    h = math.sin(dl / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dn / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def sim_call_route(fare):
    """상차 · 하차를 경로 위 두 곳으로 — 둘 다 서버 지오 캐시에 있어 카카오를 안 부른다"""
    import json, urllib.request
    body = {'pickup': dict(zip(('addressDetail', 'region', 'lon', 'lat'), PICKUP)),
            'dropoff': dict(zip(('addressDetail', 'region', 'lon', 'lat'), DROP)), 'fare': fare, 'vehicleType': '오토바이'}
    r = urllib.request.urlopen(urllib.request.Request('http://localhost:4000/api/sim/calls', json.dumps(body).encode(), {'Content-Type': 'application/json'}))
    log(f'📦 콜 넣음 → 초월읍 모다아울렛 → 신둔면 이안로지스 · {fare} · 오토바이 · {r.read().decode()[:60]}')

def positions(txt):
    """서버 «📍 [위치] 경도,위도 · N m 이동 · S km/h · 출처 X» 줄"""
    return [(float(y), float(x), int(s), src) for x, y, s, src in
            re.findall(r'📍 \[위치\] ([\d.]+),([\d.]+) · \d+m 이동 · (\d+)km/h · 출처 (\w+)', txt)]

def main():
    start_mode = run.running_mode(); log(f'시작 모드 {start_mode} — 끝에 이 값으로 되돌린다')
    try:
        run.set_mode('ALARM')
        f = run.app_filter()
        if '신둔면' not in f.get('destinationKeywords', []): raise Stop('하차 목록에 신둔면이 없음 — 필터는 안 바꾼다 · 71 에게')
        if '오토바이' not in (f.get('allowedVehicleTypes') or []): raise Stop('오토바이를 못 실음 — 만석 · 71 에게')

        FOLLOW = 'follow' in sys.argv   # 콜은 이미 잡았다 — 따라가기만 다시
        m0 = srv_mark()
        if not FOLLOW:
            # ① 콜 하나를 손 확정으로 잡는다(알람 · 원달앱 삑 뒤)
            run.sim_open('insung'); n, m0 = app_mark(), srv_mark(); sim_call_route(27000 + int(time.time()) % 50 * 10)
            run.call_seen('insung', n, DROP[1])
            wait_for('app', n, r'상세 진입', 25, '원달앱이 상세를 엶')
            wait_for('app', n, r'\[삑\]', 15, '원달앱 삑')
            for _ in range(8):
                try: tap_if(A24, 156, 2001, teal, '인성 상세 «확정»(손)'); break
                except Stop as e:
                    if '앞 창' in str(e): raise
                    time.sleep(0.5)
            else: raise Stop('확정 단추를 못 봄')
            wait_for('srv', m0, r'출생\].*상차지 통화', 15, '상차지 통화 단계 출생')
            shot(S23, 'M1_ready')

        # ② 71 이 JoyStick 경로 재생을 켤 때까지 — S23 위치가 집에서 150m 벗어나면 시작
        log('🟡 준비됨 — 71: S23 JoyStick 경로 재생 시작(55km/h)'); a0 = app_mark()
        end = time.time() + 600
        while time.time() < end:
            p = positions(srv_since(m0))
            if p and km(HOME, p[-1][:2]) > 0.15: break
            time.sleep(3)
        else: raise Stop('10분 안에 S23 이 안 움직임')
        t0 = time.time(); m = srv_mark(); log(f'🚗 움직임 시작 — 서버 위치 {p[-1][:2]}')

        # ③ 따라가며 본다 — 상차 지나침 · 하차 지나침/도착 · 위치 점프 · 블루투스
        seen, shots_at = {}, [3, 12, 22]
        marks = {'상차 감시': r'지나침 감시 시작\] 상차지', '상차 지나침': r'\[지나침\] 상차지', '상차 도착': r'도착 감지\] 상차지',
                 '하차 감시': r'지나침 감시 시작\] 하차지', '하차 지나침': r'\[지나침\] 하차지', '하차 도착': r'도착 감지\] 하차지'}
        while time.time() - t0 < MAX_MIN * 60:
            run.picker_watch(); txt = srv_since(m)
            for k, pat in marks.items():
                if k not in seen:
                    mm = re.search(r'^(\S+).*' + pat + r'[^\n]*', txt, re.M)
                    if mm:
                        p = positions(txt[:mm.start()]); here = p[-1][:2] if p else None
                        seen[k] = mm.group(1); log(f'✅ {k} {mm.group(1)} · 그때 위치 {here} · 상차지까지 {km(here, (PICKUP[3], PICKUP[2])) * 1000:.0f}m · 하차지까지 {km(here, (DROP[3], DROP[2])) * 1000:.0f}m' if here else f'✅ {k} {mm.group(1)}')
            mins = (time.time() - t0) / 60
            if shots_at and mins >= shots_at[0]: shots_at.pop(0); shot(S23, f'M1_map_{int(mins)}m')
            if ('하차 지나침' in seen or '하차 도착' in seen) and mins > 3: break
            time.sleep(5)
        time.sleep(60)   # 끝점 정차 · 마지막 줄을 더 받는다
        shot(S23, 'M1_end')

        # ④ 셈
        txt, atxt = srv_since(m), app_since(a0)
        p = positions(txt); sp = [s for *_, s, src in p if s > 0]
        # 텔레포트 시작(경로 첫 점 = 집)으로 생기는 집 근처 점프는 뺀다(71)
        jl = re.findall(r'\[위치 점프\][^\n]*→ ([\d.]+),([\d.]+)', srv_since(m0))
        jumps = sum(1 for x, y in jl if km(HOME, (float(y), float(x))) > 0.5); log(f'위치 점프 전체 {len(jl)} · 집 근처(텔레포트) 뺌 {len(jl) - jumps}'); bt = atxt.count('공급 연결 끊김'); srcs = sorted({src for *_, src in p})
        log(f'위치 줄 {len(p)} · 출처 {srcs} · 속도 중앙값 {statistics.median(sp) if sp else "?"}km/h · 최소 {min(sp) if sp else "?"} · 최대 {max(sp) if sp else "?"}')
        log(f'① 위치 점프 {jumps}번(0 이 통과) · ④ 공급 연결 끊김 {bt}번(0 이 통과)')
        log('②③ ' + ' · '.join(f'{k} {v}' for k, v in seen.items()) + f' — 빠진 것: {[k for k in marks if k not in seen]}')
        dv = [int(v) for v in re.findall(r'주행판정\] drive (\d+)km/h', txt)]
        log(f'관제웹 주행판정 drive {len(dv)}줄 · 중앙값 {statistics.median(dv) if dv else "?"} · 최소 {min(dv) if dv else "?"} · 최대 {max(dv) if dv else "?"} km/h')
        log('⑤ 지도 사진: out/*M1_map_*.png · M1_end')
    finally:
        try:
            if start_mode and run.running_mode() != start_mode: run.set_mode(start_mode)
        except Stop as e: log(f'⛔ 모드 되돌리기 못 함: {e} — 71 에게')

if __name__ == '__main__':
    try: main()
    except Stop as e: log(f'⛔ 멈춤: {e}'); sys.exit(1)
