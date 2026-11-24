const { isExtensionBanned } = require('./lib/matcher');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { checkCredentials, fetchRemoteConfig } = require('./password');
const { compareVersions, fetchLatestVersion } = require('./lib/selfUpdate');

const DEFAULTS = {
	POLL_INTERVAL_SECONDS: 15,
	UNLOCK_GRACE_SECONDS: 15,
	MAX_PASSWORD_ATTEMPTS: 5,
};

const REMOTE_REFRESH_MS = 60 * 60 * 1000; // 1 hour
const SELF_UPDATE_FIRST_CHECK_MS = 30 * 1000; // let VS Code finish starting up
const CACHED_REMOTE_KEY = 'cachedRemoteLists';
const SELF_ID = 'skanderturki.extensions-monitor';

// User settings forced while EXAM MODE is active. The student's own value is
// saved in globalState under prevKey and restored in LECTURE MODE.
//  - chat.disableAIFeatures: turns off built-in Copilot Chat and other built-in
//    AI features (built-ins cannot be uninstalled and ignore extensions.allowed).
//  - extensions.allowed: VS Code itself disables, and refuses to install, any
//    non-built-in extension mapped to false.
const ENFORCED = {
	aiFeatures: { section: 'chat', key: 'disableAIFeatures', prevKey: 'aiFeaturesPrevValue' },
	allowed: { section: 'extensions', key: 'allowed', prevKey: 'allowedExtensionsPrevValue' },
};

let lastUnlockTime = 0;
let statusBarItemLeft;
let statusBarItemRight;
let isExamModeActive = true;
let viewProviderInstance;
let extensionContext;
let logFilePath;
let remoteBlacklist = [];
let remoteWhitelist = [];
let pendingUpdateVersion = null;

const writeToLogFile = (filePath, message) => {
	if (!filePath) return;
	try {
		fs.appendFile(filePath, `${new Date().toISOString()} - ${message}\n`, (err) => {
			if (err) {
				console.error('Failed to write to log file:', err);
			}
		});
	} catch (error) {
		console.error('Failed to write to log file:', error);
	}
};

const logConfirmationExtensionIsInstalled = () => {
	if (vscode.extensions.all.some(ext => ext.id === SELF_ID)) {
		writeToLogFile(logFilePath, 'Extension extensions-monitor exists on your IDE');
	}
};

const getMonitorConfig = () => {
	const cfg = vscode.workspace.getConfiguration('extensionsMonitor');
	return {
		pollIntervalSeconds: cfg.get('pollIntervalSeconds', DEFAULTS.POLL_INTERVAL_SECONDS),
		unlockGraceSeconds: cfg.get('unlockGraceSeconds', DEFAULTS.UNLOCK_GRACE_SECONDS),
		maxPasswordAttempts: cfg.get('maxPasswordAttempts', DEFAULTS.MAX_PASSWORD_ATTEMPTS),
		logFilePath: cfg.get('logFilePath', ''),
	};
};

const resolveLogFilePath = (configuredPath) => {
	if (configuredPath && configuredPath.trim().length > 0) {
		return configuredPath;
	}
	const desktopDir = path.join(os.homedir(), 'Desktop', 'log');
	if (!fs.existsSync(desktopDir)) {
		try {
			fs.mkdirSync(desktopDir, { recursive: true });
		} catch (error) {
			console.error('Failed to create log directory:', error);
			return null;
		}
	}
	return path.join(desktopDir, 'extensions_log.txt');
};

const applyRemoteConfig = (config) => {
	if (!config) return false;
	isExamModeActive = config.isActive;
	remoteBlacklist = config.blacklist || [];
	remoteWhitelist = config.whitelist || [];
	if (extensionContext) {
		extensionContext.globalState.update(CACHED_REMOTE_KEY, {
			blacklist: remoteBlacklist,
			whitelist: remoteWhitelist,
		});
	}
	return true;
};

const loadCachedRemoteLists = () => {
	if (!extensionContext) return;
	const cached = extensionContext.globalState.get(CACHED_REMOTE_KEY);
	if (cached) {
		remoteBlacklist = Array.isArray(cached.blacklist) ? cached.blacklist : [];
		remoteWhitelist = Array.isArray(cached.whitelist) ? cached.whitelist : [];
	}
};

// Stable JSON for comparing setting values (object key order must not matter).
const stableStringify = (value) => {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return '{' + Object.keys(value).sort()
			.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
	}
	return JSON.stringify(value === undefined ? null : value);
};

/**
 * Force a user-level setting to `desired`. The student's original value is
 * saved once (null = was unset) so restoreSetting() can put it back.
 * Returns true if the setting was changed.
 */
const enforceSetting = async ({ section, key, prevKey }, desired, label) => {
	if (!extensionContext) return false;
	const cfg = vscode.workspace.getConfiguration(section);
	const inspected = cfg.inspect(key) || {};
	const userOk = stableStringify(inspected.globalValue) === stableStringify(desired);
	const workspaceOverride = inspected.workspaceValue !== undefined;
	if (userOk && !workspaceOverride) return false;

	if (extensionContext.globalState.get(prevKey) === undefined) {
		const prev = inspected.globalValue === undefined ? null : inspected.globalValue;
		await extensionContext.globalState.update(prevKey, prev);
	}
	try {
		if (!userOk) {
			await cfg.update(key, desired, vscode.ConfigurationTarget.Global);
		}
		// A workspace-level value would override the user setting.
		if (workspaceOverride) {
			await cfg.update(key, undefined, vscode.ConfigurationTarget.Workspace);
		}
		writeToLogFile(logFilePath, `${label}: ${section}.${key} enforced`);
		return true;
	} catch (e) {
		console.error(`Failed to enforce ${section}.${key}:`, e);
		writeToLogFile(logFilePath, `FAILED to enforce ${section}.${key}: ${e}`);
		return false;
	}
};

const restoreSetting = async ({ section, key, prevKey }) => {
	if (!extensionContext) return;
	const prev = extensionContext.globalState.get(prevKey);
	if (prev === undefined) return;
	try {
		await vscode.workspace
			.getConfiguration(section)
			.update(key, prev === null ? undefined : prev, vscode.ConfigurationTarget.Global);
		await extensionContext.globalState.update(prevKey, undefined);
		writeToLogFile(logFilePath, `${section}.${key} restored (lecture mode)`);
	} catch (e) {
		console.error(`Failed to restore ${section}.${key}:`, e);
	}
};

const getLocalLists = () => {
	const monitoredCfg = vscode.workspace.getConfiguration('monitoredExtensions');
	return {
		userBlocklist: monitoredCfg.get('blockedList', []),
		userWhitelist: monitoredCfg.get('whiteList', []),
	};
};

const isBuiltinExtension = (extension) => !!(extension.packageJSON && extension.packageJSON.isBuiltin === true);

/**
 * extensions.allowed value: everything allowed ("*": true) except ids from the
 * remote blacklist, the user blocklist, and installed extensions the matcher
 * flags (keyword detection). Whitelisted ids and the monitor itself are never
 * mapped to false. Keys are lower-cased, as VS Code matches them.
 */
const buildAllowedExtensionsValue = () => {
	const { userBlocklist, userWhitelist } = getLocalLists();
	const lower = (list) => list.filter(id => typeof id === 'string' && id.includes('.'))
		.map(id => id.trim().toLowerCase());
	const exempt = new Set([...lower(remoteWhitelist), ...lower(userWhitelist), SELF_ID]);

	const denied = new Set([...lower(remoteBlacklist), ...lower(userBlocklist)]);
	for (const extension of vscode.extensions.all) {
		if (!isBuiltinExtension(extension)
			&& isExtensionBanned(extension, userBlocklist, userWhitelist, remoteBlacklist, remoteWhitelist)) {
			denied.add(extension.id.toLowerCase());
		}
	}

	const value = { '*': true };
	for (const id of [...denied].sort()) {
		if (!exempt.has(id)) value[id] = false;
	}
	return value;
};

const enforceExamSettings = async () => {
	if (!isExamModeActive) return;
	await enforceSetting(ENFORCED.aiFeatures, true, 'Built-in AI features (Copilot Chat) disabled');
	const changed = await enforceSetting(ENFORCED.allowed, buildAllowedExtensionsValue(), 'Banned extensions disabled');

	// Banned extensions that are already running only stop after a window reload.
	if (changed) {
		const { userBlocklist, userWhitelist } = getLocalLists();
		const running = vscode.extensions.all.filter(ext => !isBuiltinExtension(ext)
			&& isExtensionBanned(ext, userBlocklist, userWhitelist, remoteBlacklist, remoteWhitelist));
		if (running.length > 0) {
			vscode.window.showWarningMessage(
				`Banned extensions were disabled (${running.map(e => e.id).join(', ')}). Reload VS Code to finish.`,
				'Reload Window'
			).then(choice => {
				if (choice === 'Reload Window') vscode.commands.executeCommand('workbench.action.reloadWindow');
			});
		}
	}
};

const restoreExamSettings = async () => {
	await restoreSetting(ENFORCED.aiFeatures);
	await restoreSetting(ENFORCED.allowed);
};

/**
 * Install a newer published version of the monitor, so students are updated
 * even if they turned extension auto-update off. Uses VS Code's own install
 * command, which upgrades in place; the new version runs after a reload.
 * Skipped in development and test runs.
 */
const checkForSelfUpdate = async () => {
	if (!extensionContext || extensionContext.extensionMode !== vscode.ExtensionMode.Production) return;
	if (pendingUpdateVersion) return;

	const current = extensionContext.extension.packageJSON.version;
	const latest = await fetchLatestVersion(SELF_ID);
	if (!latest || compareVersions(latest, current) <= 0) return;

	try {
		writeToLogFile(logFilePath, `Updating extensions-monitor ${current} -> ${latest}`);
		await vscode.commands.executeCommand('workbench.extensions.installExtension', SELF_ID);
		pendingUpdateVersion = latest;
		writeToLogFile(logFilePath, `extensions-monitor ${latest} installed; active after reload`);
		vscode.window.showInformationMessage(
			`Extensions Monitor was updated to ${latest}. Reload VS Code to use the new version.`,
			'Reload Window'
		).then(choice => {
			if (choice === 'Reload Window') vscode.commands.executeCommand('workbench.action.reloadWindow');
		});
	} catch (e) {
		console.error('Self-update failed:', e);
		writeToLogFile(logFilePath, `extensions-monitor self-update to ${latest} FAILED: ${e}`);
	}
};

const checkExtensions = () => {
	enforceExamSettings();
	checkBlockedExtensions();
	logConfirmationExtensionIsInstalled();
};

const checkBlockedExtensions = () => {
	if (!isExamModeActive) {
		return;
	}

	if (!extensionContext) {
		return;
	}

	const isCurrentlyBlocked = extensionContext.globalState.get('isCurrentlyBlocked');
	if (isCurrentlyBlocked) {
		return;
	}

	const { unlockGraceSeconds } = getMonitorConfig();
	if (Date.now() - lastUnlockTime < unlockGraceSeconds * 1000) {
		return;
	}

	const { userBlocklist, userWhitelist } = getLocalLists();

	try {
		for (const extension of vscode.extensions.all) {
			if (isExtensionBanned(extension, userBlocklist, userWhitelist, remoteBlacklist, remoteWhitelist)) {
				extensionContext.globalState.update('isCurrentlyBlocked', true);
				promptForPassword(extension.id, isBuiltinExtension(extension));
				return;
			}
		}
	} catch (e) {
		console.error('checkBlockedExtensions failed:', e);
	}
};

function updateUIForMode(isActive) {
	if (isActive) {
		statusBarItemLeft.text = '$(shield) EXAM MODE - Monitor Active';
		statusBarItemLeft.tooltip = 'Extensions Monitor is active - AI extensions are blocked';
		statusBarItemLeft.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		statusBarItemLeft.show();

		statusBarItemRight.text = '$(eye) MONITORED';
		statusBarItemRight.tooltip = 'This VSCode instance is being monitored for AI extensions';
		statusBarItemRight.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		statusBarItemRight.show();
	} else {
		statusBarItemLeft.text = '$(book) LECTURE MODE';
		statusBarItemLeft.tooltip = 'Extensions Monitor is in lecture mode - AI extensions allowed';
		statusBarItemLeft.backgroundColor = undefined;
		statusBarItemLeft.show();

		statusBarItemRight.hide();
	}

	if (viewProviderInstance && viewProviderInstance._view) {
		viewProviderInstance.updateContent(isActive);
	}
}

async function showInstalledExtensionsPick() {
	const userBlocklist = vscode.workspace
		.getConfiguration('monitoredExtensions')
		.get('blockedList', []);
	const userWhitelist = vscode.workspace
		.getConfiguration('monitoredExtensions')
		.get('whiteList', []);
	const remoteWhitelistLower = remoteWhitelist.map(id => String(id).toLowerCase());

	const items = vscode.extensions.all.map(ext => {
		const idLower = ext.id.toLowerCase();
		const banned = isExtensionBanned(ext, userBlocklist, userWhitelist, remoteBlacklist, remoteWhitelist);
		const whitelisted = remoteWhitelistLower.includes(idLower)
			|| userWhitelist.some(id => typeof id === 'string' && id.toLowerCase() === idLower);

		let badge;
		if (banned) badge = '$(error) BANNED';
		else if (whitelisted) badge = '$(check) ALLOWED';
		else badge = '$(circle-outline) NEUTRAL';

		return {
			label: ext.id,
			description: badge,
			detail: (ext.packageJSON && ext.packageJSON.displayName) || '',
		};
	});

	await vscode.window.showQuickPick(items, {
		title: `Installed extensions (${items.length})`,
		placeHolder: 'Filter installed extensions…',
		matchOnDescription: true,
		matchOnDetail: true,
	});
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	extensionContext = context;

	statusBarItemLeft = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItemLeft.text = '$(sync~spin) Checking...';
	statusBarItemLeft.tooltip = 'Checking extension monitor status...';
	statusBarItemLeft.show();
	context.subscriptions.push(statusBarItemLeft);

	statusBarItemRight = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	context.subscriptions.push(statusBarItemRight);

	viewProviderInstance = new MyViewProvider(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('extensions-monitor-view', viewProviderInstance)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('extension.listInstalledExtensions', showInstalledExtensionsPick)
	);

	const cfg = getMonitorConfig();
	logFilePath = resolveLogFilePath(cfg.logFilePath);
	context.globalState.update('isCurrentlyBlocked', false);

	// Seed the in-memory lists from the last-known cache before the first fetch returns.
	loadCachedRemoteLists();

	fetchRemoteConfig()
		.then(config => {
			if (config) {
				applyRemoteConfig(config);
				updateUIForMode(config.isActive);
				if (config.isActive) {
					writeToLogFile(logFilePath, 'EXAM MODE activated');
					checkExtensions();
				} else {
					writeToLogFile(logFilePath, 'LECTURE MODE - monitoring disabled');
					restoreExamSettings();
				}
			} else {
				// Network failure: fail-safe to exam mode, keep cached lists already loaded above.
				isExamModeActive = true;
				updateUIForMode(true);
				writeToLogFile(logFilePath, 'EXAM MODE activated (remote unreachable, using cached lists)');
				checkExtensions();
			}
		});

	const pollInterval = setInterval(checkExtensions, cfg.pollIntervalSeconds * 1000);
	context.subscriptions.push({
		dispose: () => clearInterval(pollInterval),
	});

	const firstUpdateCheck = setTimeout(checkForSelfUpdate, SELF_UPDATE_FIRST_CHECK_MS);
	context.subscriptions.push({ dispose: () => clearTimeout(firstUpdateCheck) });

	const refreshInterval = setInterval(() => {
		checkForSelfUpdate();
		fetchRemoteConfig().then(config => {
			if (!config) return;
			const wasActive = isExamModeActive;
			applyRemoteConfig(config);
			if (wasActive !== isExamModeActive) {
				updateUIForMode(isExamModeActive);
				if (isExamModeActive) enforceExamSettings();
				else restoreExamSettings();
				writeToLogFile(
					logFilePath,
					isExamModeActive ? 'Mode changed to EXAM MODE' : 'Mode changed to LECTURE MODE'
				);
			}
		});
	}, REMOTE_REFRESH_MS);
	context.subscriptions.push({
		dispose: () => clearInterval(refreshInterval),
	});

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			const watched = [...Object.values(ENFORCED).map(({ section, key }) => `${section}.${key}`), 'monitoredExtensions'];
			if (isExamModeActive && watched.some(name => event.affectsConfiguration(name))) {
				// No-op when values already match, so the monitor's own writes don't loop.
				enforceExamSettings();
			}
			if (event.affectsConfiguration('extensionsMonitor.logFilePath')) {
				logFilePath = resolveLogFilePath(getMonitorConfig().logFilePath);
			}
		})
	);
}

function deactivate() {
	if (statusBarItemLeft) statusBarItemLeft.dispose();
	if (statusBarItemRight) statusBarItemRight.dispose();
}

async function promptForPassword(extensionID, isBuiltin = false) {
	const action = isBuiltin
		? 'is built into VSCode and must be disabled (Extensions view > Built-in > Disable)'
		: 'is a banned extension and should be removed from your IDE';
	const { maxPasswordAttempts } = getMonitorConfig();

	for (let attempt = 0; attempt < maxPasswordAttempts; attempt++) {
		const value = await vscode.window.showInputBox({
			title: `WARNING: ${extensionID} ${action}`,
			prompt: `You have installed extensions that are not allowed: ${extensionID}. Please request from your instructor to unblock VSCode.`,
			password: true,
			placeHolder: 'email#password',
			ignoreFocusOut: true,
		});

		if (!value) {
			vscode.window.showErrorMessage('Missing credentials. Access denied.');
			continue;
		}

		const hashIndex = value.indexOf('#');
		const email = hashIndex >= 0 ? value.substring(0, hashIndex) : '';
		const password = hashIndex >= 0 ? value.substring(hashIndex + 1) : '';

		if (!email || !password) {
			vscode.window.showErrorMessage('Missing credentials. Access denied.');
			continue;
		}

		try {
			const check = await checkCredentials(email, password);
			const isAuthenticated = check.authenticated === true || check.authenticated === 1 || check.success === true;
			const isValid = check.validity === true || check.validity === 1 || check.valid === true || check.validity === undefined;

			if (isAuthenticated && isValid) {
				vscode.window.showInformationMessage('Password correct, access granted!');
				if (extensionContext) {
					extensionContext.globalState.update('isCurrentlyBlocked', false);
				}
				lastUnlockTime = Date.now();
				return;
			}
			vscode.window.showErrorMessage('Invalid credentials. Access denied.');
		} catch (err) {
			vscode.window.showErrorMessage(typeof err === 'string' ? err : 'Credential check failed.');
		}
	}

	writeToLogFile(logFilePath, `Password prompt failed ${maxPasswordAttempts} times for banned extension ${extensionID}`);
	// Clear the flag so the next poll re-prompts. Previously it stayed true and
	// silenced the monitor for the rest of the session.
	if (extensionContext) {
		await extensionContext.globalState.update('isCurrentlyBlocked', false);
	}
	vscode.window.showErrorMessage(
		`Maximum password attempts (${maxPasswordAttempts}) reached. IDE remains blocked until the next check.`
	);
}

class MyViewProvider {
	constructor(context) {
		this._context = context;
		this._examHtml = this._readView('exam.html');
		this._lectureHtml = this._readView('lecture.html');
	}

	_readView(name) {
		try {
			return fs.readFileSync(path.join(this._context.extensionPath, 'media', 'views', name), 'utf8');
		} catch (error) {
			console.error(`Failed to read view ${name}:`, error);
			return `<html><body><h1>${name}</h1></body></html>`;
		}
	}

	resolveWebviewView(webviewView) {
		this._view = webviewView;
		webviewView.webview.options = { enableScripts: true };
		this.updateContent(isExamModeActive);
	}

	updateContent(isActive) {
		if (!this._view) return;

		if (isActive) {
			this._view.badge = { value: 1, tooltip: 'EXAM MODE - AI extensions blocked' };
			this._view.webview.html = this._examHtml;
		} else {
			this._view.badge = { value: 0, tooltip: 'Lecture Mode - AI extensions allowed' };
			this._view.webview.html = this._lectureHtml;
		}
	}
}

module.exports = {
	activate,
	deactivate,
	// Internals exposed for the integration tests only.
	__test: {
		enforceSetting, restoreSetting, restoreExamSettings, buildAllowedExtensionsValue, ENFORCED,
		setExamMode: (active) => { isExamModeActive = active; },
	},
};
