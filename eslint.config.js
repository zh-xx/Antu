// ============================================================
//  eslint.config.js —— 静态检查
//
//  为什么需要它：`npm run build` **不做变量检查**。
//  实测过：往源码里加一行 `const x = notDefinedAnywhere + 1`，
//  构建照样通过，直到运行时模块求值才炸，表现为整页白屏。
//  这个项目已经因此白屏过两次（删函数时连带删掉 actorLinesOf；
//  current.path 在声明之前被引用）。所以这一层必须有。
//
//  规则只开最有用的几条，不做风格检查（缩进、引号之类不管，
//  免得满屏噪音把真问题淹掉）。
// ============================================================

import js from '@eslint/js'
import globals from 'globals'

/** 两边共用的规则。只挑真能防错的，不做风格检查。 */
const RULES = {
  // 这条就是防白屏的：引用了不存在的名字，构建期就报出来
  'no-undef': 'error',
  // 未使用的变量多半是重构留下的残渣
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  // 未使用的表达式通常是漏写了调用
  'no-unused-expressions': 'warn',
  // 不强制 `if` 一定要大括号，短判断写成一行更清楚
  curly: 'off',
  // 控制台输出里用全角空格对齐（中文宽度），是有意的
  'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
}

export default [
  js.configs.recommended,

  // 浏览器侧：src 下的源码
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: RULES,
  },

  // Node 侧：构建脚本与 MCP 服务端
  {
    files: ['tools/**/*.mjs', 'site/**/*.mjs', '*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: RULES,
  },

  // Home-page animation drafts (site/prototypes/hero): browser scripts that are joined into one page by build.mjs,
  // so the helpers that common.js defines are globals to the variant files
  {
    files: ['site/prototypes/hero/*.js'],
    ignores: ['site/prototypes/hero/common.js', 'site/prototypes/hero/lenses.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        H: 'readonly', $: 'readonly', $$: 'readonly', wait: 'readonly', stage: 'readonly', paper: 'readonly', idx: 'readonly',
        rel: 'readonly', reading: 'readonly', ending: 'readonly', scramble: 'readonly',
      },
    },
    rules: RULES,
  },

  {
    files: ['site/prototypes/hero/common.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.browser } },
    // what this file defines is used by the variant files, so it looks unused from here
    rules: { ...RULES, 'no-unused-vars': 'off' },
  },
  {
    // lenses.js stands on its own
    files: ['site/prototypes/hero/lenses.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.browser } },
    rules: RULES,
  },

  {
    // skills/ is generated (tools/build-skill.mjs); its scripts/antu.mjs is one bundled file
    ignores: ['dist/**', 'dist-engine/**', 'dist-cli/**', 'dist-mcp/**', 'dist-npm/**', 'dist-html/**', 'skills/**', 'node_modules/**'],
  },
]
