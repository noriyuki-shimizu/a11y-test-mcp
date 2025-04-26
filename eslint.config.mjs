// @ts-check
import gitignore from 'eslint-config-flat-gitignore'
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { globalIgnores } from "eslint/config"

export default tseslint.config(
  gitignore(),
  eslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  globalIgnores(["**/*.mjs", "**/*.cjs", "**/*.js"]),
);
