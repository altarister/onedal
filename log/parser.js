const fs = require('fs');
const path = require('path');

// Execute like: node parser.js 0416_1805
const targetDirName = process.argv[2];
if (!targetDirName) {
    console.error("❌ 에러: 폴더명을 입력해주세요. 예: node parser.js 0416_1805");
    process.exit(1);
}

const baseLogDir = path.join(__dirname, targetDirName);
let dataDir = path.join(baseLogDir, 'data');
const outFile = path.join(baseLogDir, '1DAL_Lifecycle_Report.md');

if (!fs.existsSync(dataDir)) {
    // data 폴더가 없으면 baseLogDir 자체를 데이터 폴더로 사용 시도
    if (fs.existsSync(path.join(baseLogDir, 'app.txt')) || fs.existsSync(path.join(baseLogDir, 'server.txt')) || fs.existsSync(path.join(baseLogDir, 'front.txt'))) {
        dataDir = baseLogDir;
    } else {
        console.error(`❌ 에러: 데이터 폴더를 찾을 수 없습니다: ${dataDir} (또는 ${baseLogDir} 내 txt 파일 없음)`);
        process.exit(1);
    }
}

// ─── 유틸리티 ───
function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
}

function offsetTime(timeStr, hours) {
    if (!timeStr || hours === 0) return timeStr;
    const parts = timeStr.split(':');
    let h = parseInt(parts[0], 10);
    h = (h + hours) % 24;
    return String(h).padStart(2, '0') + ':' + parts[1] + ':' + parts[2];
}

// ─── 1차: 원본 타임스탬프로 파싱 (오프셋 미적용) ───
const entries = [];
let lastServerTs = "00:00:00.000";
let lastFrontTs = "00:00:00.000";

// Process App (timestamps are always KST)
try {
    const appLines = fs.readFileSync(path.join(dataDir, 'app.txt'), 'utf8').split('\n');
    appLines.forEach(line => {
        if (!line.trim()) return;
        const rmMatch = line.match(/\[ROADMAP (\d{2}:\d{2}:\d{2}\.\d{3})\]/);
        if (rmMatch) {
           entries.push({ time: rmMatch[1], line: line.trim(), source: 'app', isRm: true });
        } else {
           let payloadBody = line;
           let timeStr = "00:00:00.000";
           const lcMatch = line.match(/^\d{4}-\d{2}-\d{2}\s(\d{2}:\d{2}:\d{2}\.\d{3})\s+\d+-\d+\s+.*?\s+[DIWE]\s+(.*)$/);
           if (lcMatch) {
               timeStr = lcMatch[1];
               payloadBody = lcMatch[2];
           } else {
               const lastAppEntry = entries.filter(e => e.source === 'app').pop();
               timeStr = lastAppEntry ? lastAppEntry.time : "00:00:00.000";
           }
           
           if (payloadBody.includes('📦') || payloadBody.includes('{') || payloadBody.includes('}') || payloadBody.includes('└─') || payloadBody.includes('필터 전체 스키마') || payloadBody.match(/^\s*"/)) {
               entries.push({ time: timeStr, line: payloadBody.trimEnd(), source: 'app_payload', isRm: false });
           }
        }
    });
} catch (e) {
    console.log(`⚠️ app.txt 경로를 찾을 수 없거나 파싱 오류: ${e.message}`);
}

// Process Server (원본 타임스탬프 유지, 오프셋은 후처리)
try {
    const serverLines = fs.readFileSync(path.join(dataDir, 'server.txt'), 'utf8').split('\n');
    serverLines.forEach(line => {
        if (!line.trim()) return;
        const rmMatch = line.match(/\[ROADMAP (\d{2}:\d{2}:\d{2}\.\d{3})\]/);
        if (rmMatch) {
            lastServerTs = rmMatch[1];
            entries.push({ time: lastServerTs, line: line.trim(), source: 'server', isRm: true });
        } else {
            if (line.includes('📦') || line.trim().startsWith('{') || line.trim().startsWith('}') || line.includes('└─') || line.includes('상차지 변환') || line.includes('패널티 결과') || line.includes('EMERGENCY') || line.includes('Action: KEEP') || line.trim().startsWith('"') || line.includes('카카오 연산 완료')) {
                entries.push({ time: lastServerTs, line: line.trimEnd(), source: 'server_payload', isRm: false });
            }
        }
    });
} catch (e) {
    console.log(`⚠️ server.txt를 찾을 수 없거나 파싱 오류: ${e.message}`);
}

// Process Front (원본 타임스탬프 유지, 오프셋은 후처리)
try {
    const frontLines = fs.readFileSync(path.join(dataDir, 'front.txt'), 'utf8').split('\n');
    frontLines.forEach(line => {
        if (!line.trim()) return;
        const rmMatch = line.match(/\[ROADMAP (\d{2}:\d{2}:\d{2}\.\d{3})\]/);
        if (rmMatch) {
            lastFrontTs = rmMatch[1];
            entries.push({ time: lastFrontTs, line: line.trim(), source: 'front', isRm: true });
        } else if (line.includes('GPS') || line.includes('최신 데이터로 화면 강제 동기화') || line.includes("프론트에서 '유지 확정'") || line.includes('Emergency')) {
            entries.push({ time: lastFrontTs, line: line.trimEnd(), source: 'front_payload', isRm: false });
        }
    });
} catch (e) {
    console.log(`⚠️ front.txt를 찾을 수 없거나 파싱 오류: ${e.message}`);
}

if (entries.length === 0) {
    console.log("❌ 에러: 파싱된 데이터가 없습니다.");
    process.exit(1);
}

// ─── 2차: 시간 오프셋 자동 감지 (UTC vs KST) ───
const appRmTimes = entries.filter(e => e.source === 'app' && e.isRm).map(e => timeToSeconds(e.time));
const serverRmTimes = entries.filter(e => e.source === 'server' && e.isRm).map(e => timeToSeconds(e.time));

let detectedOffset = 0;
if (appRmTimes.length > 0 && serverRmTimes.length > 0) {
    const avgApp = appRmTimes.reduce((a, b) => a + b, 0) / appRmTimes.length;
    const avgServer = serverRmTimes.reduce((a, b) => a + b, 0) / serverRmTimes.length;
    const diffHours = Math.abs(avgApp - avgServer) / 3600;

    if (diffHours > 7 && diffHours < 11) {
        detectedOffset = 9;
        console.log(`🕐 시간 오프셋 자동 감지: 서버/프론트 +${detectedOffset}시간 (UTC → KST 보정)`);
    } else {
        console.log(`🕐 시간 오프셋 자동 감지: 0시간 (동일 시간대 — 보정 불필요)`);
    }
}

// 오프셋 적용 (필요 시에만)
if (detectedOffset > 0) {
    entries.forEach(e => {
        if (e.source === 'server' || e.source === 'server_payload' ||
            e.source === 'front' || e.source === 'front_payload') {
            e.time = offsetTime(e.time, detectedOffset);
        }
    });
}

// ─── 3차: 시간순 정렬 ───
entries.sort((a, b) => a.time.localeCompare(b.time));

// ─── 4차: 상태 추적 기반 STEP 분류 ───
// 하드코딩 타임스탬프 제거, 문맥 기반 + 상태 추적 방식으로 전환
let hasReceivedFirstKeep = false;

const steps = [
    { title: "### 🟢 [STEP 1] 관제탑 서버 기동 및 필터 동기화", added: false,
      check: () => true },

    { title: "### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)", added: false,
      check: (e) => e.source === 'app' && e.isRm && e.line.includes("화면 변경 감지") },

    { title: "### 🟡 [STEP 3] 1차 확정 통신", added: false,
      check: (e) => e.line.includes("확정 버튼 광클") ||
                     e.line.includes("POST /orders/confirm 확정정보") ||
                     (e.source === 'app' && e.isRm && e.line.includes("'확정' 추출 후 클릭")) },

    { title: "### 🟢 [STEP 4] 2차 상세 수집: 팝업 자동 서핑", added: false,
      check: (e) => e.source === 'app' && e.isRm && e.line.includes("확정페이지 진입") },

    { title: "### 🟢 [STEP 5] 카카오 연산 3중 폴백 & 자동 회랑 전개", added: false,
      check: (e) => e.line.includes("카카오 API 3중 폴백") || e.line.includes("3중 폴백") || e.line.includes("상하차지 송출") },

    { title: "### 🟢 [STEP 6] 관제탑 결재 (취소 vs 유지)", added: false,
      check: (e) => e.line.includes("프론트에서 '유지 확정'") || e.line.includes("유지 전달") || e.line.includes("취소 전달") ||
                     e.line.includes("[소켓 Decision]") || e.line.includes("유지 정보 전송") || e.line.includes("취소 정보 전송") ||
                     e.line.includes("합짐 필터로 설정값 업데이트") || e.line.includes("첫콜 필터로 설정값 업데이트") },

    // STEP 7: 합짐 필터 업데이트(KEEP 결정) 이후, 앱이 리스트로 복귀하여 2차 스캔을 시작할 때 트리거
    { title: "### 🚀 [STEP 7] \"합짐\" 2차 선점 (합짐 사냥 돌입 & 우회 동선 연산)", added: false,
      check: (e) => hasReceivedFirstKeep && (
                     e.line.includes("POST /orders/confirm 확정정보") ||
                     e.line.includes("1차 선빵 수신") ||
                     (e.source === 'app' && e.isRm && e.line.includes("[LIST]") && e.line.includes("화면 변경 감지"))
                  ) },

    // STEP 8: 실제 비상상황만 (데스밸리 '타이머 기동'은 예방적 조치이므로 제외)
    { title: "### 🚨 [STEP 8] 관제탑 무응답 및 데스밸리 방어기동 (예외 처리)", added: false,
      check: (e) => e.line.includes("데스밸리 경고") ||
                     e.line.includes("EMERGENCY") ||
                     e.line.includes("서버 강제 해방") ||
                     e.line.includes("AUTO_CANCEL") },
];

let lastEmittedStep = -1;

let md = `# 🗺️ 1DAL 풀 스택 라이프사이클 로그 매핑 리포트 (${targetDirName} Full Data)\n\n---\n\n`;

let prevIsCode = false;
entries.forEach(e => {
    // Step 헤더 삽입
    for (let i = 0; i < steps.length; i++) {
        if (steps[i].check(e)) {
            // STEP 1 should only be emitted once. For others, emit if it's a new step in the sequence.
            if (i === 0 && steps[0].added) continue;
            
            if (lastEmittedStep !== i) {
                if (prevIsCode) { md += "```\n\n    </details>\n"; prevIsCode = false; }
                steps[i].added = true;
                lastEmittedStep = i;
                md += "\n" + steps[i].title + "\n";
                md += "*(시작 기준 시간: " + e.time + ")*\n\n";
            }
            break; // 해당 로그가 한 단계에 매칭되면 하위 단계 중복 매칭 방지
        }
    }

    // 상태 추적: KEEP 결정 시 합짐 모드 플래그 활성화
    if (e.line.includes('합짐 필터로 설정값 업데이트')) {
        hasReceivedFirstKeep = true;
    }
    
    // Formatting
    if (e.source.includes('payload')) {
        let cleaned = e.line;
        if (e.source === 'app_payload') {
           const match = cleaned.match(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}\s+\d+-\d+\s+.*?\s+[DIWE]\s+(.*)$/);
           if (match) cleaned = match[1];
        } else if (e.source === 'front_payload') {
           cleaned = cleaned.replace(/^\S+\.(?:ts|tsx|js|jsx):\d+\s+/, '');
        }
        
        if (!prevIsCode) { 
            let previewText = cleaned.trim().substring(0, 80).replace(/</g, "&lt;").replace(/>/g, "&gt;");
            if (cleaned.length > 80) previewText += "...";
            if (!previewText) previewText = "JSON 데이터";
            
            md += `\n    <details>\n    <summary>🔽 ${previewText}</summary>\n\n    \`\`\`json\n`; 
            prevIsCode = true; 
        }
        
        md += "    " + cleaned + "\n";
    } else {
        if (prevIsCode) { 
            md += "    ```\n\n    </details>\n"; 
            prevIsCode = false; 
        }
        
        let cleaned = e.line;
        if (e.source === 'app') {
            const match = cleaned.match(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}\s+\d+-\d+\s+.*?\s+[DIWE]\s+(.*)$/);
            if (match) cleaned = match[1];
        } else if (e.source === 'front') {
            cleaned = cleaned.replace(/^\S+\.(?:ts|tsx|js|jsx):\d+\s+/, '');
        }
        
        if (e.isRm) {
            md += "- `" + cleaned + "`\n";
        } else {
            md += "- **PAYLOAD/INFO**: `" + cleaned + "`\n";
        }
    }
});

if (prevIsCode) { md += "    ```\n\n    </details>\n"; }

fs.writeFileSync(outFile, md, 'utf8');
console.log(`✅ 성공적으로 리포트를 생성했습니다! -> ${outFile}`);
