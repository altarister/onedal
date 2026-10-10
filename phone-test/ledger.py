"""
시험 장부(phone-test/ledger.json)에 한 판을 덧붙인다 — 덮어쓰지 않고 읽어서 붙인 뒤 쓴다(71 · 기사님 지시).
- runs 끝에 판 하나: 장면마다 ✅(다 맞음) · 🔴(하나라도 틀림) · ⚪(설계대로 · 건너뜀만)
- finds: 장면이 ✅ 이고 그 장면으로 확인하기로 한 F(checkBy 칸 = 장면)가 있으면 verified · now 를 «✅ 확인됨»으로
         장면이 🔴 인데 그 장면에 묶인 F 가 없으면 새 F(F18 부터) — state 열림 · now «🔴 …»
"""
import json, os, re, subprocess, datetime

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
LEDGER = os.path.join(REPO, 'phone-test/ledger.json')   # 시험 장부 — 판 결과(runs) · 찾은 것(finds) · git 에 올라감
SRV_LOG = f'{REPO}/onedal-web/server/logs/server-{datetime.date.today():%Y-%m-%d}.log'

def sh(*a):
    try: return subprocess.run(a, capture_output=True, text=True, timeout=20).stdout
    except Exception: return ''

def env(a24, s23):
    """판 머리 — 원달앱 판 · 관제앱 깐 시각 · 로컬 서버 기동 시각 · 지금 커밋"""
    p = sh('adb', '-s', a24, 'shell', 'dumpsys', 'package', 'com.onedal.app')
    vc = re.search(r'versionCode=(\d+)', p)
    w = re.search(r'lastUpdateTime=(\S+ \S+)', sh('adb', '-s', s23, 'shell', 'dumpsys', 'package', 'kr.co.onedal.dashboard'))
    try: boot = [l[:12] for l in open(SRV_LOG, encoding='utf8', errors='ignore') if '서버 기동' in l][-1]
    except Exception: boot = '?'
    head = sh('git', '-C', REPO, 'log', '-1', '--format=%h').strip()
    return {'app': f'원달앱 {vc.group(1) if vc else "?"}', 'web': f'관제앱 깐 시각 {w.group(1) if w else "?"}', 'server': f'로컬 {boot} 기동({head})'}

def scene_row(sid, rows):
    oks = [r['ok'] for r in rows]
    if any(o is False for o in oks): res, label = '🔴', next(r['what'] for r in rows if r['ok'] is False)
    elif any(o is True for o in oks): res, label = '✅', '통과'
    else: res, label = '⚪', rows[0]['text'].split(' — ')[0][:40] if rows else '건너뜀'
    note = ' · '.join(f'{"✅" if r["ok"] is True else "🔴" if r["ok"] is False else "⚪"} {r["what"]}: {r["text"]} ({r["at"]})' for r in rows)
    return {'id': sid, 'result': res, 'label': label, 'note': note}

def append(run_id, started, results, how, a24, s23, path=LEDGER):
    d = json.load(open(path, encoding='utf8'))
    scenes = [scene_row(sid, rows) for sid, rows in results.items()]
    d.setdefault('runs', []).append({'id': run_id, 'date': f'{started:%Y-%m-%d %H:%M}~{datetime.datetime.now():%H:%M}', **env(a24, s23), 'how': how, 'scenes': scenes})
    finds = d.setdefault('finds', [])
    nums = [int(f['id'][1:]) for f in finds if re.fullmatch(r'F\d+', f.get('id', ''))]
    nxt = max(nums + [17]) + 1
    changed = []
    for sc in scenes:
        tied = [f for f in finds if f.get('checkBy') == sc['id']]   # 잇는 칸은 checkBy 하나 — 사람이 «지금» 문장을 고쳐도 안 끊김
        if sc['result'] == '✅':
            for f in tied:
                f['verified'] = f'{run_id} {sc["id"]}'; f['now'] = '✅ 확인됨'; changed.append(f'{f["id"]} 확인됨')
        elif sc['result'] == '🔴' and not tied and (same := [f for f in finds if f.get('found', '').endswith(' ' + sc['id']) and f.get('what', '').endswith(sc['label']) and f.get('state') == '열림']):
            # 같은 장면 · 같은 까닭(라벨)이 이미 열려 있으면 새 번호를 안 만든다 — 그 줄에 «N판에도 다시 나옴»만 더한다(한 일이 두 번호로 갈리지 않게)
            for f in same:
                if f'{run_id}에도 다시 나옴' not in f.get('now', ''): f['now'] = f.get('now', '') + f' · {run_id}에도 다시 나옴'
                changed.append(f'{f["id"]} 다시 나옴({sc["id"]})')
        elif sc['result'] == '🔴' and not tied:
            finds.append({'id': f'F{nxt}', 'what': f'{sc["id"]} {sc["label"]}', 'found': f'{run_id} {sc["id"]}', 'state': '열림', 'checkBy': sc['id'],
                          'fix': '—', 'verified': '—', 'now': '🔴 ' + sc['note'].lstrip('🔴✅⚪ ')[:200]}); changed.append(f'F{nxt} 새로'); nxt += 1
        elif sc['result'] == '🔴':   # 이어진 F 가 있는 🔴 — 새 번호 없이 그 줄에 «N판에도 다시 나옴»
            for f in tied:
                if f'{run_id}에도 다시 나옴' not in f.get('now', ''): f['now'] = f.get('now', '') + f' · {run_id}에도 다시 나옴'
            changed.append(f'{"·".join(f["id"] for f in tied)} 그대로 🔴 · 다시 나옴({sc["id"]})')
    json.dump(d, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=2)
    return scenes, changed
