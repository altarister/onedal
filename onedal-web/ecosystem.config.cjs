module.exports = {
  apps: [
    {
      name: 'onedal-web-server',
      script: 'npx',
      args: 'tsx src/index.ts',
      interpreter: 'none',
      cwd: './server',
      instances: 1, // SQLite를 사용하므로 다중 노드(클러스터) 대신 단일 인스턴스로 실행
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        DB_FILE: 'data.db' // AWS에서 강제로 실데이터용 DB를 바라보도록 설정
      },
      env: {
        NODE_ENV: 'production',
        DB_FILE: 'data.db', // AWS에서 강제로 실데이터용 DB를 바라보도록 설정
        PORT: 4000 // 백엔드 포트 고정 (차후 AWS 서버에서 80포트를 4000으로 리다이렉트)
      }
    }
  ]
};
