#!/bin/bash

echo "======================================"
echo "    🚀 1DAL 관제탑 수동 배포 스크립트    "
echo "======================================"

# 설정 정보 입력 받기
read -p "1. EC2 서버 IP 주소를 입력하세요 (예: 13.123.45.67): " IP_ADDR
read -p "2. PEM 키 파일의 정확한 경로를 입력하세요 (예: /Users/seungwookkim/Downloads/mykey.pem): " PEM_KEY
read -p "3. EC2 접속 아이디를 입력하세요 (기본값: ubuntu, 엔터키 누르면 기본값 적용): " EC2_USER
EC2_USER=${EC2_USER:-ubuntu}

# 권한 설정 (PEM 키는 소유자 읽기 권한이 필수입니다)
chmod 400 "$PEM_KEY" 2>/dev/null

echo ""
echo "AWS EC2 ($EC2_USER@$IP_ADDR) 서버 접속 후 배포 작업을 시작합니다..."
echo "서버 성능에 따라 빌드에 1~3분 정도 소요될 수 있습니다."
echo "======================================"

# SSH 접속 후 히어독(Here-Doc)으로 원격 서버에서 실행할 명령어 전달
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$IP_ADDR" << 'EOF'
    set -e # 에러 발생 시 즉시 중단
    
    # 1. 깃허브 최신 코드 파싱
    cd ~/onedal/onedal/onedal-web || { echo "❌ 경로를 찾을 수 없습니다: ~/onedal/onedal/onedal-web"; exit 1; }
    
    echo "📥 [1/4] GitHub에서 최신 코드 받아오는 중..."
    git fetch --all
    git reset --hard origin/main
    git pull origin main
    
    # 2. 패키지 설치
    echo "📦 [2/4] 핵심 패키지 업데이트 및 재설치 중..."
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    pnpm install
    pnpm rebuild better-sqlite3 esbuild
    
    # 3. 프론트엔드 빌드
    echo "🔨 [3/4] 클라이언트 프론트엔드 빌드 중..."
    cd client && pnpm build && cd ..
    
    # 4. PM2 프로세스 재시작
    echo "🔄 [4/4] 기존 구형 서버 엔진 삭제 및 PM2 새 엔진 가동 중..."
    pm2 delete all || true
    pm2 start ecosystem.config.cjs --env production
    pm2 save
    
    echo "======================================"
    echo "✅ [성공] 서버 측 배포 작업이 무사히 끝났습니다!"
EOF

echo "🎉 배포 스크립트 실행이 종료되었습니다. 브라우저에서 사이트가 변경되었는지 확인해주세요!"
