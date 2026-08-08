import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

// GET /api/config/keywords?app=인성콜
router.get("/keywords", (req, res) => {
    try {
        const appName = req.query.app as string || "인성콜";
        const fileName = appName === "24시" ? "keywords_24.json" : "keywords_inseong.json";
        
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
                uiNoiseWords: ["출발지", "도착지", "차종", "요금", "설정", "닫기", "콜상세"],
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
