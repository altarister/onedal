// 운전자의 현재 위치(웹 대시보드 브라우저 GPS 또는 목업 좌표) 보존 스토어
export let globalDriverLocation: { x: number, y: number } | null = null;

export function updateDriverLocation(loc: { x: number, y: number }) {
    globalDriverLocation = loc;
}
