"""계획서 페이지 자료(scenes.json)를 시나리오(day1.json)에서 만든다 — 시나리오와 문서가 갈라지지 않게 한 곳에서.
쓰는 법: python3 make_plan.py  → scenes.json 을 다시 쓴다(plan.html 이 읽음)
장면마다 «짧게(short) · 자세히(detail)» 두 겹 · 에이전트 손 단계(판 시작 정리 · JoyStick)는 여기서 덧붙인다."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'day1.json'), encoding='utf8'))
P, R = D['places'], D['routes']
NET = {'insung': '인성', 'hwamul24': '화물24시', 'picker': '픽커'}
MODE = {'ALARM': '알람', 'AUTO': '자동', 'SIMULATION': '체험(계약 안 함)', 'MANUAL': '직접'}
A, T = '에이전트', '시험 스크립트(day.py)'
TT = T + '(기사님 대신)'


def place(k):
    if k in P: return P[k][1] + ' ' + P[k][0].split(' ')[-1]
    if str(k).startswith('dest:'): return {'far': '먼 동', 'near': '가까운 동'}.get(k.split(':')[1], k)
    return k


def act(k, v):
    """(누가, 어디서, 짧게, 자세히)"""
    if k == 'mode': return (TT, 'S23', f'원달앱 모드를 «{MODE.get(v, v)}»로', '관제앱 모드 단추를 글자로 찾아 누름 — 원달앱이 받은 모드가 바뀌면 다음으로 · 이미 그 모드면 안 누름')
    if k == 'sim':
        n = v if isinstance(v, str) else v.get('net')
        if isinstance(v, dict) and v.get('fresh'):
            return (T, 'A24', f'시뮬레이터 새로 열기 — {NET.get(n, n)} «신규 콜 목록»(콜 0건)', '시뮬 껍데기 앱을 닫았다 다시 켬(앞 판 콜 지움) → 설정 화면 «' + NET.get(n, n) + '» 탭 → «개별콜»(시뮬이 스스로 콜을 안 흘림) → «화면으로 시작» → 홈 → 목록 · 원달앱 기록 «[페이지] … 신규 콜 목록 → LIST»')
        return (T, 'A24', f'시뮬 배차망을 {NET.get(n, n)}(으)로', '시뮬 «배차망 바꿈» 신호(다시 켜지 않음) · 이미 그 목록이면 그대로')
    if k == 'call': return (T, 'A24 시뮬', f'콜 넣기 — {NET.get(v["net"], v["net"])} · {place(v["pick"])} → {place(v["drop"])} · {v["fare"] // 1000}천원대', f'시뮬 목록 맨 위에 콜 하나(이름 {v.get("bind", "")}) · 요금 끝자리는 판마다 0~9천 원 더함 · 차종은 그때 필터')
    if k == 'wait_app': return ('원달앱 스스로', 'A24', '원달앱 기록 «' + v['re'].replace('\\', '')[:30] + '» 기다림', f'원달앱 기록 «{v["re"]}» 를 {v["sec"]}초 안에')
    if k == 'decide':
        h = v.get('how')
        if h == 'hand': return (TT, 'A24 시뮬', f'{NET.get(v.get("net"), "")} 상세에서 확정 → KEEP' + (' → 닫기' if v.get('net') == 'insung' else ''), '원달앱이 그 콜 상세를 연 뒤(삑) 확정 단추(인성 «배차» · 화물24시 «배차신청»)를 누름 · 판정 색은 기록만')
        if h == 'auto': return ('원달앱이 확정 → ' + TT, 'S23 결재석', '결재석 ' + ('거절' if v.get('want') == 'reject' else 'KEEP'), '원달앱이 스스로 확정한 뒤 결재석 그 요금 칸의 단추를 누름 · 판정 색은 기록만')
        if h == 'view': return (TT, 'S23 결재석', '보기만 · 미리보기 손으로 치움', '결재석 칸 본문을 눌러 치움')
    if k == 'tap': return (TT, 'S23' if v.startswith('s23') else 'A24', '단추: ' + v.split('.', 1)[1], '단추를 글자로 찾아 누름(taps.json)')
    if k == 'tap_if_cod': return (TT, 'S23', '착불이면 «💵 받았음»', '착불 콜일 때만 그 단추가 있음')
    if k == 'joystick':
        r = R[v['leg']]
        return (A, 'S23 GPS JoyStick', f'경로 «{r["gpx"].replace("onedal-", "").replace(".gpx", "")}» 시작', f'{r["say"]} — 시험 스크립트 안내 줄이 뜨면 3분 안에: JoyStick 열기 → 광고 닫기 → «경로 설정» → 경로 고르기 → «시작» → 관제앱을 앞으로 · 시험 스크립트가 S23 위치가 mock 으로 30m 넘게 움직이는지 봄')
    if k == 'ble': return (T, 'A24', f'블루투스 {"켬" if v == "on" else "끔"}', '')
    if k == 'sleep': return (T, '—', f'{v}초 기다림', '')
    if k == 'mark': return (T, '—', '원달앱 기록 기준점 표시', '이 뒤에 찍힌 원달앱 기록만 본다')
    if k == 'photo': return (T, v, '화면 사진', '')
    if k == 'forget_seen': return (T, 'A24', '원달앱 «이미 본 콜» 기억 비우기', '서버 회차를 앞 판보다 크게 올림 → 원달앱이 배차망 화면에서 보낸 다음 보고의 응답으로 비움(원달앱 자기 화면이 앞이면 안 비워짐) · «✅ 원달앱이 본 콜 기억을 비움»')
    if k == 'dashboard_fresh': return (T, 'S23', '관제앱 다시 열기 · 통계 띠 닫기', '관제앱을 닫았다 다시 엶(서버를 다시 띄워도 관제앱은 옛 콜을 들고 있음) → 30초 안에 «진행 중인 콜이 없습니다» → «📊 … 내 폰이 본 목록 기준» 띠가 보이면 «오늘은 닫기»(✕)')
    if k == 'wait_app_supply': return ('', '', '', '')
    if k == 'snapshot': return (T, '맥', '시작 때 필터 · 설정 · 모드 기록', '서버 DB 필터 · 설정(칸 이름까지)과 원달앱 모드 · 목적지 · 최저를 phone-test/out/start_filter.json 에 따로 남김 — 이 파일이 이미 있으면(앞 판이 S99 로 되돌리지 못함) 덮지 않고 그 값을 씀 · S99 가 필터 · 모드를 되돌린 뒤에만 지움')
    if k == 'tidy_s23': return (T, 'S23', '관제앱 출발 화면 확인', '필터 창 접기 · 서랍 닫기(값은 안 바꿈 · 이미 그렇면 안 누름) · 모드 줄 «A24» 보임')
    if k == 'set_filter': return (T, '맥 → 서버', '시험용 필터로 맞춤 — ' + ' · '.join(f'{a} {b}' for a, b in v.items()), '`node set_filter.mjs \'' + json.dumps(v, ensure_ascii=False) + '\'` — 관제앱 «💾 서버 저장»과 같은 신호(소켓 update-filter + saveAsDefault) · DB 에 직접 안 씀 · 서버 «DB 저장 완료» · 원달앱 «필터 도착»')
    if k == 'expect_app_filter': return (T, 'A24', '원달앱 필터가 ' + ' · '.join(f'{a} {b}' for a, b in v.items()) + ' 인가', '원달앱 설정 파일(activeFilter)을 20초까지 읽어 그 값이 되나 봄')
    if k == 'mode_net_matrix':
        return (T, 'A24 · S23', '모드 ' + ' → '.join(MODE.get(m, m) for m in v.get('modes', [])) + ' × 배차망 모두', '모드마다: 관제앱 모드 단추로 바꿈 → 배차망 목록(원달앱 플러그인 · 시뮬 SIM_NET_LIST 에서 그때 읽음)을 하나씩 시뮬 «배차망 바꿈» 신호로 열기 → 원달앱 «타겟 앱 자동 전환 완료: …» 25초 → 원달앱이 받은 필터(목적지 · 최저 · 켜짐 · 키워드 수 · 차종)를 칸별로 기록하고 키워드 수를 서버가 보낸 것과 견줌 · 끝은 마지막 모드 · 인성')
    if k == 'sim_all_nets': return (T, 'A24', '배차망 모두 차례로 바꿈', '')
    if k == 'home_off_if_mine': return (T, 'S23', '이번 판에 스크립트가 켠 귀가만 끔', '')
    if k == 'filter_revert_if_unsaved': return (T, 'S23', '«저장 전»이면 «되돌리기»', '')
    if k == 'restore_filter': return (T, '맥 → 서버', '필터를 시작 값으로 되돌림(목적지 · 제외 지역 · 최저)', 'S01 이 떠 둔 기사님 필터 줄에서 읽어 set_filter.mjs 로 같은 길(서버 저장)')
    if k == 'restore': return (T, 'S23', '모드를 시작 값으로', '시작 모드와 다를 때만 누름')
    return (T, '—', k, '')


AGENT_PRE = {
    'S01': [
        (A, '맥', '시험 스크립트 확인', '떠 있는 시험 스크립트를 모두 끈다 — `pkill -f "day.py"` → `pgrep -f "day.py"` 가 아무것도 안 찍으면 다음으로'),
        (A, 'S23', 'JoyStick 이 켜져 있으면 끄기', '`adb -s <S23 주소> shell pidof com.theappninjas.fakegpsjoystick` 가 번호를 찍으면 `am force-stop` → 15초 · 다음으로 가는 조건: pidof 가 비고 «last location=Location[fused» 줄에 mock 없음(«grep -c mock» 으로 세지 않음 — 지난 이력 줄이 남음)'),
        (A, '맥', 'reset:calls', '`cd onedal-web && pnpm reset:calls` → «✅ 재기동 확인 (bootedAt …)» 이면 다음으로 · 로컬 시험 서버만 · 실서버 · 필터 · 설정 · 좌표 캐시는 안 건드림'),
    ],
}


def run_line(s, js):
    return (A, '맥', f'«{s["id"]}» 한 장면만 ' + ('뒤에서 ' if js else '') + '돌림',
            f'`cd phone-test && RUN_ID=<판 이름> python3 -u day.py day1.json --only {s["id"]} --no-cleanup`' + (' — 뒤에서 띄우고(nohup … &) JoyStick 안내 줄을 기다림' if js else ' — 앞에서 끝까지'))


out = []
for s in D['steps']:
    js = any('joystick' in a for a in s.get('do', []))
    rows = list(AGENT_PRE.get(s['id'], [])) + [run_line(s, js)]
    for a in s.get('do', []):
        k = list(a)[0]; r = act(k, a[k])
        if r[0]: rows.append(r)
    for w in s.get('wait', []):
        if w.get('orHand'): rows.append((T + '(설명서대로 손)', 'S23 단계 시트', '상차지 «도착»이 2분 안에 안 서면 손으로 «도착»', w.get('why', '')))
    if s['id'] == 'S99': rows.append((A, 'S23 GPS JoyStick', 'JoyStick 끄기', '`am force-stop com.theappninjas.fakegpsjoystick` → 15초 뒤 pidof 가 비고 fused 줄에 mock 없음'))
    rows.append((A, '—', '결과 알림', '«━━ 끝 — 🔴 0» 이면 한 번 알림 · 안 서면 다음 장면으로 가지 않고 멈춰 무엇이 안 섰는지 설명하고 컨펌'))
    waits = []
    for w in s.get('wait', []):
        src = next(x for x in ('server', 'app', 'web') if x in w)
        waits.append({'server': '서버', 'app': '원달앱', 'web': '관제웹'}[src] + ' «' + str(w[src]).replace('\\', '')[:50] + '»')
    out.append(dict(id=s['id'], purpose=s.get('purpose', ''), say=s['say'], phone=s.get('phone'), needs=s.get('needs') or [], skip=s.get('skip') or '',
                    acts=[{'who': w, 'where': wh, 'short': sh, 'detail': de or sh} for w, wh, sh, de in rows], waits=waits,
                    hand=js or s['id'] in ('S01', 'S99')))
json.dump(dict(title=D['title'], routes={k: v for k, v in R.items() if k != 'how'}, scenes=out), open(os.path.join(HERE, 'scenes.json'), 'w'), ensure_ascii=False)
print(f'scenes.json — {len(out)} 장면')
