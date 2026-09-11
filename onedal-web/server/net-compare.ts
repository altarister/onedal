#!/usr/bin/env node
/**
 * 🕸️ **그물 계산이 두 벌이다 — 얼마나 다른가** (이식 ⑤ · 2026-09-11).
 *
 * 관제웹 지도는 `shared/callNet.ts` 의 «동 중심점 + 마름모»로 그물을 그리고,
 * 서버 판정은 `geoService.getDetourRegions()` 의 **turf 폴리곤 버퍼**로 지역을 고른다.
 * 기사님 Q1 확정은 **(나) 실험실 계산을 서버가 쓴다** 인데, 올리기만 했고 서버는 안 쓴다.
 *
 * 🔴 **코드를 안 바꾼다.** 같은 조건을 양쪽에 먹여 «통과 동 목록»이 얼마나 갈리는지만 잰다.
 *    갈라진 만큼이 곧 «화면은 든다는데 판정은 탈락»의 크기다 (규칙 ⑤-3 — 색이 곧 결정).
 *
 * ⚠️ **두 계산은 같은 질문에 답하지 않는다.** 실험실 그물은 «내 위치→목적지 길목 전체»
 *    (상차 반경 + 마름모 + 목적지 둘레)를 담고, 서버 목록은 «목적지 도시 둘레»만 만든다
 *    (상차 반경은 앱이 따로 거른다). 그러니 이 숫자는 **«두 목록이 다르다»의 크기**이지
 *    «서버가 틀렸다»의 증거가 아니다. 어느 쪽이 원천인지는 기사님이 (나)로 정하셨다.
 *
 * 실행:  cd onedal-web && pnpm net:compare
 */
import * as shared from '@onedal/shared';
import * as geo from './src/services/geoService';

/* 🔴 지도 데이터를 먼저 읽힌다 — 안 그러면 서버 쪽이 조용히 «0개»를 낸다 (규칙 ④) */
geo.initGeoService();

/** 🎯 기사님이 실제로 쓰시는 조건 (로컬 DB 의 first 행) */
const CASES = [
    { dst: '인천', pickupKm: 15, dropoffKm: 80, quad: { srcAngleDeg: 120, dstAngleDeg: 140, quadRadiusKm: 35 } },
    { dst: '파주시', pickupKm: 10, dropoffKm: 15, quad: { srcAngleDeg: 110, dstAngleDeg: 110, quadRadiusKm: 25 } },
];
/** 내 위치 — 대전 갈마동 (볼트 오전 판의 출발지) */
const ME = { name: '내 위치', lng: 127.3845, lat: 36.3504 };

console.log('🕸️  그물 계산 두 벌 — 같은 조건에 같은 답을 내는가\n');
for (const c of CASES) {
    const goal = shared.cityCenter(c.dst);
    if (!Number.isFinite(goal.lng)) { console.log(`  ⚠️ ${c.dst} — 모르는 도시, 건너뜀`); continue; }

    /* ① 실험실 계산 (관제웹 지도가 그리는 것) */
    const net = shared.netForGoal(goal, {
        line: null, lineRadiusKm: 6, lastDrop: null,
        params: { ...c.quad, srcDiamKm: c.pickupKm * 2, dstDiamKm: c.dropoffKm * 2 },
        anchor: ME,
    });
    const merged = shared.mergeGoalNets([net], { departed: false, myProgressKm: 0, excluded: [] });
    const labNames = new Set((merged.pass || []).map(p => `${p.region}|${p.name}`));

    /* ② 서버 계산 (판정이 쓰는 것) — 첫짐엔 경로가 없으니 목적지 둘레만 본다 */
    let srvNames = new Set();
    try {
        const r = geo.getCityRegionsWithRadius(c.dst, c.dropoffKm);
        for (const k of (r?.flat ?? [])) srvNames.add(k);
        if (!r?.flat?.length) console.log('   ⚠️ 서버가 0개를 냈다 — 호출이 틀렸거나 지도 데이터가 안 읽혔다');
    } catch (e) { console.log('   ⚠️ 서버 계산 실패:', e.message); }

    const labFlat = new Set([...labNames].map(k => k.split('|')[1]));
    const onlyServer = [...srvNames].filter(n => !labFlat.has(n));
    const onlyLab = [...labFlat].filter(n => !srvNames.has(n));
    const both = [...labFlat].filter(n => srvNames.has(n));

    console.log(`▸ ${c.dst} · 상차 ${c.pickupKm}km · 하차지 주변 ${c.dropoffKm}km · 마름모 ${c.quad.srcAngleDeg}°/${c.quad.dstAngleDeg}°/${c.quad.quadRadiusKm}km`);
    console.log(`   실험실(지도)  ${labFlat.size}개 동`);
    console.log(`   서버(판정)    ${srvNames.size}개 동`);
    console.log(`   양쪽 다       ${both.length}개`);
    console.log(`   🔴 지도만 (화면엔 드는데 판정은 모름)  ${onlyLab.length}개  ${onlyLab.slice(0, 8).join(', ')}${onlyLab.length > 8 ? ' …' : ''}`);
    console.log(`   🔴 판정만 (판정은 드는데 화면엔 없음)  ${onlyServer.length}개  ${onlyServer.slice(0, 8).join(', ')}${onlyServer.length > 8 ? ' …' : ''}`);
    const agree = both.length / Math.max(1, new Set([...labFlat, ...srvNames]).size);
    console.log(`   일치율 ${(agree * 100).toFixed(1)}%\n`);
}
