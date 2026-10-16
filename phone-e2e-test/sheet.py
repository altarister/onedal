"""문제지 · 장소표 · 하루 경로를 읽는 곳 — 실행기(runner.py)와 문제지 검사(lint.py)가 같이 쓴다(한 벌)."""
import json, math, os, re

HERE = os.path.dirname(os.path.abspath(__file__))

def problems():
    return json.load(open(os.path.join(HERE, 'problems.json'), encoding='utf8'))

def places():
    """장소 이름 → [주소, 동 · 읍 · 면, 경도, 위도] — day1.json 의 places"""
    return json.load(open(os.path.join(HERE, 'day1.json'), encoding='utf8'))['places']

def route():
    """하루 경로 gpx 의 점 [(위도, 경도), …] — gpx 파일 이름은 day1.json routes.DAY.gpx"""
    gpx = json.load(open(os.path.join(HERE, 'day1.json'), encoding='utf8'))['routes']['DAY']['gpx']
    text = open(os.path.join(HERE, gpx), encoding='utf8').read()
    return [(float(a), float(b)) for a, b in re.findall(r'lat="([\d.\-]+)" lon="([\d.\-]+)"', text)]

def dist_m(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))

def seg_dist_m(p, a, b):
    """점 p 에서 선분 a-b 까지(짧은 거리라 평면으로 근사)"""
    k = math.cos(math.radians(p[0]))
    ax, ay, bx, by, px, py = a[1] * k, a[0], b[1] * k, b[0], p[1] * k, p[0]
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return dist_m(p, (ay + t * dy, (ax + t * dx) / k))
