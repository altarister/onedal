import { NextRequest, NextResponse } from "next/server";
import { getIO } from "@/lib/socket";

// 메모리 저장소 (추후 Supabase로 교체)
const orders: Array<{
  id: string;
  texts: string[];
  timestamp: string;
  status: "pending" | "confirmed" | "completed";
}> = [];

// POST: 스캐너 폰(onedal-app)에서 콜 데이터 수신
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

    const newOrder = {
      id: crypto.randomUUID(),
      texts,
      timestamp: new Date().toISOString(),
      status: "pending" as const,
    };

    orders.push(newOrder);

    // Socket.io로 대시보드에 즉시 알림 전송!
    const io = getIO();
    if (io) {
      io.emit("new-order", newOrder);
      console.log(`🆕 [새 콜 수신 + 소켓 전송] ${texts.join(", ")}`);
    } else {
      console.log(`🆕 [새 콜 수신] ${texts.join(", ")} (소켓 미연결)`);
    }

    return NextResponse.json({
      success: true,
      order: newOrder,
      totalOrders: orders.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "잘못된 요청입니다" },
      { status: 400 }
    );
  }
}

// GET: 대시보드 초기 로딩 시 기존 콜 목록 조회
export async function GET() {
  return NextResponse.json({ orders });
}
