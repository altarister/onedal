import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * 🔴 **게이트에 들어가는 것은 `lint:gate` 하나다** (2026-09-05 신설).
 *
 * `eslint .` 는 지금 **오류 108건**이 묵어 있다. 그대로 커밋 게이트에 넣으면
 * 매번 빨간불이고, 빨간불이 늘 켜져 있으면 **아무도 안 본다**.
 * 그래서 `audit:dead` 를 들일 때와 같은 방식을 쓴다 — **하나씩 캐서 넣는다.**
 *
 * 지금 게이트가 잡는 것은 **하나**: 「선언 전에 쓴다」.
 * 2026-09-05 에 이것으로 화면이 두 번 하얘졌는데 `tsc` 도 검사 455건도 **전부
 * 통과했다.** 같은 스코프의 `const` 를 앞에서 읽는 것(TDZ)은 타입이 못 잡는다.
 * 실제로 재현해 확인했다 — 이 규칙은 그 모양을 정확히 짚는다.
 */
export const GATE_RULES = {
  '@typescript-eslint/no-use-before-define': ['error', {
    functions: false,        // 함수 선언은 끌어올려지므로 괜찮다
    classes: true,
    variables: true,         // ← 오늘 당한 것
    typedefs: false,
  }],
}

export default defineConfig([
  globalIgnores(['dist', 'android', 'ios']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: GATE_RULES,
  },
])
