import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

/**
 * 배차망 화면의 **UI 글자 사전** — 앱이 부팅 때(`onServiceConnected`) 받아 간다.
 *
 * 🔴 `uiNoiseWords` 는 "지역명이 아니라 버튼·라벨" 인 글자다.
 *    앱의 `LocationTextAnalyzer` 2차 규칙이 **순수 한글 2~4자면 축약 지역명으로 인정**하기
 *    때문에(`의왕`·`강남`·`광주` 를 잡으려던 규칙), 여기에 없는 버튼 글자는 그대로 지역이 된다.
 *
 *    2026-08-14: 운행 중에 잡은 콜이 **상차지 "전표" · 하차지 "신규"** 로 올라왔다.
 *    `전표` 는 확정 상세 화면의 버튼, `신규` 는 리스트 화면의 첫 탭이다. 둘 다 한글 2자라
 *    통과했고, 사전에 없었다.
 *
 * ⚠️ **이 사전을 늘리는 것은 근본 해결이 아니다.** 배차망이 버튼 하나 추가하면 또 뚫린다.
 *    근본은 *"실재하는 지역인지 대조"* 다 — 서버에 전국 읍/면/동 1239개가 이미 있고(geoService),
 *    앱이 그걸 받아 대조하면 `전표` 는 어떤 사전에도 없으니 걸린다.
 *    앱 수정이 필요하므로 **다음 앱 배포 대기 칸**(todo.md)에 넣어 뒀다.
 */
// GET /api/config/keywords?app=인성콜
router.get("/keywords", (req, res) => {
    try {
        const appName = req.query.app as string || "인성콜";
        const fileName = appName === "24시" ? "keywords_24.json"
            : appName === "픽커" ? "keywords_picker.json"
            : "keywords_inseong.json";
        
        // __dirname은 src/routes (tsx 실행) 또는 dist/routes (빌드 실행).
        // 두 경우 모두 2단계 위가 server/ 이고, 설정 파일은 server/config/ 에 있다.
        // [Phase 1.5] 기존 "../../../config"는 onedal-web/config 를 가리켜 항상 실패했다.
        const configPath = path.join(__dirname, "../../config", fileName);
        
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, "utf-8");
            res.json(JSON.parse(data));
        } else {
            console.error(`설정 파일 없음: ${configPath}`);
            // 기본값 제공
            res.json({
                appName: "인성콜",
                // ⚠️ 폴백은 파일이 없을 때만 쓰인다. 진짜 사전은 server/config/keywords_*.json
                uiNoiseWords: ["출발지", "도착지", "차종", "요금", "설정", "닫기", "콜상세", "전표", "신규", "완료"],
                confirmButtonText: "확정",
                cancelButtonText: "취소",
                pickupButtonText: "출발지",
                dropoffButtonText: "도착지"
            });
        }
    } catch (e) {
        console.error("keywords GET 에러:", e);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;
