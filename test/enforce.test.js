const assert = require('assert');
const vscode = require('vscode');

const getApi = async () => {
	const ext = vscode.extensions.getExtension('skanderturki.extensions-monitor');
	if (!ext.isActive) await ext.activate();
	return require('../extension').__test;
};

suite('Exam settings enforcement Suite', () => {
	suiteSetup(async function () {
		this.timeout(15000);
		// Stop the live monitor from reverting the test's own writes, and undo
		// whatever it enforced at activation.
		const api = await getApi();
		api.setExamMode(false);
		await api.restoreExamSettings();
	});

	test('extensions.allowed can be enforced and the original value restored', async () => {
		const { enforceSetting, restoreSetting, ENFORCED } = await getApi();
		const cfg = () => vscode.workspace.getConfiguration('extensions');
		const original = { '*': true, 'some.other': false };
		await cfg().update('allowed', original, vscode.ConfigurationTarget.Global);

		const desired = { '*': true, 'github.copilot': false };
		assert.strictEqual(await enforceSetting(ENFORCED.allowed, desired, 'test'), true);
		assert.deepStrictEqual(cfg().inspect('allowed').globalValue, desired);
		// Second call is a no-op: no write loop with the config-change listener.
		assert.strictEqual(await enforceSetting(ENFORCED.allowed, { 'github.copilot': false, '*': true }, 'test'), false);

		await restoreSetting(ENFORCED.allowed);
		assert.deepStrictEqual(cfg().inspect('allowed').globalValue, original);
		await cfg().update('allowed', undefined, vscode.ConfigurationTarget.Global);
	});

	test('chat.disableAIFeatures is enforced and restored to unset', async () => {
		const { enforceSetting, restoreSetting, ENFORCED } = await getApi();
		const cfg = () => vscode.workspace.getConfiguration('chat');
		await cfg().update('disableAIFeatures', undefined, vscode.ConfigurationTarget.Global);

		await enforceSetting(ENFORCED.aiFeatures, true, 'test');
		assert.strictEqual(cfg().get('disableAIFeatures'), true);

		await restoreSetting(ENFORCED.aiFeatures);
		assert.strictEqual(cfg().inspect('disableAIFeatures').globalValue, undefined);
	});

	test('allowed value never denies the monitor itself or whitelisted ids', async () => {
		const { buildAllowedExtensionsValue } = await getApi();
		const value = buildAllowedExtensionsValue();
		assert.strictEqual(value['*'], true);
		assert.notStrictEqual(value['skanderturki.extensions-monitor'], false);
		assert.ok(Object.keys(value).every(k => k === k.toLowerCase()));
	});
});
