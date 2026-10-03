import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'data/**'],
  },
  {
    files: ['**/*.ts'],
    rules: {
      curly: ['error', 'all'],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: ['return', 'throw'] },
        {
          blankLine: 'always',
          prev: ['block-like', 'function', 'class'],
          next: '*',
        },
        {
          blankLine: 'always',
          prev: '*',
          next: ['block-like', 'function', 'class'],
        },
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
      ],
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'src/domain/**/*.ts',
      'src/ports/**/*.ts',
      'src/application/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['fastify', 'ws', '@libsql/client', 'drizzle-orm'],
          patterns: [
            {
              group: [
                '**/adapters/**',
                '**/bootstrap/**',
                '**/http/**',
                '**/realtime/**',
                '**/config/**',
                '@fastify/*',
                'drizzle-orm/*',
              ],
              message:
                'O núcleo depende de contratos, sem importar transporte, configuração ou infraestrutura.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/ports/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['fastify', 'ws', '@libsql/client', 'drizzle-orm'],
          patterns: [
            {
              group: [
                '**/adapters/**',
                '**/bootstrap/**',
                '**/http/**',
                '**/realtime/**',
                '**/config/**',
                '**/application/**',
                '@fastify/*',
                'drizzle-orm/*',
              ],
              message:
                'Domínio e contratos não dependem dos serviços de aplicação ou da infraestrutura.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/http/**/*.ts', 'src/realtime/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/bootstrap/**', '**/adapters/**'],
              message:
                'Injete serviços de aplicação; a montagem e os adaptadores pertencem ao bootstrap.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        URL: 'readonly',
      },
    },
  },
);
