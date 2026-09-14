/**
 * 🌐 **시뮬레이터가 묻는 서버 주소** — 위치(`/api/sim/driver-location`)와 개별콜(`/api/sim/calls`)이 같은 서버에 묻는다.
 * `?api=` 로 바꿀 수 있고, 기본은 같은 호스트의 :4000 이다 (폰 안 웹뷰가 맥을 본다).
 */
export function simApiBase(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('api') || `http://${window.location.hostname}:4000`;
}
