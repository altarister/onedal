/**
 * 🕐 **서버는 한국 시간으로 돈다** (기사님: «저장 시간도 한국 시간으로 해»).
 *
 * 실서버(EC2)는 Etc/UTC 다 — 기계 시간대를 따르는 날 계산(`businessDayKey` · 영업일 전환 · 17시 일과 종료 ·
 * 되살리는 기간의 «오늘 0시» · 예약 보관 날)이 한국 09시에 날을 바꾸고 한국 02시를 17시로 읽었다.
 * 🔴 **서버 입구(`index.ts`)의 첫 import 다** — 날 계산·로그보다 먼저 정해야 한다.
 * 🔴 늘 Asia/Seoul 로 둔다 — 배포 설정(ecosystem TZ)이 빠지거나 pm2 가 옛 env 를 쥐어도 서버 자신이 맞춘다.
 *    Node 는 실행 중 `process.env.TZ` 를 바꾸면 그 뒤 Date 계산에 반영한다.
 * ⚠️ +9시간을 직접 더하는 자리(fileLogger · pickupClockMsOf …)는 모두 `toISOString()` 이나 `+09:00` 글자라
 *    기계 시간대와 무관하다 — 이 줄과 겹쳐 두 번 보정되지 않는다.
 */
process.env.TZ = 'Asia/Seoul';

/** 지금 이 프로세스가 쓰는 시간대 — 부팅 로그 한 줄로 확인한다 */
export const serverTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
