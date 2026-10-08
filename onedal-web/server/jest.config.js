const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  // 🧪 형 검사를 늘 새로 — ts-jest 는 검사 파일이 안 바뀌면 저장해 둔 형 검사 결과를 다시 써서, shared 타입만 바뀐 날 `@ts-expect-error` · `Pick<…>` 타입 검사가 초록으로 남는다
  cache: false,
  transform: {
    ...tsJestTransformCfg,
  },
  // @turf/turf 는 node_modules 안에 **TypeScript 원본**을 그대로 담고 있다.
  // jest 는 기본으로 node_modules 를 변환하지 않으므로 지리 테스트가 파싱 단계에서 죽는다.
  // (`tsx`/`tsc` 는 잘 도는데 jest 만 못 읽어서 원인을 찾는 데 시간이 걸렸다)
  transformIgnorePatterns: ["node_modules/(?!.*@turf)"],
  // 🧪 검사는 돌림 · 일꾼마다 빈 DB(jest-r<돌림>-w<번호>.db) — 기사님 로컬 서버(4000)의 local.db 에 쓰고 지우지 않는다 (tests/rules/jestDbIsolated.test.ts)
  setupFiles: ["<rootDir>/tests/jestWorkerDb.js"],
  globalSetup: "<rootDir>/tests/jestDbFiles.js",
  globalTeardown: "<rootDir>/tests/jestDbFiles.js",
};