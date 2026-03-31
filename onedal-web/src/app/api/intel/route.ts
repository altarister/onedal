import { NextRequest, NextResponse } from "next/server";

// 인텔 데이터 저장소 (MVP용 메모리)
const intelData: Array<{
    texts: string[];
    timestamp: string;
}> = [];

// POST: 탈락 콜 빅데이터 수신 (히트맵 분석용)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { texts } = body;

        if (!texts || !Array.isArray(texts)) {
            return NextResponse.json(
                { error: "texts 배열이 필요합니다" },
                { status: 400 }
            );
        }

        intelData.push({
            texts,
            timestamp: new Date().toISOString(),
        });

        console.log(`📊 [인텔 데이터 수신] ${texts.length}건 저장 (누적: ${intelData.length}건)`);

        return NextResponse.json({ success: true, totalIntel: intelData.length });
    } catch (error) {
        return NextResponse.json(
            { error: "잘못된 요청입니다" },
            { status: 400 }
        );
    }
}

// GET: 인텔 데이터 조회
export async function GET() {
    return NextResponse.json({ intelData, total: intelData.length });
}
