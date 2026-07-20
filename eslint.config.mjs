// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: ['dist/**', 'coverage/**', '.angular/**', 'node_modules/**']
    },
    {
        files: ['**/*.ts'],
        extends: [
            eslint.configs.recommended,
            ...tseslint.configs.recommendedTypeChecked,
            ...angular.configs.tsRecommended,
            eslintConfigPrettier
        ],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        processor: angular.processInlineTemplates,
        rules: {
            '@angular-eslint/directive-selector': [
                'error',
                { type: 'attribute', prefix: 'app', style: 'camelCase' }
            ],
            '@angular-eslint/component-selector': [
                'error',
                { type: 'element', prefix: 'app', style: 'kebab-case' }
            ],
            // Bugs & unsafe patterns
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'off', // noisy without full strict mode
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            eqeqeq: ['error', 'smart'],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-debugger': 'error',
            // Type-checked rules that tend to be noisy in DOM/template-adjacent code
            '@typescript-eslint/no-unsafe-argument': 'warn',
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/restrict-template-expressions': 'off',
            // No raw DOM writes / sanitizer bypasses -- Angular's own bindings (interpolation,
            // property binding) already escape everything; reaching around them is exactly how
            // XSS gets in. See docs/api-and-signalr-commands.md's chat command for why this
            // matters here (user-authored chat text flows straight into templates).
            'no-restricted-syntax': [
                'error',
                {
                    selector: "AssignmentExpression[left.property.name='innerHTML']",
                    message:
                        'Do not assign innerHTML directly -- this bypasses Angular sanitization. Use interpolation ({{ }}) or a property binding instead.'
                },
                {
                    selector: "AssignmentExpression[left.property.name='outerHTML']",
                    message:
                        'Do not assign outerHTML directly -- this bypasses Angular sanitization.'
                },
                {
                    selector:
                        'CallExpression[callee.property.name=/^bypassSecurityTrust(Html|Script|Style|Url|ResourceUrl)$/]',
                    message:
                        "DomSanitizer.bypassSecurityTrust* disables Angular's XSS protection -- avoid it; if truly unavoidable, get explicit sign-off and add a comment justifying the trusted source."
                },
                {
                    selector:
                        "CallExpression[callee.object.name='document'][callee.property.name='write']",
                    message:
                        'document.write is a raw-DOM injection vector -- use Angular templates/bindings instead.'
                },
                {
                    selector: "CallExpression[callee.name='eval']",
                    message: 'eval() is disallowed.'
                },
                {
                    selector: "NewExpression[callee.name='Function']",
                    message: 'new Function(...) is disallowed -- same risk class as eval().'
                }
            ]
        }
    },
    {
        files: ['**/*.html'],
        extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
        rules: {
            '@angular-eslint/template/click-events-have-key-events': 'off',
            '@angular-eslint/template/interactive-supports-focus': 'off',
            // [outerHTML] bindings skip Angular's sanitizer the same way a raw DOM write does.
            '@angular-eslint/template/no-outerhtml': 'error'
        }
    },
    {
        files: ['**/*.spec.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off'
        }
    }
);
