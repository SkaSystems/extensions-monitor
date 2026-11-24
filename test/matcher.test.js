const assert = require('assert');
const { isExtensionBanned } = require('../lib/matcher');

const fakeExt = (id, description = '') => ({
	id,
	packageJSON: { description },
});

suite('Matcher Suite', () => {
	test('id matching a remote blacklist entry is blocked', () => {
		assert.strictEqual(
			isExtensionBanned(fakeExt('vendor.tool'), [], [], ['vendor.tool']),
			true
		);
	});

	test('remote blacklist match is case-insensitive', () => {
		assert.strictEqual(
			isExtensionBanned(fakeExt('Vendor.Tool'), [], [], ['vendor.tool']),
			true
		);
	});

	test('user blocklist match is blocked', () => {
		assert.strictEqual(
			isExtensionBanned(fakeExt('some.random-ext'), ['some.random-ext']),
			true
		);
	});

	test('user blocklist match is case-insensitive', () => {
		assert.strictEqual(
			isExtensionBanned(fakeExt('Some.Random-Ext'), ['some.random-ext']),
			true
		);
	});

	test('description keyword match is blocked even without any list entry', () => {
		assert.strictEqual(
			isExtensionBanned(fakeExt('vendor.tool', 'An AI assistant powered by GPT-4')),
			true
		);
	});

	test('id keyword match (cline) is blocked', () => {
		assert.strictEqual(isExtensionBanned(fakeExt('someone.cline-helper')), true);
	});

	test('id keyword match (continue) is blocked', () => {
		assert.strictEqual(isExtensionBanned(fakeExt('vendor.continue-dev')), true);
	});

	test('neutral extension with no banned signals is allowed', () => {
		assert.strictEqual(
			isExtensionBanned(fakeExt('esbenp.prettier-vscode', 'Code formatter using prettier')),
			false
		);
	});

	test('missing packageJSON description does not throw', () => {
		assert.strictEqual(isExtensionBanned({ id: 'foo.bar' }), false);
	});

	test('null/undefined extension returns false', () => {
		assert.strictEqual(isExtensionBanned(null), false);
		assert.strictEqual(isExtensionBanned(undefined), false);
	});

	test('non-string entries in any list are ignored without throwing', () => {
		assert.strictEqual(
			isExtensionBanned(fakeExt('foo.bar'), [null, 123], [undefined], [null], [{}]),
			false
		);
	});

	test('remote whitelist exempts the monitor itself even when description matches a keyword', () => {
		assert.strictEqual(
			isExtensionBanned(
				fakeExt('skanderturki.extensions-monitor', 'Monitors and blocks AI-assisted coding extensions'),
				[], [], [], ['skanderturki.extensions-monitor']
			),
			false
		);
	});

	test('user whitelist exempts an extension that would otherwise match a keyword', () => {
		assert.strictEqual(
			isExtensionBanned(
				fakeExt('vendor.tool', 'GPT-4 powered helper'),
				[], ['vendor.tool']
			),
			false
		);
	});

	test('whitelist wins over blacklist when an id is in both lists', () => {
		assert.strictEqual(
			isExtensionBanned(
				fakeExt('vendor.tool'),
				[], [], ['vendor.tool'], ['vendor.tool']
			),
			false
		);
	});

	test('vscode.* built-in extensions are always allowed', () => {
		assert.strictEqual(
			isExtensionBanned(fakeExt('vscode.typescript-language-features', 'TypeScript and JavaScript language features for VS Code, including a Copilot-style chat')),
			false
		);
	});

	test('ms-vscode.* built-in extensions are always allowed', () => {
		assert.strictEqual(
			isExtensionBanned(fakeExt('ms-vscode.live-server', 'Microsoft Live Server')),
			false
		);
	});
});
