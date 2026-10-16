#!/usr/bin/env python3
"""문제지 검사 — 판을 돌리기 전에 문제지 · 장소표 · 하루 경로만 보고 서로 안 맞는 곳을 «장면 · 줄 · 까닭»으로 찍는다(폰 · 서버 불필요 · 고치지 않음).
🔴 = 판에서 반드시 헛 실패가 나는 것(콜 이름 차례) · ⚠️ = 날 수 있는 것. 레포 소스는 안 본다 — 시험 데이터끼리만 견준다.
못 잡는 것: 시각(원달앱 같은 길 기억의 10분 창) · 배차망 목록에서 실제로 읽힌 글자(장소표 동 이름으로 근사) · 판 도중에 생기는 일(앞 판 찌꺼기 · 화면 상태)
쓰는 법: python3 phone-e2e-test/lint.py   (runner.py --dry 도 먼저 부른다) · 🔴 가 있으면 exit 1"""
import re, sys
import sheet

PASS_NEAR_M = 300   # 서버 지나침이 시작되는 거리(판정 기준 «지나침» 기본값)
BIND_KEYS = ('ifBound', 'sinceBind', 'bind', 'call')

def lint(P=None, PL=None, R=None):
    P, PL, R = P or sheet.problems(), PL or sheet.places(), R or sheet.route()
    off = P.get('offRoute', {})
    out = []
    say = lambda lv, kind, sid, i, c, why: out.append(f'{lv} [{kind}] {sid} {i}. {c["task"][:28]} — {why}')

    def near_idx(key):
        """그 장소가 경로에서 PASS_NEAR_M 안인 선분 번호들(경로가 같은 곳을 두 번 지나면 둘 다)"""
        q = (PL[key][3], PL[key][2])
        return [i for i in range(len(R) - 1) if sheet.seg_dist_m(q, R[i], R[i + 1]) <= PASS_NEAR_M]

    def min_dist(key):
        q = (PL[key][3], PL[key][2])
        return min(sheet.seg_dist_m(q, R[i], R[i + 1]) for i in range(len(R) - 1))

    rows = [(s, i, c) for s in P['scenes'] for i, c in enumerate(s['checks'], 1)]
    calls = {}        # 콜 이름 → (장면, 줄 번호, 줄, 콜 차례)
    seen = {}         # «상차 동 → 하차 동» → (장면, 줄) — 원달앱 같은 길 기억(본 콜 기억 비우기 전까지)
    mode = None       # 지금 모드 — 모드 줄을 따라 든다(처음은 모름)
    mode_told = False # «모드 모름» 을 이번 구간에 이미 찍었나
    scene_no = {x['id']: n for n, x in enumerate(P['scenes'])}

    facts = P.get('facts', {})
    for s, i, c in rows:
        sid, k, a = s['id'], c['run'], c['args']
        # ⑦ 장면이 기대는 사실 — 사실 이름이 facts 에 있고, 콜 이름이면 그 콜을 넣는 줄이 앞 장면에 있나
        if i == 1:
            for need in s.get('needs', []):
                call, kind = (None, need) if need in facts else (need.split(' ', 1) + [''])[:2]
                if kind not in facts: say('🔴', '사실', sid, i, c, f'needs «{need}» — 문제지 facts 에 «{kind}» 없음')
                elif call and call not in calls: say('🔴', '사실', sid, i, c, f'needs «{need}» — {call} 을 넣는 줄이 앞에 없음')
        # ④ 콜 이름 차례 — 콜을 넣기 전에 그 이름을 씀
        names = set(re.findall(r'\{(?:fare:|drop:)?(\w+)\}', a.get('re', '')))
        names |= {a[x] for x in BIND_KEYS if isinstance(a.get(x), str)}
        if k == 'call': names.discard(a.get('bind'))
        for n in names:
            if re.fullmatch(r'[A-Z]\w*\d\w*', n) and n not in calls:
                say('🔴', '콜 이름 차례', sid, i, c, f'{n} 을 쓰는데 그 콜을 넣는 줄이 앞에 없음')
        # 모드 따라가기
        if k == 'mode': mode, mode_told = a['mode'], False
        elif k == 'mode_net_matrix': mode, mode_told = 'ALARM', False   # 이 동작은 끝을 알람으로 둔다
        elif k == 'restore': mode = None
        elif k == 'forget_seen': seen.clear()
        if k == 'call':
            b = a.get('bind')
            calls[b] = (sid, i, c, len(calls))
            pk, dr = a.get('pick'), a.get('drop')
            # ③ 경로 밖 장소
            for key in (pk, dr):
                if key in PL and key not in off:
                    d = min_dist(key)
                    if d > PASS_NEAR_M: say('⚠️', '경로 밖', sid, i, c, f'{key} 가 하루 경로에서 {d:.0f}m — 지나침 {PASS_NEAR_M}m 밖(일부러면 문제지 offRoute 에)')
            # ① 같은 길 겹침 — 하차가 «dest:…»면 판에서 그 순간 필터로 정해져 동을 모른다: 상차 동이 같은 콜이 앞에 있으면 같은 길일 수 있음(판 4 S15)
            if pk in PL and str(dr).startswith('dest:'):
                same = [v for kk, v in seen.items() if kk.startswith(f'{PL[pk][1]} → ')]
                if same: say('⚠️', '같은 길', sid, i, c, f'하차 {dr} 는 판에서 정해짐 — 상차 동 {PL[pk][1]} 이 {same[-1][0]} {same[-1][1]}번에도 있어 같은 길이 될 수 있음(사이에 «본 콜 기억 비우기» 없음)')
            if pk in PL and dr in PL:
                key = f'{PL[pk][1]} → {PL[dr][1]}'
                if key in seen:
                    ps, pi = seen[key]
                    say('⚠️', '같은 길', sid, i, c, f'{key} 가 {ps} {pi}번에도 — 사이에 «본 콜 기억 비우기» 없음 · 원달앱이 10분 안이면 «이미 본 콜»로 안 열 수 있음(배차망을 바꿔도 안 비워짐 · 시각 · 목록 글자는 문제지로 모름)')
                seen[key] = (sid, i)
            # ⑥ 같은 요금 — 판정 색을 요금(0.1만 단위)으로 찾는다. 실행기는 콜마다 끝수를 천 원씩 차례로 올리니(run.py fare_bump · 0~39 돌림)
            #    판의 실제 요금 차이 = 바탕 요금 차이 + 그 사이 콜 수 × 1000(돌림을 넘으면 − 40000). 같은 장면 · 바로 다음 장면끼리만 본다(color_of 는 콜마다 넣은 자리 뒤에서 찾음)
            me = calls[b][3]
            for ob, (os_, oi, oc, on) in calls.items():
                if ob == b or not 0 <= scene_no[sid] - scene_no[os_] <= 1: continue
                diff = a.get('fare', 0) - oc['args'].get('fare', 0) + 1000 * (me - on)
                if any(round(x / 1000) == 0 for x in (diff, diff - 40000)):
                    say('⚠️', '같은 요금', sid, i, c, f'{b} 와 {ob}({os_}) 가 판에서 0.1만 단위로 같은 요금이 될 수 있음(바탕 {oc["args"].get("fare")} · {a.get("fare")}원 · 사이 콜 {me - on}개)')
        # ⑤ 모드 맞음 — 확정 방식이 지금 모드와 맞나
        if k == 'decide' and not mode and not mode_told:   # 검사가 안 돈 것과 통과한 것을 같은 초록으로 두지 않는다
            mode_told = True; say('⚠️', '모드', sid, i, c, '지금 모드를 문제지로 모름(모드 줄 전 · 시작 값으로 되돌린 뒤) — 이 구간은 모드 검사 못 함')
        if k == 'decide' and mode:
            how = a.get('how')
            if how == 'auto' and mode != 'AUTO': say('⚠️', '모드', sid, i, c, f'결재석(자동) 자리인데 지금 모드 {mode}')
            if how == 'hand' and mode == 'AUTO': say('⚠️', '모드', sid, i, c, '손 확정 자리인데 지금 모드 AUTO — 원달앱이 먼저 확정함')
        # ⑤ 문제 콜의 취소 횟수 기대가 모드에 맞나(자동 = 확정 뒤 결재석 거절 → +1 · 알람 = 확정 전 → 0)
        if k == 'check' and a.get('kind') == 'count_server' and '취소 카운트' in a.get('re', '') and mode and any(x.get('knownGap') for x in s['checks']):
            want = 1 if mode == 'AUTO' else 0
            if a.get('n') != want: say('⚠️', '모드', sid, i, c, f'문제 콜 장면인데 모드 {mode} 면 취소 +1 이 {want}번이어야 함(지금 {a.get("n")})')

    # ② 덜 찬 주소 — 화물24시로 잡히고, 뒤에서 그 콜의 도착 · 지나침을 기다리는데 알려진 빈칸 표시가 없음
    for b, (sid, i, c, _) in calls.items():
        if c['args'].get('net') != 'hwamul24': continue
        dec = [(s2, i2, c2) for s2, i2, c2 in rows if c2['run'] == 'decide' and c2['args'].get('bind') == b]
        taken = any(d['args'].get('how') in ('hand', 'auto') and d['args'].get('want', 'keep') == 'keep' for _, _, d in dec)
        waits = [(s2['id'], i2) for s2, i2, c2 in rows if b in re.findall(r'\{(\w+)\}', c2['args'].get('re', ''))
                 and re.search(r'도착|지나침|하차|상차', c2['args'].get('re', ''))] + \
                [(s2['id'], i2) for s2, i2, c2 in rows if c2['args'].get('kind') == 'via' and c2['args'].get('call') == b]
        marked = c.get('knownGap') or any(d.get('knownGap') for _, _, d in dec)
        if taken and waits and not marked:
            say('⚠️', '덜 찬 주소', sid, i, c, f'화물24시로 잡는 {b} 의 도착 · 지나침을 {", ".join(f"{x} {y}번" for x, y in waits)} 에서 기다림 — 정거장이 읍 · 면 가운데 점이라 안 찍힐 수 있음(알려진 빈칸 addr-partial)')
        # ④ 하차 지나침을 보는데 상차지가 경로에서 하차지보다 뒤
        pk, dr = c['args'].get('pick'), c['args'].get('drop')
    for b, (sid, i, c, _) in calls.items():
        pk, dr = c['args'].get('pick'), c['args'].get('drop')
        if pk in PL and dr in PL and any(c2['args'].get('kind') == 'via' and c2['args'].get('call') == b for _, _, c2 in rows):
            pi, di = near_idx(pk), near_idx(dr)
            if pi and di and not any(x < y for x in pi for y in di):
                say('🔴', '콜 이름 차례', sid, i, c, f'{b} 하차 지나침을 보는데 경로에서 상차지({pk})가 하차지({dr})보다 뒤')
    return out

if __name__ == '__main__':
    o = lint()
    for line in o: print(line)
    print(f'문제지 검사 — 🔴 {sum(x.startswith("🔴") for x in o)} · ⚠️ {sum(x.startswith("⚠️") for x in o)}')
    sys.exit(1 if any(x.startswith('🔴') for x in o) else 0)
