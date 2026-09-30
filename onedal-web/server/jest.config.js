const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  // @turf/turf 는 node_modules 안에 **TypeScript 원본**을 그대로 담고 있다.
  // jest 는 기본으로 node_modules 를 변환하지 않으므로 지리 테스트가 파싱 단계에서 죽는다.
  // (`tsx`/`tsc` 는 잘 도는데 jest 만 못 읽어서 원인을 찾는 데 시간이 걸렸다)
  transformIgnorePatterns: ["node_modules/(?!.*@turf)"],
  // 🧪 검사는 일꾼마다 빈 DB(jest-w<번호>.db) — 기사님 로컬 서버(4000)의 local.db 에 쓰고 지우지 않는다 (tests/rules/jestDbIsolated.test.ts)
  setupFiles: ["<rootDir>/tests/jestWorkerDb.js"],
  globalSetup: "<rootDir>/tests/jestDbFiles.js",
  globalTeardown: "<rootDir>/tests/jestDbFiles.js",
};