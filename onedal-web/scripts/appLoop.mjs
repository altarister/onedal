/**
 * pnpm e2e:app — **앱까지 포함한 왕복 검사**
 *
 * `pnpm scenario` 는 서버·관제웹만 본다. 앱이 화면을 읽고 → 필터를 걸고 → 터치하고 →
 * 서버로 보내는 구간은 **검사할 방법이 없었다.** 실제 배차망에 꿀콜이 뜨기를 기다려야 했다.
 *
 * 2026-08-13 에 그 구간이 열렸다 — `~/reps/map/map` 의 배차망 시뮬레이터를
 * **크롬으로** 띄우면 앱이 그대로 스크래핑하고 터치까지 한다. 실측으로 확인했다:
 *
 *     07:21:51.419  LIST 인식              ← 크롬 웹페이지를 배차망으로 인식
 *     07:21:51.531  ✅ 가로채기 성공        ← 웹페이지 버튼이 눌린다
 *     07:21:51.870  모드: AUTO (매크로클릭: true)
 *     07:21:52.196  DETAIL_CONFIRMED       ← 확정 광클 성공
 *
 * ⚠️ **반드시 크롬이어야 한다.** 삼성 인터넷(`com.sec.android.app.sbrowser`)은
 *    웹 콘텐츠를 접근성 트리에 **안 올린다** — 텍스트 노드가 URL·탭 수 2개뿐이다.
 *    이걸 모르고 기본 브라우저로 열면 "앱이 고장났다"고 오진한다.
 *
 * 이 스크립트가 하는 일: 크롬으로 시뮬레이터를 열고, logcat 을 지켜보며
 * 왕복 6단계가 실제로 일어났는지 **단계별로 판정**한다.
 */
import { execSync, spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const SIM_PORT = 5173;
const TIMEOUT_MS = 90_000;   // 시뮬레이터가 필터에 맞는 콜을 낼 때까지 기다린다 (랜덤 생성)

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const die = (msg) => { console.error(`\n🔴 ${msg}\n`); process.exit(1); };

// ─────────────────────────── 전제 확인 ───────────────────────────

function localIp() {
    for (const list of Object.values(networkInterfaces())) {
        for (const n of list ?? []) {
            if (n.family === 'IPv4' && !n.internal) return n.address;
        }
    }
    return null;
}

async function preflight() {
    // ① 기기
    let devices;
    try { devices = sh('adb devices'); } catch { die('adb 를 찾을 수 없습니다.'); }
    const connected = devices.split('\n').slice(1).filter(l => l.includes('\tdevice'));
    if (!connected.length) die('연결된 안드로이드 기기가 없습니다. USB 를 확인하세요.');
    console.log(`📱 기기: ${connected[0].split('\t')[0]}`);

    // ② 앱이 살아 있고 접근성이 켜져 있는가
    const pid = sh('adb shell pidof com.onedal.app || true');
    if (!pid) die('1DAL 앱이 실행 중이 아닙니다.');
    const a11y = sh('adb shell settings get secure enabled_accessibility_services || true');
    if (!a11y.includes('com.onedal.app')) die('접근성 서비스가 꺼져 있습니다. 설정에서 켜 주세요.');
    const ver = sh(`adb shell dumpsys package com.onedal.app | grep versionName || true`);
    console.log(`📦 앱: ${ver.trim()}`);

    // ③ 크롬
    if (!sh('adb shell pm list packages com.android.chrome || true')) {
        die('크롬이 설치되어 있지 않습니다. 삼성 인터넷으로는 안 됩니다 (웹 콘텐츠를 접근성 트리에 안 올림).');
    }

    // ④ 시뮬레이터
    const ip = localIp();
    if (!ip) die('이 컴퓨터의 IP 를 찾을 수 없습니다.');
    const url = `http://${ip}:${SIM_PORT}/?mode=standalone`;
    try {
        const r = await fetch(`http://${ip}:${SIM_PORT}/`, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) throw new Error(String(r.status));
    } catch {
        die(`시뮬레이터가 ${ip}:${SIM_PORT} 에서 응답하지 않습니다.\n   먼저 띄우세요:  cd ~/reps/map/map && pnpm dev`);
    }
    console.log(`🗺️  시뮬레이터: ${url}`);
    return url;
}

// ─────────────────────────── 왕복 단계 ───────────────────────────

/**
 * 앱 로그에서 찾을 마커들. **순서대로** 나와야 왕복이 성립한다.
 * 하나라도 안 나오면 어디서 끊겼는지가 그대로 진단이 된다.
 */
const STEPS = [
    { name: '배차망 화면으로 인식',        re: /화면 변경 감지 \| 화면: LIST/ },
    { name: '1차 필터 통과 → 자동 터치',   re: /\[AUTO\] 꿀콜 조건 통과/ },
    { name: '웹페이지 터치 성공',          re: /\[가로채기 성공!\]/ },
    { name: '상세 화면 진입',              re: /화면: DETAIL_PRE_CONFIRM/ },
    {
        name: 'AUTO 로 보고 (MANUAL 로 안 무너짐)',
        re: /post \/confirm request.*모드: AUTO.*매크로클릭: true/,
        /**
         * 🔴 2026-08-12 에 여기서 `MANUAL (매크로클릭: false)` 가 나왔다.
         * 자동 터치 직후 LIST 오탐으로 세션이 리셋돼 AUTO 가 MANUAL 로 뒤바뀌었고,
         * MANUAL 은 안전취소 없이 즉시 확정되며 아무도 안 치워서 유령 콜이 남았다.
         * 이 줄이 이 검사에서 가장 중요하다.
         */
    },
    { name: '서버가 선빵을 접수',          re: /POST \/confirm 완료.*HTTP 200/ },
    { name: '확정 광클 성공',              re: /화면: DETAIL_CONFIRMED/ },
];

async function run(url) {
    console.log(`\n🧹 로그를 비우고 크롬으로 엽니다…`);
    sh('adb logcat -c');
    sh(`adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main ` +
       `-a android.intent.action.VIEW -d "${url}" > /dev/null`);

    console.log(`👀 왕복을 지켜봅니다 (최대 ${TIMEOUT_MS / 1000}초)\n` +
                `   시뮬레이터가 필터에 맞는 콜을 낼 때까지 기다립니다.\n` +
                `   ⚠️ 시뮬레이터에서 픽업 지역을 먼저 골라야 콜이 나옵니다.\n`);

    const seen = new Array(STEPS.length).fill(null);
    let next = 0;

    const tail = spawn('adb', ['logcat', '-s', '1DAL_MVP', '1DAL_PARSER', '1DAL_TOUCH', '1DAL_API']);
    let buf = '';

    const done = new Promise((resolve) => {
        const timer = setTimeout(() => resolve('timeout'), TIMEOUT_MS);
        tail.stdout.on('data', (chunk) => {
            buf += chunk.toString();
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
                // 순서를 지킨다 — 뒤 단계가 먼저 보이면 그건 이전 사이클의 잔상이다
                if (next < STEPS.length && STEPS[next].re.test(line)) {
                    seen[next] = line.trim();
                    console.log(`  ✅ ${STEPS[next].name}`);
                    next++;
                    if (next === STEPS.length) { clearTimeout(timer); resolve('ok'); }
                }
            }
        });
    });

    const result = await done;
    tail.kill();

    console.log('\n' + '─'.repeat(60));
    if (result === 'ok') {
        console.log(`✅ 왕복 ${STEPS.length}단계 전부 통과`);
        console.log('\n결정적 한 줄:');
        console.log(`   ${seen[4]?.slice(seen[4].indexOf('모드:')) ?? '(못 찾음)'}`);
        process.exit(0);
    }

    console.log(`🔴 ${next}/${STEPS.length} 단계에서 멈췄습니다.`);
    console.log(`   마지막 성공: ${next > 0 ? STEPS[next - 1].name : '(없음)'}`);
    console.log(`   못 넘어간 곳: ${STEPS[next].name}`);
    console.log('\n짚어볼 것:');
    if (next === 0) {
        console.log('   · 크롬으로 열렸는가? (삼성 인터넷이면 웹 콘텐츠가 안 읽힌다)');
        console.log('   · 시뮬레이터에서 픽업 지역을 골랐는가?');
        console.log('   · 화면 판별 단어(신규·빠른설정)가 화면에 보이는가?');
    } else if (next === 1) {
        console.log('   · 필터에 걸릴 콜이 안 나왔을 수 있다 (도착 지역·요금·상차 반경 확인)');
        console.log(`   · adb logcat -s 1DAL_MVP | grep "필터 결과"  로 무엇이 탈락했는지 본다`);
    } else {
        console.log(`   · adb logcat -s 1DAL_MVP 1DAL_PARSER 로 그 구간을 직접 본다`);
    }
    process.exit(1);
}

const url = await preflight();
await run(url);
