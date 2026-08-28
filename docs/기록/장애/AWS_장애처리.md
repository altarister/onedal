# 1DAL 관제탑 배포 에러 및 트러블슈팅 일지 (AWS EC2)

> ⚠️ **2026-08-09 작성 · 이후 코드·인프라와 대조한 적 없음.**
> 2026-08-28 에 같은 증상(521/522)을 다시 겪었는데 **원인은 여기 없는 것**이었다
> (탄력적 IP 미부착 → 인스턴스 재시작에 퍼블릭 IP 가 바뀜). 참고용으로만 볼 것.

본 문서는 **1DAL 관제탑(웹 대시보드) 최신화 배포 시 발생했던 심각한 오류(구형 UI 지속 표출, Web server is down 521 등)**에 대한 원인 분석 및 완벽 해결 과정을 담고 있습니다. 향후 서버 이전이나 유지보수 시 반드시 참고하시기 바랍니다.

## 🚨 발생했던 문제 증상

1. **지속적인 구형 UI(유령) 강제 출력**: VITE+Express 기반의 최신 칵핏 모드로 개편했음에도, `1dal.altari.com` 접속 시 며칠 전에 만든 구형(Next.js) 버전의 UI와 텍스트("상차지 전화", "실시간 콜 모니터링")가 지워지지 않고 표출됨.
2. **521 Web server is down**: 조치를 취해 배포를 다시 시도했을 시, 서버가 아예 죽어버리고 Cloudflare 에러 화면이 등장함.

---

## 🔍 핵심 원인 분석 (3중 충돌)

위 증상들은 단일 버그가 아니라 서버-코드-계정에 얽힌 **3가지 주요 원인이 연쇄 반응**을 일으킨 결과였습니다.

#### 1. GitHub 계정 '결제 잠금(Billing Lock)' 상태 (배포 로봇 정지)
*   **현상**: `deploy.yml` 파일이 작성되어 있었음에도 불구하고, 푸시할 때마다 배포가 전혀 진행되지 않았음.
*   **원인**: GitHub Actions의 경우 2,000분 무료 제한 혹은 카드 정보 만료 시 자동으로 계정에 "Billing Lock"을 걸어 CI/CD 동작을 강제 중단함. 이로 인해 대표님께서 3일 전 마지막으로 올렸던 구형 UI 버전에 머문 채, **신규 코드가 AWS 서버로 한 줄도 전송되지 못하고 있었음.**

#### 2. AWS EC2의 하드코딩된 패킷 전달 규칙 (`iptables` 포트 포워딩)
*   **현상**: 새 엔진 포트를 Nginx 관례에 맞춰 3000번으로 내렸더니 사이트 접속이 불가능해짐.
*   **원인**: 서버에 접속해 네트워크 계층을 뜯어본 결과, Nginx 대신 리눅스 커널의 방화벽(`iptables`)이 80번(HTTP) 포트로 들어오는 외부 손님을 묻지도 따지지도 않고 **4000번 포트로 납치(Redirect)** 하도록 수동 세팅되어 있었음.

#### 3. Express 5.x 버전의 엄격한 정규식 파싱 오류 (`path-to-regexp` Crash)
*   **현상**: AWS에서 PM2로 새 엔진을 켜자마자 바로 추락(Crash) 해버림.
*   **원인**: 리액트의 빈 페이지(SPA) 처리를 위해 넣어둔 `/^.*$/` 형태의 정규식 구문을 최신 Express 5.x의 `path-to-regexp(v8)`가 매우 위험한 코드로 인지하여 `App crashed: Missing parameter name at index 1: *` 에러를 뱉고 서버를 즉각 종료시킴.

---

## 🛠 해결 방안 및 조치 내역

#### 1. GitHub 의존도 삭제: 다이렉트 수동 배포 스크립트 구축 (`deploy.sh`)
*   카드 결제 문제를 무시하고 언제든 최신 코드를 쏠 수 있도록, 대표님의 Mac PC에서 직접 SSH 프로토콜로 AWS 서버에 잠입하여 깃헙 코드를 스스로 당겨오게(pull) 만드는 **수동 배포 스크립트(`deploy.sh`)**를 제작했습니다.

#### 2. 애플리케이션 포트 원복 및 고정 (`4000`)
*   `ecosystem.config.cjs` 의 프로덕션 환경설정을 무조건 AWS 방화벽 하드코딩 규칙과 동일한 **`PORT: 4000`** 으로 강제하여, 외부 트래픽을 놓치지 않고 100% 흡수하도록 수정했습니다.

#### 3. Express 5.x 호환을 위한 범용 와일드카드 처리 (`app.use`)
*   서버 충돌을 일으킨 `app.get(/^.*$/)` 정규식을 버리고, 모든 라우트를 안전하게 덮어쓰는 `app.use((req, res) => res.sendFile(...))` 방식으로 우회 적용하여 SPA 페이지 전환 시 다운되는 문제를 영구적으로 해결했습니다.

---

## 🎯 앞으로 배포가 필요할 때 (How to Deploy)

코드 수정 후 `git add -> commit -> push` 를 마치셨다면, 아래의 방법으로 10초 만에 실서버에 적용할 수 있습니다.

**터미널 실행 명령어**:
```bash
cd /Users/seungwookkim/reps/onedal
./deploy.sh
```

**입력 정보**:
1. EC2 IP: `44.222.73.86`
2. PEM KEY: `/Users/seungwookkim/reps/onedal/.github/1dal.pem`
3. 아이디: `(그냥 엔터 키 눌러서 ubuntu로 접속)`

---

## 🗺️ [추가] 카카오 API 연동 트러블슈팅 (OPEN_MAP_AND_LOCAL 오류)

### 🚨 발생했던 문제 증상
*   **현상**: 안드로이드 봇이 주소를 완벽하게 스크래핑해 서버로 넘겼음에도 불구하고, 서버의 `kakaoUtil.ts`(지금은 `services/kakaoService.ts`)에서 지오코딩 1~3차 폴백 시도가 모두 에러(`카카오 좌표 변환 최종 실패`)로 떨어짐.
*   **에러 로그 확인**: 서버에서 직접 API를 때려보니 카카오 서버가 `{"errorType":"NotAuthorizedError","message":"App(1DAL) disabled OPEN_MAP_AND_LOCAL service."}` 패킷을 반환 중이던 상태.

### 🔍 원인 파악 및 조치 내역
*   **원인**: 소스코드나 로직 결함이 아닌, 실제 **[Kakao Developers 콘솔]** 상에서 해당 REST API Key를 품고 있는 앱의 **'카카오맵(Local API)' 제품 권한 스위치가 꺼져 있어(Disabled)** 발생한 시스템적 호출 거부.
*   **조치**: 카카오 데브 콘솔 접속 ➡️ `[내 애플리케이션]` ➡️ 좌측 하단 스크롤 ➡️ `[제품 설정]` - `[카카오맵]` 접속 ➡️ **사용 설정 스위치 `[ON]`** 전환.
*   **결과**: 스위치를 켜자마자 서버 재부팅 없이 즉각적으로 카카오 좌표 변환이 뚫리면서, 단독 주행 예상 거리/시간 연산 파이프라인이 정상 작동함.

---

## 🛠️ [추가] AWS EC2 시스템 및 환경 변수 튜닝 (Task 20, 30)

### 1. EC2 스왑 메모리 및 iptables 튜닝 (Task 20)
1DAL 관제탑이 구동되는 프리티어(t2.micro) EC2 인스턴스는 물리 RAM이 1GB로 매우 부족하여, Node.js V8 엔진의 힙 아웃오브메모리(OOM)가 발생할 수 있습니다.
- **스왑 메모리 2GB 확보**: `/swapfile`을 생성하여 디스크 용량을 가상 메모리로 활용, Node.js 프로세스의 강제 종료를 방어합니다.
  ```bash
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  ```
- **iptables 튜닝 유지**: 80번 포트로 들어오는 트래픽을 Nginx 없이 직접 PM2(4000번 포트)로 우회시키는 리눅스 커널 규칙(`iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 4000`)이 서버 재부팅 시 초기화되지 않도록 `iptables-persistent` 패키지로 고정해야 합니다.

### 2. 클라이언트 `EC2_HOST` 환경 변수 동적 바인딩 (Task 30)
앱과 서버가 통신할 때 IP 하드코딩을 방지하기 위해 환경 변수를 활용합니다.
- VITE 빌드 시 클라이언트 코드에 주입되는 `VITE_API_BASE_URL`을 `.env`의 `EC2_HOST` 변수와 매핑하여 동적으로 바인딩합니다.
- 서버 IP가 변경(예: EC2 재시작으로 인한 유동 IP 변경)되더라도, 클라이언트 코드를 일일이 수정할 필요 없이 PM2 생태계 파일(`ecosystem.config.cjs`)과 `.env`만 수정하고 재빌드하여 신속하게 대응할 수 있습니다.

---

# 되돌리는 법 — **먼저 만든다**

> 되돌릴 자리가 없으면 배포하지 않는다.

## 코드

```bash
git tag live-YYYY-MM-DD origin/main     # 지금 라이브에 이름을 준다
git push origin live-YYYY-MM-DD
git push origin +live-YYYY-MM-DD:main   # 롤백 — 자동 재배포가 따라온다
```

🔴 **`main` 은 «지금 라이브에 있는 것»이다.** `main` 에서 직접 작업하면 롤백이 한 줄로 안 끝난다.

## DB

배포 스크립트가 **코드 갱신 전에** 자동으로 뜬다 (최근 5개 보관).

```bash
cd ~/onedal/onedal/onedal-web/server
ls -la data.db.backup-*        # 어느 것으로 돌아갈지 눈으로 고른다
pm2 stop all                   # 쓰는 중에 바꾸면 깨진다
cp -a data.db.backup-<고른것> data.db
pm2 start all
```

🔴 **코드와 DB 는 짝이다.** 옛 코드로 되돌렸으면 **그때 DB** 로 같이 돌아가야 한다.
새 스키마의 DB 를 옛 코드에 물리면 조용히 어긋난다.

⚠️ WAL 모드라 `data.db` 만 뜨면 **최근 데이터가 빠진다.** `-wal`·`-shm` 셋을 같이 뜬다.

---

# 인스턴스가 통째로 안 보일 때 (2026-08-28 실측)

증상: **HTTP 522/521 · SSH 타임아웃 · ping 100% 손실.**
GitHub Actions 배포도 SSH 단계에서 실패한다 — 즉 **우리 네트워크 문제가 아니다.**

## 원인

인스턴스를 **정지했다 시작**하면 퍼블릭 IP 가 바뀐다. 그러면 SSH·Cloudflare 둘 다 끊긴다.
(재부팅reboot 은 IP 가 유지된다. 정지→시작만 바뀐다)

## 조치

```
1. AWS 콘솔 → 리전 N. Virginia → EC2 → 인스턴스 상태 확인
2. Elastic IPs → Allocate → Associate      ← 이걸 붙여야 다시 안 당한다
3. Cloudflare DNS 의 A 레코드를 새 IP 로 (1dal · rehearsal · api)
4. ~/.ssh/config 의 HostName 갱신
5. GitHub Secrets 의 EC2_H0ST 도 갱신      ← 안 하면 자동 배포가 계속 실패
```

🔴 **`EC2_H0ST` 의 `0` 은 숫자다.** 워크플로가 `EC2_H0ST || EC2_HOST` 로 읽는데 숫자 0
짜리만 존재한다 — 「오타를 고치면」 자동 배포가 깨진다.

💰 탄력적 IP 는 **붙여 두면 추가 비용이 없다** (퍼블릭 IPv4 는 어차피 시간당 $0.005).
다만 **인스턴스를 정지시켜 둬도 요금이 나간다** — 오래 세울 계획이면 그때 해제한다.

## 부팅 자동복구 — 2026-08-28 에 막았다

인스턴스가 떠도 **서버는 안 떴다.** 둘이 없었다:

- **`pm2 startup` 이 만든 유닛이 애초에 고장** — `Type=forking` + `PIDFile=~/.pm2/pm2.pid`
  인데 **PM2 v6 은 그 파일을 안 만든다.** systemd 가 «protocol» 실패로 판정하고 포기한다
  → `Type=oneshot` + `RemainAfterExit=yes` 로 바꿨다
- **`ecosystem.config.cjs` 의 `cwd` 가 상대경로(`./server`)** — systemd 는 작업 디렉터리가
  `/` 라 `/server` 를 찾는다. `pm2 resurrect` 가 **종료코드 0 으로 성공을 보고하고 아무것도
  안 띄웠다** → `WorkingDirectory=` 를 박았다
- **iptables 80→4000 이 재부팅에 날아간다** → `onedal-portforward.service` 로 영구화

🔴 **`pm2 startup` 을 다시 돌리지 말 것.** 고친 유닛이 원래(고장난) 것으로 되돌아간다.
🔴 **`systemctl stop pm2-ubuntu` 는 서버를 죽인다** (`ExecStop=pm2 kill`).

✅ 재부팅으로 실증했다 — **부팅 14초 뒤 자동 기동, 총 20초 만에 도메인 200.**
