#!/usr/bin/env python3
"""문제지(problems.json)로 결과지를 새로 만든다 — 모든 줄 id 를 null(⬜)로 채운 out/result_시각.json.
판을 시작하기 전에 한 번 부른다(장면 표의 «새 판» 단추도 이것을 부른다). 결과지는 최근 5개만 남긴다.
쓰는 법: python3 phone-e2e-test/make_result.py   → 만든 파일 경로를 한 줄 찍는다"""
import datetime, glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
KEEP = 5

def make():
    problems = json.load(open(os.path.join(HERE, 'problems.json'), encoding='utf8'))
    now = datetime.datetime.now()
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'result_{now:%Y%m%d_%H%M%S}.json')
    result = {'made': now.isoformat(timespec='seconds'),
              'checks': {c['id']: None for s in problems['scenes'] for c in s['checks']},
              'notes': {}}
    json.dump(result, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    for old in sorted(glob.glob(os.path.join(OUT, 'result_*.json')))[:-KEEP]: os.remove(old)
    return path

if __name__ == '__main__':
    print(make())
