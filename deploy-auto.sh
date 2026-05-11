#!/bin/bash
# ======================================
#  🚀 1DAL 원클릭 자동 배포 스크립트
#  사용법: ./deploy-auto.sh
# ======================================

EC2_IP="44.222.73.86"
EC2_USER="ubuntu"
PEM_KEY=".github/1dal.pem"

echo "======================================"
echo "  🚀 1DAL 원클릭 자동 배포"
echo "  대상: $EC2_USER@$EC2_IP"
echo "======================================"

# PEM 키 권한 설정
chmod 400 "$PEM_KEY" 2>/dev/null

echo ""
echo "서버 접속 후 배포 작업을 시작합니다..."
echo "빌드에 1~3분 정도 소요될 수 있습니다."
echo "======================================"

ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_IP" << 'EOF'
    set -e

    cd ~/onedal/onedal/onedal-web || { echo "❌ 경로를 찾을 수 없습니다"; exit 1; }

    echo "📥 [1/4] 최신 코드 Pull"
    git fetch --all
    git reset --hard origin/main
    git pull origin main

    # nvm 로드
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    echo "📦 [2/4] 패키지 설치"
    pnpm install
    pnpm rebuild better-sqlite3 esbuild

    echo "🔨 [3/4] 클라이언트 빌드"
    cd client-app && pnpm build && cd ..

    echo "🔄 [4/4] PM2 무중단 리로드"
    pm2 reload ecosystem.config.cjs --env production || {
        echo "⚠️ reload 실패 → 전체 재시작 (최초 배포 시)"
        pm2 delete all || true
        pm2 start ecosystem.config.cjs --env production
    }
    pm2 save

    echo "======================================"
    echo "✅ 배포 완료!"
EOF

echo ""
echo "🎉 배포가 끝났습니다. https://1dal.altari.com 에서 확인하세요!"
