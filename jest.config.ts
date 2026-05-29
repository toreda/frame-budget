import type {Config} from 'jest';

const config: Config = {
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	testMatch: ['**/*.spec.ts'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	// node16 module resolution requires `.js` extensions on relative imports
	// even from `.ts` sources; strip them so jest resolves to the `.ts` files.
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1'
	},
	transform: {
		'^.+\\.tsx?$': '@swc/jest',
		'^.+\\.m?js$': '@swc/jest'
	},
	transformIgnorePatterns: ['node_modules/(?!.*(@shaderfrog[/\\\\+]glsl-parser|woff2-encoder)[/\\\\])'],
	coverageDirectory: 'coverage',
	coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/tests/'],
	coverageReporters:
		process.env.COVERAGE === 'full' ? ['text', 'text-summary', 'lcov'] : ['text-summary', 'lcov'],
	coverageThreshold: {
		global: {
			branches: 50,
			functions: 50,
			lines: 40,
			statements: 30
		}
	}
};

export default config;
