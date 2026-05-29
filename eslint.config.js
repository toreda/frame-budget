const toreda = require('@toreda/eslint-config');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
	{ignores: ['dist/**']},
	...toreda,
	{
		files: ['src/**/*.ts'],
		rules: {
			'@typescript-eslint/explicit-function-return-type': ['warn', {allowExpressions: true}],
			'@typescript-eslint/no-explicit-any': 'off'
		}
	}
];
