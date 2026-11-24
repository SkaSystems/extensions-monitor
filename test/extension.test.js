const assert = require('assert');
const vscode = require('vscode');

suite('Extension Activation Suite', () => {
	test('extension is present', () => {
		const ext = vscode.extensions.getExtension('skanderturki.extensions-monitor');
		assert.ok(ext, 'extensions-monitor should be present');
	});

	test('listInstalledExtensions command is registered', async () => {
		const ext = vscode.extensions.getExtension('skanderturki.extensions-monitor');
		if (ext && !ext.isActive) {
			await ext.activate();
		}
		const commands = await vscode.commands.getCommands(true);
		assert.ok(
			commands.includes('extension.listInstalledExtensions'),
			'extension.listInstalledExtensions should be registered'
		);
	});
});
