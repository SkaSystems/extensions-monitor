const assert = require('assert');
const { compareVersions } = require('../lib/selfUpdate');

suite('Self-update Suite', () => {
	test('newer patch, minor and major versions compare greater', () => {
		assert.ok(compareVersions('1.14.1', '1.14.0') > 0);
		assert.ok(compareVersions('1.15.0', '1.14.9') > 0);
		assert.ok(compareVersions('2.0.0', '1.99.99') > 0);
	});

	test('numeric, not string, comparison', () => {
		assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
	});

	test('equal and older versions do not trigger an update', () => {
		assert.strictEqual(compareVersions('1.14.0', '1.14.0'), 0);
		assert.ok(compareVersions('1.13.0', '1.14.0') < 0);
		assert.strictEqual(compareVersions('1.14', '1.14.0'), 0);
	});
});
