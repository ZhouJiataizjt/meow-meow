// ESLint 平面配置：主进程/测试代码按 CommonJS 检查
export default [
    {
        ignores: ['node_modules/**', 'build_output/**', 'src/frontend/vendor/**']
    },
    {
        files: ['src/**/*.js', 'test/**/*.js', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                console: 'readonly',
                process: 'readonly',
                fetch: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly'
            }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'none' }],
            'no-dupe-keys': 'error',
            'no-redeclare': 'error',
            'eqeqeq': ['warn', 'smart'],
            'prefer-const': 'warn'
        }
    }
]
