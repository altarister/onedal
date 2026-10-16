#!/usr/bin/env python3
"""JoyStick 흐름 검사 — 폰 없이 가짜 JoyStick(하루 경로를 따라 걷는 위치 · ▶/❚❚ 한 단추 · 가짜 시계)으로 day.py 의 joystick 동작을 실제로 부른다.
잡는 것: «설 때까지 기다림»(wait)이 중간 정거장 450m 안에서 선 뒤에야 돌아오나 · 집이면 경로 끝에서 선 뒤에야 · 기다리다 엉뚱한 데서 서면 곧바로 멈추나 · 기다림 없으면 바로 돌아오고 뒤 감시가 정거장 앞에서 세우나.
못 잡는 것: 진짜 JoyStick 화면(띠가 숨음 · 광고 · 색 찾기) · 진짜 GPS 흔들림 · 서버 도착 감지 — 판에서만 보인다.
쓰는 법: python3 phone-e2e-test/joy_check.py   (실패가 있으면 exit 1)"""
import math, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault('S23', 'fake-s23')   # run.py 가 들여올 때 adb 로 S23 을 찾지 않게
sys.argv = ['day.py', os.path.join(HERE, 'day1.json')]
sys.path.insert(0, HERE)
import sheet, day, g

R = sheet.route()
CUM = [0.0]
for i in range(1, len(R)): CUM.append(CUM[-1] + sheet.dist_m(R[i - 1], R[i]))
SPEED = 20.0   # m/s — JoyStick 속도 칸(약 70km/h)

class Joy:
    """가짜 JoyStick — s(경로 위 거리) · 달리는 중인가 · 가짜 시계"""
    def __init__(self, s): self.s, self.playing, self.clock, self.taps, self.pause_at = s, False, 1_000_000.0, [], None
    def pos(self):
        k = max(i for i in range(len(CUM)) if CUM[i] <= self.s)
        if k >= len(R) - 1: return R[-1]
        t = (self.s - CUM[k]) / max(1e-9, CUM[k + 1] - CUM[k])
        return (R[k][0] + (R[k + 1][0] - R[k][0]) * t, R[k][1] + (R[k + 1][1] - R[k][1]) * t)
    def sleep(self, dt):
        self.clock += dt
        if self.pause_at and self.clock >= self.pause_at: self.playing, self.pause_at = False, None   # 누가 중간에 ❚❚ 를 누름
        if self.playing:
            self.s = min(CUM[-1], self.s + SPEED * dt)
            if self.s >= CUM[-1]: self.playing = False   # «도착시 멈춤»
    def find(self, color, *a, **k):
        want_play = tuple(color) == tuple(day.TAPS['joy.play']['color'])
        return (1, 1) if (want_play and not self.playing) or (not want_play and self.playing) else None
    def tap(self, name):
        if not self.find(day.TAPS[name]['color']): raise day.Stop(f'«{name}» 를 띠에서 못 찾음')
        self.playing = name == 'joy.play'; self.taps.append((round(self.clock), name))
    def fused(self):
        la, lo = self.pos(); return f'Location[fused {la:.6f},{lo:.6f} hAcc=5 mock]'

def near_s(key):
    P = day.SCEN['places'][key]; q = (P[3], P[2])
    return CUM[min(range(len(R)), key=lambda i: sheet.dist_m(q, R[i]))]

def install(j):
    time.time, time.sleep = (lambda: j.clock), j.sleep
    day.joy_find, day.joy_tap, g.fused_last = j.find, j.tap, j.fused
    day.joy_off_at_end = lambda: None   # 진짜 JoyStick 을 끄는 자리 — 가짜에는 없다
    day.log = lambda *a, **k: None

STARTED = []
class FakeThread:   # 기다림 없는 줄이 띄우는 뒤 감시 — 띄웠다는 것만 적고, 검사가 따로 부른다
    def __init__(self, target, args=(), daemon=None): self.target, self.args = target, args
    def start(self): STARTED.append(self)
day.threading.Thread = FakeThread

fails = []
def check(name, ok, why):
    print(f'{"✅" if ok else "🔴"} {name} — {why}')
    if not ok: fails.append(name)

def dist_to(j, key):
    P = day.SCEN['places'][key]; return sheet.dist_m(j.pos(), (P[3], P[2]))

real_time, real_sleep = time.time, time.sleep
try:
    # ① S20 앞 — 중리동에 서 있다가 «곤지암 765 지나 서기(기다림)»
    j = Joy(near_s('jungri')); install(j)
    day.act({'joystick': {'stopAt': 'gj765p', 'wait': True}})
    check('기다림 · 중간 정거장', not j.playing and dist_to(j, 'gj765p') < 500,
          f'돌아온 때 {"달리는 중" if j.playing else "섬"} · gj765p 까지 {dist_to(j, "gj765p"):.0f}m (450m 앞에서 서야 함)')
    check('기다림 · 다른 데서 안 섬', j.s > near_s('gj765') + 500, f'곤지암 765 를 {j.s - near_s("gj765"):.0f}m 지남(C6b 상차 «지나침» 그대로)')
    # ② 이어서 «집까지 재생(기다림)»
    day.act({'joystick': {'stopAt': 'home', 'wait': True}})
    check('기다림 · 경로 끝(집)', not j.playing and j.s >= CUM[-1] - 1, f'돌아온 때 경로 {j.s:.0f}/{CUM[-1]:.0f}m · {"달리는 중" if j.playing else "섬"}')
    # ③ S11 처럼 기다림 없이 — 바로 돌아오고, 뒤 감시가 관고동 앞에서 세운다
    STARTED.clear(); j = Joy(near_s('moda')); install(j)
    day.act({'joystick': {'stopAt': 'gwango'}})
    check('기다림 없음 · 바로 돌아옴', j.playing and dist_to(j, 'gwango') > 500, f'돌아온 때 {"달리는 중" if j.playing else "섬"} · 관고동까지 {dist_to(j, "gwango"):.0f}m')
    check('기다림 없음 · 뒤 감시 띄움', len(STARTED) == 1 and STARTED[0].target is day.joy_pause_near, f'뒤 감시 {len(STARTED)}개')
    if STARTED: STARTED[0].target(*STARTED[0].args)
    check('뒤 감시 · 관고동 앞에서 섬', not j.playing and dist_to(j, 'gwango') < 500, f'관고동까지 {dist_to(j, "gwango"):.0f}m · {"달리는 중" if j.playing else "섬"}')
    # ④ 기다리는 중에 누가 중간에서 세움 — 영영 안 닿으니 30분이 아니라 곧바로 ⚪ 로 멈춰야(판 8 30분 헛기다림)
    j = Joy(near_s('jungri')); install(j); j.pause_at = j.clock + 60; t0 = j.clock
    try: day.act({'joystick': {'stopAt': 'home', 'wait': True}}); stopped = False
    except day.ToolStop: stopped = True
    check('기다림 · 중간에 섬 → 곧바로 멈춤', stopped and j.clock - t0 < 120, f'{"⚪ 멈춤" if stopped else "안 멈춤"} · 걸린 가짜 시간 {j.clock - t0:.0f}초')
    j = Joy(near_s('jungri')); install(j); j.pause_at = j.clock + 60; t0 = j.clock
    try: day.act({'joystick': {'stopAt': 'gj765p', 'wait': True}}); stopped = False
    except day.ToolStop: stopped = True
    check('기다림 · 중간 정거장 전에 섬 → 곧바로 멈춤', stopped and j.clock - t0 < 120, f'{"⚪ 멈춤" if stopped else "안 멈춤"} · 걸린 가짜 시간 {j.clock - t0:.0f}초')
except Exception as e:
    fails.append('예외'); print(f'🔴 예외 — {type(e).__name__}: {e}')
finally:
    time.time, time.sleep = real_time, real_sleep

print(f'JoyStick 흐름 검사 — 🔴 {len(fails)}')
sys.exit(1 if fails else 0)
