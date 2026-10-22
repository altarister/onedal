#!/usr/bin/env python3
"""실행기 — 문제지(problems.json)를 장면 · 줄 차례로 돌려 최신 결과지(out/result_*.json)에 줄마다 적는다.
적는 쪽이 스크립트인 줄은 day.py 의 동작 · 기다림 · 확인을 불러 돌리고, 사람 줄은 장면 표에서 체크될 때까지 기다린다
(그 장면의 마지막 스크립트 줄보다 뒤에 있는 사람 줄 — 결과 알림 — 은 안 기다림). 틀리면 onFail 대로: stop 은 판을 멈추고, continue 는 까닭을 notes 에 적고 다음 줄.
쓰는 법: python3 phone-e2e-test/runner.py [--new] [--only S01,S02] [--from S05] [--dry] [--midnight — 자정 30분 안에도 돌림]"""
import glob, json, os, re, sys, time

import sheet
HERE = sheet.HERE
P = sheet.problems()
A = sys.argv[1:]
arg = lambda n: A[A.index(n) + 1] if n in A and A.index(n) + 1 < len(A) else None
DRY = '--dry' in A

sys.argv = ['day.py', os.path.join(HERE, 'day1.json')] + (['--dry'] if DRY else [])
sys.path.insert(0, HERE)   # day.py 의 import run 이 같은 폴더의 폰 조작 모듈(run.py)을 찾게
import day, make_result, lint
from day import Stop, ToolStop, log
if DRY:   # 폰 없이 볼 때는 문제지 검사를 먼저 — 판에서 헛 🔴 가 날 자리를 미리 찍는다
    for line in lint.lint(P): log(line)
    jc = __import__('subprocess').run([sys.executable, os.path.join(HERE, 'joy_check.py')], capture_output=True, text=True)   # JoyStick 흐름(설 때까지 기다림 · 뒤 감시)을 가짜 JoyStick 으로 — 판 7 · 8 S20 같은 도구 실수를 판 전에
    log((jc.stdout.strip().splitlines() or ['JoyStick 흐름 검사 — 출력 없음'])[-1] + ('' if jc.returncode == 0 else ' — 🔴 joy_check.py 를 따로 돌려 볼 것'))

# 🌙 자정 30분 안에는 판을 시작하지 않는다 — 자정은 영업일 경계(필터가 평소 값으로 돌고 예약 보관이 넘어감)라 자정을 걸치는 판은 콜 시각과 무관하게 갈린다(10-22 23:16 S04) · 굳이 돌리려면 --midnight
#    «30분»은 판이 30분 안에 끝난다는 가정이다 — 하루 경로 전체처럼 긴 판은 그보다 일찍 시작해도 자정을 걸친다(시작 시각을 판 길이만큼 당겨 고른다)
if not DRY and '--midnight' not in A:
    _now = time.localtime()
    if _now.tm_hour == 23 and _now.tm_min >= 30:
        log(f'⛔ 자정 {60 - _now.tm_min}분 전 — 판이 영업일 경계를 걸친다 · 자정 뒤에 돌리거나 --midnight'); sys.exit(1)
# ── 결과지 — 실행기는 자기가 돈 줄 하나만 적는다(장면 표에서 누른 다른 줄을 덮지 않게 매번 읽고 고쳐 씀)
def result_path():
    if '--new' in A or not glob.glob(os.path.join(HERE, 'out', 'result_*.json')): return make_result.make()
    return sorted(glob.glob(os.path.join(HERE, 'out', 'result_*.json')))[-1]
RP = None if DRY else result_path()

def read(cid):
    return json.load(open(RP, encoding='utf8'))['checks'].get(cid)

def write(cid, ok, why=None):
    if DRY: return
    r = json.load(open(RP, encoding='utf8')); r['checks'][cid] = ok
    if why: r['notes'][cid] = why
    else: r['notes'].pop(cid, None)
    json.dump(r, open(RP, 'w', encoding='utf8'), ensure_ascii=False, indent=1)

# ── 문제지 줄 → day.py 가 받는 모양
def do_item(c):
    k, a = c['run'], c['args']
    one = {'mark': 'what', 'tap': 'name', 'tap_if_cod': 'name', 'mode': 'mode', 'ble': 'state', 'sleep': 'sec', 'photo': 'phone'}
    if k in one: return {k: a[one[k]]}
    if k == 'sim': return {k: {'net': a['net'], 'fresh': True} if a.get('fresh') else a['net']}
    if k in ('wait_app', 'wait_srv'): return {k: {'re': a['re'], 'sec': c['target']['sec']}}
    return {k: dict(a)}

def check_item(c):
    a = c['args']; k = a['kind']
    return {k: {
        'app_filter_city': lambda: {'city': a.get('city')},
        'none_app': lambda: [a.get('re')],
        'not_server': lambda: a.get('re'),
        'count_server': lambda: {a.get('re'): a.get('n')},
        'app_filter_eq_server': lambda: True,
        'app_pickup_has': lambda: {'dong': a.get('dong'), 'sec': (c.get('target') or {}).get('sec', 30)},
        'web_drive': lambda: True,
        'via': lambda: {a.get('call'): a.get('kind_of')},
        'server_last_set': lambda: {'re': a.get('re'), 'want': a.get('want')},
        'db_same_as_snapshot': lambda: a.get('tables'),
        's23_no_mock': lambda: {'sec': (c.get('target') or {}).get('sec', 180)},
        's23_joy_off': lambda: True,
        's23_no_net_location': lambda: True,
    }[k]()}

def wait_row(c, sid):
    a = c['args']; src = 'srv' if a['src'] == 'server' else 'app'
    if a.get('ifBound') and a['ifBound'] not in day.BIND: return None, f'{a["ifBound"]} 콜이 이번 판에 없음 — 건너뜀'
    mk = day.SMARK.get(a['sinceBind'], day.STEP_MARK[0]) if a.get('sinceBind') and src == 'srv' else (day.STEP_MARK[0] if src == 'srv' else day.PENDING['amark'])
    rx, sec = day.sub(a['re']), c['target']['sec']
    try:
        day.wait_for(src, mk, rx, sec, rx); return True, None
    except Stop as e:
        if not a.get('orHand'): raise
        hm = day.srv_mark()
        for name in a['orHand']: day.tap(name)
        day.wait_for('srv', hm, a['handRe'], 30, a['handRe'])
        return True, f'저절로 안 서서 설명서대로 손 — {a.get("why", "")} ({e})'

PRE = [None]   # 이 장면 기준점(서버 · 원달앱 기록 줄 수) — 장면 머리에서 찍어 scene_start 가 쓴다

def run_row(c, sid):
    """(ok, 까닭) — ok: True ✅ · False 🔴 · None ⚪(시험 도구 · 건너뜀)"""
    k = c['run']
    if k == 'scene_start':
        day.CUR[0] = sid
        if not DRY: day.STEP_MARK[0], day.PENDING['amark'] = PRE[0] or (day.srv_mark(), day.app_mark())
        return True, None
    if DRY:   # 폰 없이 — 줄마다 day.py 가 받는 모양으로 바꿔 보기만(바꾸는 규칙이 틀린 줄을 미리 찾음)
        item = (None if c['args']['kind'] == 'judge_color' else check_item(c)) if k == 'check' else None if k == 'wait' else do_item(c)
        return None, f'--dry {item or c["args"]}'
    n0 = len(day.RESULTS.get(sid, []))
    try:
        if k == 'wait': ok, why = wait_row(c, sid)
        elif k == 'check' and c['args']['kind'] == 'judge_color':   # 서버 «🎨 [판정]» 줄의 그 콜 색 — 기다렸다 읽고 want 와 견줌
            a, end, col = c['args'], time.time() + (c.get('target') or {}).get('sec', 60), None
            while time.time() < end and not col: col = day.color_of(a['bind']); col or time.sleep(1)
            if not col: return None, f'⚪ {a["bind"]} 판정 색을 못 읽음'
            if col[1] == '?': return None, f'⚪ {a["bind"]} 판정 잴 수 없음({col[0]}) — 까닭이 다른 🔴(카카오 실패 · 주소 못 찾음 등)라 기대 색과 견주지 않음'
            if col[0] == a['want'] and a.get('because') and not re.search(a['because'], col[2]):   # 색은 맞는데 까닭이 다른 🔴(늦음 · 카카오 실패) — 빈칸이 메워졌다고 읽지 않는다(판 5 S09)
                # col[2] 는 «점»과 «— 돈» 사이(잡으면 사고 사유)만이다 — 줄 끝 «딱지: 주소 대략 …»은 색과 무관하게 늘 붙으니 줄 전체로 넓히면 다른 까닭의 🔴 도 ✅ 가 된다
                return None, f'⚪ {a["bind"]} 판정 {col[0]} {col[1]}점 — 까닭에 «{a["because"]}» 없음(다른 까닭: {col[2].strip()[:60]})'
            ok, why = col[0] == a['want'], f'{col[0]} {col[1]}점' + (f' — 알려진 빈칸 {c["knownGap"]}' if c.get('knownGap') and col[0] != a['want'] else '')
            return ok, why
        elif k == 'check': day.checks(sid, check_item(c)); ok, why = True, None
        else: day.act(do_item(c)); ok, why = True, None
    except ToolStop as e: return None, str(e)
    except Stop as e: return False, str(e)
    except KeyboardInterrupt: raise
    except Exception as e: return False, f'{type(e).__name__}: {e}'
    new = day.RESULTS.get(sid, [])[n0:]   # 동작 · 확인이 남긴 판정(day.note) — 하나라도 🔴 면 🔴 · ⚪ 만 있으면 ⚪
    if any(x['ok'] is False for x in new): return False, ' · '.join(x['text'] for x in new if x['ok'] is False)
    if new and all(x['ok'] is None for x in new): return None, ' · '.join(x['text'] for x in new)
    return ok, why

# ── 장면 차례
scenes = P['scenes']
if arg('--from'): scenes = scenes[[s['id'] for s in scenes].index(arg('--from')):]
if arg('--only'): scenes = [s for s in scenes if s['id'] in arg('--only').split(',')]
ran = {s['id'] for s in scenes}

def hold_drive():
    """사람 손을 기다리는 동안 JoyStick 을 세운다 — 달린 채 기다리면 다음 장면이 볼 지나침 · 도착이 그 장면 시작 전에 찍혀 헛기다린다(판 6 S12 → S13 · S13b) · 세웠으면 True"""
    try:
        with day.JOY_LOCK:
            if day.joy_find(day.TAPS['joy.pause']['color']):   # ❚❚ 가 보이면 달리는 중
                day.joy_tap('joy.pause'); log('  ⏸ 사람 손 기다리는 동안 JoyStick 일시정지'); return True
    except Exception as e: log(f'  ⚠️ JoyStick 을 못 세움 — {e}')
    return False

def resume_drive():
    """hold_drive 로 세운 것만 다시 — ▶ 가 보일 때만 누른다(기다리는 동안 누가 JoyStick 을 만졌으면 누르지 않고 적기만)"""
    try:
        with day.JOY_LOCK:
            if day.joy_find(day.TAPS['joy.play']['color']): day.joy_tap('joy.play'); log('  ▶ 사람 손 끝 — JoyStick 다시 재생'); return
        log('  ⚠️ 사람 손 끝 — ▶ 가 안 보여 재생 안 누름(이미 달리는 중이거나 띠가 없음)')
    except Exception as e: log(f'  ⚠️ JoyStick 을 다시 못 틂 — {e}')

def unmet(s):
    """장면이 기대는 사실(needs) 가운데 이번 판 서버 기록에 없는 것 — «C4b KEEP»(콜 이름 + 사실) · «귀가 켬»(사실만) · 줄 모양은 문제지 facts"""
    t, out = day.srv_since(day.RUN_MARK[0]), []
    for need in s.get('needs', []):
        call, kind = (None, need) if need in P['facts'] else need.split(' ', 1)
        if call and call not in day.BIND: out.append(f'{need}(콜 없음)'); continue
        f = P['facts'][kind]; f = f if isinstance(f, dict) else {'re': f}
        put = lambda rx: rx.replace('{call}', re.escape(day.BIND[call]) if call else '')
        m = list(re.finditer(put(f['re']), t))
        if not m: out.append(need)
        elif f.get('notAfter') and re.search(put(f['notAfter']), t[m[-1].end():]): out.append(f'{need}(뒤에 취소됨)')
    return out

if not DRY:
    import subprocess   # 판이 도는 동안 Mac 이 잠들지 않게 — 서버 · adb · 실행기가 다 Mac 에 있다(판 5: 21:33 화면 꺼짐 → 잠자기 18분 · 서버 기록 0줄) · 실행기가 끝나면 함께 풀린다
    subprocess.Popen(['caffeinate', '-ims', '-w', str(os.getpid())])
    time.sleep(1)
    held = 'caffeinate' in subprocess.run(['pmset', '-g', 'assertions'], capture_output=True, text=True).stdout
    lid = 'AppleClamshellState" = Yes' in subprocess.run(['ioreg', '-r', '-k', 'AppleClamshellState', '-d', '1'], capture_output=True, text=True).stdout
    log(f'💤 Mac 잠자기 막음 {"✅" if held else "🔴 안 잡힘"} · 덮개 {"🔴 닫힘 — 덮개를 닫으면 막아도 잠든다" if lid else "열림"}')
    bad = day.run.phones_ready()
    if bad:
        for name, dev, why in bad: log(f'⛔ {name}({dev or "이름 없음"}) 안 닿음 — {why}')
        sys.exit('⛔ 두 폰이 다 닿지 않아 시작하지 않음')
    if 'S01' not in ran:
        day.load_state()
        if day.RUN_MARK[0] is None: sys.exit('⛔ 판 상태 파일에 판 시작 자리가 없음 — 앞 판 기록에 속을 수 있어 S01 부터 돌림')
    else: day.RUN_MARK[0] = day.srv_mark()   # 판 시작 자리 — 장면이 기대는 사실(needs)은 이 뒤 서버 기록에서만 찾는다(콜 번호 · 기록 자리와 같은 상태 파일에 남김)
    log(f'📄 결과지 {os.path.basename(RP)}')

halt = None
try:
    for s in scenes:
        sid = s['id']; log(f'━━ {sid} {s["say"]}')
        PRE[0] = None if DRY else (day.srv_mark(), day.app_mark())   # 장면 기준점은 사실 다시 보기(최대 10초) 앞에서 — 그 사이 달리는 차가 만든 지나침 · 도착을 놓치지 않게(c8 리뷰)
        miss = [] if DRY else unmet(s)
        for _ in range(10):   # 사실 줄이 앞 장면 마지막 기다림 줄과 같은 순간(ms 차이)에 찍히기도 한다 — 바로 «없음»으로 치지 않고 10초까지 다시 본다(판 6 S06b: 도착 감지 .449 · 상차지 도착 .451)
            if not miss: break
            time.sleep(1); miss = unmet(s)
        if miss:
            for c in s['checks']:
                if c['writer'] == '스크립트': write(c['id'], None, f'기대는 사실 {", ".join(miss)} 이 이번 판에 없어 안 돌림')
            log(f'  ⚪ 기대는 사실 {", ".join(miss)} 없음 — 이 장면 안 돌림'); continue
        last_script = max((i for i, c in enumerate(s['checks']) if c['writer'] == '스크립트'), default=-1)
        for i, c in enumerate(s['checks']):
            if c['writer'] != '스크립트':
                if i > last_script or DRY: continue
                if read(c['id']) is None: log(f'  ⏳ {c["writer"]}: {c["task"]} — 장면 표에서 체크하면 이어 감')
                while read(c['id']) is None: time.sleep(1)
                ok, why = read(c['id']), None
            else:
                t0 = time.time(); ok, why = run_row(c, sid)
                if c.get('target') and ok is True: why = f'{time.time() - t0:.0f}초'
                write(c['id'], ok, why)
                if ok is None and c['who'].startswith('스크립트(기사님 대신)') and not DRY:   # 기사님 대신 못 눌렀으면 기사님 몫으로 — 폰에서 누르고 장면 표에서 체크하면 이어 감
                    write(c['id'], None, f'{why} — 기사님 손 기다림')
                    held = hold_drive()
                    log(f'  ⏳ 기사님: [{c["where"]}] {c["task"].format_map(type("A", (dict,), {"__missing__": lambda self, k: "{" + k + "}"})(c["args"]))} — 실행기가 못 누름 · {c["where"]} 에서 누르고 장면 표에서 체크하면 이어 감')
                    while read(c['id']) is None: time.sleep(1)
                    ok, why = read(c['id']), '기사님 손'
                    if held: resume_drive()
            task = c['task'].format_map(type('A', (dict,), {'__missing__': lambda self, k: '{' + k + '}'})(c['args']))   # 로그용 — 값 그대로(이름 바꾸기는 장면 표 몫)
            log(f'  {"✅" if ok is True else "🔴" if ok is False else "⚪"} {i + 1}. {task}' + (f' — {why}' if why else ''))
            if ok is not True and c['onFail'] == 'stop' and not DRY: halt = sid; break
        if not DRY: day.save_state()
        if halt: break
except KeyboardInterrupt:
    log('⏹️ 멈춤(신호)')
if halt: log(f'⏸ {halt} 에서 멈춤 — 고친 뒤 이어 가기: python3 phone-e2e-test/runner.py --from {halt}')
if not DRY:
    for s in scenes:
        v = [read(c['id']) for c in s['checks']]
        log(f'{s["id"]}: {"✅" if all(x is True for x in v) else "🔴" if False in v else "⬜"} {sum(x is True for x in v)}/{len(v)}')
