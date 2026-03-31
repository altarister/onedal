# AWS 배포 및 CI/CD 100% 자동화 가이드라인

승욱님, 프로젝트 소스코드 레벨에서 클라우드 배포를 위한 모든 튜닝(프론트엔드-백엔드 정적 서빙 병합, PM2 데몬 설정, GitHub Actions 로봇 스크립트 작성)을 마쳤습니다. 

이제 승욱님께서 **AWS 콘솔에서 버튼 몇 개만 누르시고 연결해 주시면** 앞으로 깃허브에 코드를 `push` 할 때마다 로봇이 알아서 프론트를 빌드하고, 백엔드를 재시작하여 0.1초 만에 실제 운영 서버에 반영해 줍니다. 아래 절차를 천천히 따라와 주세요!

---

## 단계 1. AWS EC2 (가상 서버) 생성하기

1. AWS Console에 로그인 후 **[EC2]** 서비스로 이동합니다.
2. **[인스턴스 시작]** 버튼을 누릅니다.
3. 설정값을 다음과 같이 맞춥니다:
   - **이름**: `onedal-server` (원하시는 이름)
   - **OS 이미지 (AMI)**: `Ubuntu Server 24.04 LTS` (반드시 Ubuntu 선택!)
   - **인스턴스 유형**: `t3.micro` 또는 `t2.micro` (프리티어)
   - **키 페어**: [새 키 페어 생성]을 눌러 `onedal-key.pem` 이름으로 파일을 다운로드 받아 안전한 곳(바탕화면 등)에 보관해 둡니다. (이 파일이 있어야 로봇이 서버에 접속할 수 있습니다)
   - **네트워크 설정 (보안 그룹)**:
     - ✅ SSH 트래픽 허용 (포트 22)
     - ✅ 인터넷에서 HTTP 트래픽 허용 (포트 80)
     - ✅ [사용자 지정 TCP] 포트 `4000` 번 추가 개방 (Anywhere 0.0.0.0/0)
4. 스토리지(디스크)는 30GB (프리티어 최대치)로 맞추고 **[인스턴스 시작]**을 누릅니다.

---

## 단계 2. 뽑은 키(PEM)를 깃허브 로봇에게 쥐여주기

아까 다운로드 받은 `.pem` 파일은 승욱님 노트북과 GitHub 로봇이 사용할 "마스터 키"입니다.
해킹 방지를 위해 코드가 아닌, 깃허브 레포지토리의 보안 금고(Secrets)에 등록해야 합니다.

1. 웹 브라우저에서 `onedal` 깃허브 Repository로 접속합니다.
2. `Settings` 탭 ➡️ 좌측 메뉴 `Secrets and variables` ➡️ `Actions` 클릭.
3. 우측 상단 **[New repository secret]**을 눌러 다음 3가지 암호를 만듭니다:

| Name | Secret | 설명 |
|---|---|---|
| **`EC2_HOST`** | `3.14.x.x` | 생성된 EC2의 퍼블릭 IP 주소 (AWS 대시보드에서 복사) |
| **`EC2_USERNAME`** | `ubuntu` | 우분투 기본 사용자명 |
| **`EC2_PEM_KEY`** | `-----BEGIN RSA PRIVATE KEY...` | 아까 받은 다운받은 ID/PW 파일(`.pem`)을 메모장으로 열어 안의 글자를 **통째로 복사해서** 붙여넣습니다. |

---

## 단계 3. 터미널로 깡통 서버에 한 번만 접속해서 기초 세팅하기

생성된 서버는 완전한 깡통(빈 윈도우/리눅스) 상태입니다. Node.js와 프로젝트를 구동할 필수 툴판을 딱 한 번만 깔아줍니다.
승욱님의 노트북 터미널(iTerm)을 열고, 아까 다운받은 `pem` 키가 있는 폴더로 가서 아래 명령어들을 칩니다.

```bash
# 1. 키 파일 권한을 안전하게 변경 (Mac 필수)
chmod 400 onedal-key.pem

# 2. EC2에 원격 접속 (AWS IP주소 부분은 본인 것으로 변경)
ssh -i "onedal-key.pem" ubuntu@AWS서버_실제_IP주소
```

터미널 화면이 `ubuntu@ip-...` 로 바뀌었다면 성공적으로 미국/한국 어딘가에 있는 가상 PC 안으로 들어온 것입니다!
그 안에서 다음 명령어 블록을 **전체 복사해서 한 번에 붙여넣기** 하세요. (서버 뼈대를 세우는 과정)

```bash
# 1. 시스템 업데이트 및 필수 패키지 & Node.js 20버전 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20

# 2. 전역 도구(pnpm, pm2) 설치
npm install -g pnpm pm2

# 3. 깃허브에서 내 소스코드 뼈대 가져오기 (Git Clone)
mkdir -p ~/onedal
cd ~/onedal
git clone https://github.com/altarister/onedal.git
cd onedal

# 4. 방화벽 80포트를 API 코어인 4000포트로 몰래 넘겨주는 포트포워딩 세팅 (권한 우회 꿀팁)
sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 4000
```
*(위 과정까지 다 끝났다면 서버에서 `exit` 치고 컴퓨터를 끄셔도 서버는 24시간 돌아갑니다)*

---

## 🎉 단계 4. Cloudflare 도메인(1dal.altari.com) 연동하기!

승욱님은 이미 `altari.com` 도메인과 최고 성능의 클라우드플레어(Cloudflare) 네임서버를 보유하고 계시므로, SSL(https) 보안 인증서까지 **단 1분의 클릭**으로 전 세계에 무료 배포할 수 있습니다!

1. Cloudflare 대시보드로 로그인 후 `altari.com` 도메인 선택.
2. 좌측 메뉴 **DNS -> Records (레코드)** 로 이동.
3. **[Add record (레코드 추가)]** 버튼 클릭:
   - **Type**: `A`
   - **Name**: `1dal` (서브도메인)
   - **IPv4 address**: 위에 만든 AWS EC2의 퍼블릭 IP 주소 입력
   - **Proxy status**: 🟠 **Proxied (구름 모형 켜짐)** 유지. (이 기능이 HTTPS 자물쇠를 공짜로 달아줍니다)
   - Save(저장) 클릭.
4. 좌측 메뉴 **SSL/TLS -> Overview** 로 이동:
   - 암호화 모드를 **Flexible (가변적)** 으로 설정합니다. (사용자와 Cloudflare 사이는 HTTPS, Cloudflare와 AWS 사이는 HTTP 통신을 허용하여 서버 세팅 부담을 0으로 만듦)

---

## 🚀 단계 5. 이제 푸시만 하면 끝납니다!

자, 이제 승욱님의 Mac 환경에서 터미널에 아래 명령어를 쳐서 오늘 변경한 파일들(CI/CD 등)을 깃허브로 Push 해주세요!
```bash
git add .
git commit -m "chore: AWS 배포 자동화 파이프라인 (pm2, actions) 추가"
git push
```

푸시함과 동시에, GitHub 페이지의 `[Actions]` 탭에 들어가 보시면 노란색 불이 돌면서 로봇이 방금 만든 EC2 서버에 들어가 스스로 빌드하고 재시작시키는 감동적인 장면을 실시간으로 보실 수 있습니다.

배포가 다 끝난 후, 아이패드나 크롬 주소창에 `https://1dal.altari.com` 로 접속해 보세요. 
포트 입력 없이, 자물쇠(https)가 채워진 깔끔한 원달 대시보드가 뜰 것입니다! 

> [!TIP]
> 이제 안드로이드 스캐너 앱(`HijackService.kt` 144번째 줄 부근) 통신 URL을 `http://10.0.2.2:4000/api/orders` 에서 `https://1dal.altari.com/api/orders` 로 단 한 줄 수정하고 앱을 업데이트하시면 끝입니다! 드디어 전 세계 어디서든 휴대폰 스캐너와 관제 화면이 실시간 통신하게 됩니다.
