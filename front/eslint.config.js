// eslint.config.js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
// ייבוא תוסף הטיפוסים הרשמי של TypeScript
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // 1. שינוי קריטי: האזנה לקבצי ts ו-tsx בנוסף ל-js ו-jsx
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      // 2. החלת חוקי ה-Recommended של TypeScript
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      // 3. הגדרת ה-Parser שמתרגם את קוד ה-TS עבור הלינטר
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // כאן תוכל להשקיט אזהרות קומפילציה זמניות אם תרצה, למשל:
      '@typescript-eslint/no-explicit-any': 'off', // מאפשר להשתמש ב-any בלי לקבל שגיאה חוסמת
    }
  },
])