/**
 * pairingStore.ts — 6자리 PIN 기반 기기 페어링 임시 저장소
 * 
 * PIN은 서버 메모리에 3분간 유효하게 보관되며, 1회 사용 후 즉시 폐기됩니다.
 * DB를 사용하지 않는 이유: 3분 TTL의 임시 데이터이므로 메모리가 훨씬 효율적.
 */

interface PendingPin {
    userId: string;
    expiresAt: number;
}

const pendingPins = new Map<string, PendingPin>();

// 만료된 PIN을 주기적으로 정리 (메모리 누수 방지)
setInterval(() => {
    const now = Date.now();
    for (const [pin, entry] of pendingPins) {
        if (now > entry.expiresAt) {
            pendingPins.delete(pin);
        }
    }
}, 60_000); // 1분마다 정리

/**
 * 새로운 6자리 PIN을 생성하고 userId와 매핑하여 메모리에 보관합니다.
 * 동일 userId로 이미 발급된 미사용 PIN이 있으면 폐기 후 새로 발급합니다.
 */
export function generatePin(userId: string): { pin: string; expiresIn: number } {
    // 기존에 이 유저가 받아간 미사용 PIN이 있으면 먼저 정리
    for (const [existingPin, entry] of pendingPins) {
        if (entry.userId === userId) {
            pendingPins.delete(existingPin);
        }
    }

    // 6자리 숫자 생성 (100000~999999)
    let pin: string;
    do {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (pendingPins.has(pin)); // 극히 드문 충돌 방지

    const TTL_MS = 180_000; // 3분
    pendingPins.set(pin, {
        userId,
        expiresAt: Date.now() + TTL_MS,
    });

    console.log(`🔑 [PIN 발급] User: ${userId} → PIN: ${pin} (3분간 유효)`);
    return { pin, expiresIn: 180 };
}

/**
 * PIN을 소비(사용)합니다.
 * 유효한 PIN이면 해당 userId를 반환하고 PIN을 즉시 폐기합니다.
 * 만료되었거나 존재하지 않으면 null을 반환합니다.
 */
export function consumePin(pin: string): string | null {
    const entry = pendingPins.get(pin);

    if (!entry) {
        return null; // 존재하지 않는 PIN
    }

    // 즉시 폐기 (1회용)
    pendingPins.delete(pin);

    if (Date.now() > entry.expiresAt) {
        return null; // 만료된 PIN
    }

    console.log(`✅ [PIN 소비] PIN: ${pin} → User: ${entry.userId} (페어링 성공)`);
    return entry.userId;
}

/**
 * 현재 활성 PIN 수를 반환합니다. (디버깅/모니터링용)
 */
export function getActivePinCount(): number {
    return pendingPins.size;
}
