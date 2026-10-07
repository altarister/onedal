#!/usr/bin/env bash
# 🚀 실서버 배포 순서 — .github/workflows/deploy.yml 이 EC2 의 onedal-web 폴더에서 이 파일의 «새 판»을 임시 파일로 꺼내 부른다.
# 무엇을: DB 백업 → 새 코드 → 설치 → 관제웹 · 운영센터를 새 폴더에 빌드해 바꿔 끼움 → 서버 다시 띄움 → 살아났나 확인.
# 🔴 어디서 실패하든 시작할 때의 판(PREV)으로 코드 · 화면 폴더를 되돌리고 서버를 다시 띄운다 — 하얀 화면 · 꺼진 채로 남지 않게.
# DB 는 되돌리지 않는다(그 사이 운행 기록이 사라짐) — 백업만 남기고 복원은 사람 손.
# 검사: server/tests/rules/deployScript.test.ts 가 가짜 pm2 · pnpm · curl 로 이 파일을 실제로 돌린다.

set -u
cd "${DEPLOY_DIR:-$PWD}" || exit 1
HEALTH_URL="${DEPLOY_HEALTH_URL:-localhost:4000/api/health}"
HEALTH_TRIES="${DEPLOY_HEALTH_TRIES:-15}"
HEALTH_WAIT="${DEPLOY_HEALTH_WAIT:-2}"
BUSY_URL="${DEPLOY_BUSY_URL:-localhost:4000/api/health/busy}"
BUSY_EVERY="${DEPLOY_BUSY_EVERY:-60}"     # 초 — 운행 중이면 이만큼 뒤 다시 묻는다
BUSY_MAX="${DEPLOY_BUSY_MAX:-14400}"      # 초 — 4시간 넘게 운행 중이면 멈춘다(빨간불)

PREV=$(git rev-parse HEAD)
CLIENT_SWAPPED=0
OPS_SWAPPED=0

health_ok() {
    for _ in $(seq 1 "$HEALTH_TRIES"); do
        if curl -sf "$HEALTH_URL" > /dev/null; then return 0; fi
        sleep "$HEALTH_WAIT"
    done
    return 1
}

restart_server() {
    if pm2 describe onedal-web-server > /dev/null 2>&1; then
        # 🕐 --update-env — 없으면 떠 있는 프로세스가 옛 env(TZ 없음)를 쥘 수 있다
        pm2 reload ecosystem.config.cjs --env production --update-env
    else
        pm2 start ecosystem.config.cjs --env production
    fi
    pm2 save
}

# 바꿔 끼운 화면 폴더를 옛것으로 되돌린다 (dist.old 가 옛 판이다)
unswap() {
    local app=$1
    if [ -d "$app/dist.old" ]; then
        rm -rf "$app/dist.bad"
        [ -d "$app/dist" ] && mv "$app/dist" "$app/dist.bad"
        mv "$app/dist.old" "$app/dist"
    fi
}

# 🔙 어디서 실패하든 여기 한 곳 — 코드 · 화면 폴더를 PREV 로, 서버를 다시 띄우고 살아났는지 본다. 배포는 실패로 끝난다
fail() {
    echo "❌ [$1] 실패 — 시작할 때의 판(${PREV:0:8})으로 되돌린다"
    git reset --hard "$PREV"
    pnpm install || echo "⚠️ 되돌린 판의 설치도 실패했다"
    [ "$CLIENT_SWAPPED" = 1 ] && unswap client-app
    [ "$OPS_SWAPPED" = 1 ] && unswap ops
    if [ "${SERVER_TOUCHED:-0}" = 1 ]; then
        restart_server
        if health_ok; then
            echo "✅ 되돌림 성공 — 옛 판 서버가 답한다"
        else
            echo "🚨 되돌림도 실패 — 옛 판 서버도 답하지 않는다. 아래는 마지막 로그다"
            pm2 status || true
            pm2 logs --lines 40 --nostream || true
        fi
    else
        echo "ℹ️ 서버는 건드리기 전이었다 — 옛 판이 그대로 돈다"
    fi
    exit 1
}

# 🚦 운행 중이면 기다린다 — 다시 뜨면 결재 기다림 · 심사 중 · 안전취소 타이머가 사라진다(서버 메모리). 코드를 갈아 끼우기 **전에** 묻는다.
#    서버가 답하지 않으면(죽어 있음) 기다릴 것이 없으니 그대로 간다 · 수동 실행의 «운행 중이어도 올림»(DEPLOY_FORCE=true)이면 묻지 않는다
if [ "${DEPLOY_FORCE:-false}" = true ]; then
    echo "⚠️ 운행 중이어도 올림 — 수동 실행에서 체크했다"
else
    waited=0
    while true; do
        ans=$(curl -sf "$BUSY_URL") || { echo "ℹ️ 서버가 운행 여부에 답하지 않는다 — 기다리지 않고 배포"; break; }
        echo "$ans" | grep -q '"busy":true' || break
        if [ "$waited" -ge "$BUSY_MAX" ]; then
            echo "❌ $((BUSY_MAX / 3600))시간 넘게 운행 중 — 배포를 멈춘다(옛 판 그대로) · 운행이 끝난 뒤 GitHub 에서 다시 실행: $ans"
            exit 1
        fi
        echo "🚦 운행 중이라 기다림 — $ans · ${waited}초 지남"
        sleep "$BUSY_EVERY"
        waited=$((waited + BUSY_EVERY))
    done
fi

# 💾 [0/5] 코드를 갈아끼우기 **전에** DB 를 뜬다 — WAL 모드라 세 파일을 같이 뜬다(본체만 뜨면 최근 기록이 빠진다) · 최근 5벌
echo "💾 [0/5] 배포 전 DB 백업"
if [ -f server/data.db ]; then
    TS=$(date +%Y%m%d-%H%M%S)
    for f in data.db data.db-wal data.db-shm; do
        [ -f "server/$f" ] && cp -a "server/$f" "server/$f.backup-$TS"
    done
    ls -1t server/data.db.backup-* | tail -n +6 | xargs -r rm -f
    ls -1t server/data.db-wal.backup-* 2>/dev/null | tail -n +6 | xargs -r rm -f
    ls -1t server/data.db-shm.backup-* 2>/dev/null | tail -n +6 | xargs -r rm -f
else
    echo "ℹ️ data.db 가 없습니다 — 첫 배포이거나 이미 지운 상태"
fi

echo "🚀 [1/5] 최신 코드 가져오기 (되돌릴 판: ${PREV:0:8})"
git fetch --all || fail "코드 가져오기"
git reset --hard origin/main || fail "코드 갈아 끼우기"

# 💾 가상 메모리 — 파일이 있는가가 아니라 «켜져 있는가»를 본다(재부팅하면 파일은 남고 swapon 은 풀린다 → 빌드가 메모리 부족으로 죽는다)
echo "💾 [1.5/5] 가상 메모리(Swap 2GB)"
if ! swapon --show | grep -q .; then
    if [ ! -f /swapfile ]; then
        sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile
    fi
    sudo swapon /swapfile || true
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
free -h || true

# 🔌 있으면 두고 없을 때만 넣는다 (80 → 4000)
echo "🔌 [1.6/5] 포트포워딩"
sudo iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 4000 2>/dev/null \
    || sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 4000 || true

echo "📦 [2/5] 패키지 설치"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
pnpm install || fail "패키지 설치"
pnpm rebuild better-sqlite3 esbuild || fail "네이티브 다시 빌드"

# 🔨 새 폴더(dist.new)에 빌드하고 성공해야만 바꿔 끼운다 — vite 는 시작할 때 출력 폴더를 비우므로, dist 에 바로 빌드하다 죽으면 실서버가 하얀 화면이 된다
# 🔴 서브셸로 들어간다 — 괄호 안의 cd 는 밖으로 새지 않는다(실패가 작업 폴더를 오염시킨 사고의 구조적 막음)
build_into_new() {
    ( cd "$1" && rm -rf dist.new && pnpm exec tsc -b && pnpm exec vite build --outDir dist.new --emptyOutDir )
}
swap_in() {
    rm -rf "$1/dist.old"
    [ -d "$1/dist" ] && mv "$1/dist" "$1/dist.old"
    mv "$1/dist.new" "$1/dist"
}

echo "🔨 [3/5] 관제웹 빌드"
build_into_new client-app || fail "관제웹 빌드"
swap_in client-app && CLIENT_SWAPPED=1

# 🏢 운영센터 — 실패해도 배포를 멈추지 않는다(운영센터 때문에 관제 서버가 안 뜨면 본말전도) · 실패하면 옛 화면 폴더가 그대로 남는다
echo "🏢 [3.4/5] 운영센터 빌드"
if build_into_new ops; then swap_in ops && OPS_SWAPPED=1; else echo "⚠️ 운영센터 빌드 실패 — 옛 화면 그대로 (관제 서버는 배포)"; fi

# 🎯 리허설 배차망(onedal-sim · 별도 워크스페이스) — 실패해도 계속 · 서버는 dist 가 없으면 건너뛴다
echo "🎯 [3.5/5] 리허설 배차망 빌드"
( cd ../onedal-sim && pnpm install && pnpm build ) || echo "⚠️ 리허설 배차망 빌드 실패 — 건너뜁니다"

# 🔴 `pm2 delete all` 을 하지 않는다 — 띄우지 못할 상황이면 옛것이 계속 도는 편이 낫다
# 다시 띄움 — 한 대(fork)라 몇 초 끊긴다(«무중단»이 아니다)
echo "🔄 [4/5] 서버 다시 띄우기"
SERVER_TOUCHED=1
restart_server || fail "서버 다시 띄우기"

# 🩺 «배포 완료»는 echo 가 아니라 서버가 말해야 한다 — 마지막 명령의 종료 코드가 배포의 성패다
echo "🩺 [5/5] 살아났는지 확인"
health_ok || fail "새 서버가 답하지 않음"
echo "✅ 배포 완료 — 서버 응답:"
curl -s "$HEALTH_URL"
rm -rf client-app/dist.old ops/dist.old client-app/dist.bad ops/dist.bad
exit 0
