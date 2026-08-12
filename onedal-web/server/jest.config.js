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
};