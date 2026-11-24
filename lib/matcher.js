const DESCRIPTION_KEYWORDS = [
	'copilot', 'chatgpt', 'gemini', 'openai', 'llama', 'claude', 'anthropic',
	'codeium', 'tabnine', 'cody', 'amazon-q', 'codewhisperer', 'supermaven',
	'codegee', 'phind', 'gpt-4', 'gpt4', 'gpt-3', 'gpt3', 'ai-assist',
	'code-ai', 'aicode', 'ollama', 'mistral', 'codestral', 'huggingface', 'bard',
];

const ID_KEYWORDS = [
	'copilot', 'chatgpt', 'gemini', 'openai', 'llama', 'claude', 'anthropic',
	'codeium', 'tabnine', 'cody', 'amazonq', 'codewhisperer', 'supermaven',
	'codegee', 'phind', 'ai-code', 'aicode', 'ollama', 'mistral', 'codestral',
	'huggingface', 'bard', 'cline', 'aider', 'refact', 'continue',
];

function matchesId(list, id) {
	return list.some(entry => typeof entry === 'string' && entry.toLowerCase() === id);
}

function isExtensionBanned(
	extension,
	userBlocklist = [],
	userWhitelist = [],
	remoteBlacklist = [],
	remoteWhitelist = []
) {
	if (!extension || !extension.id) return false;

	const id = extension.id.toLowerCase();

	if (id.startsWith('vscode.') || id.startsWith('ms-vscode.')) {
		return false;
	}
	if (matchesId(remoteWhitelist, id)) return false;
	if (matchesId(userWhitelist, id)) return false;

	if (matchesId(remoteBlacklist, id)) return true;
	if (matchesId(userBlocklist, id)) return true;

	const description = (extension.packageJSON && extension.packageJSON.description) || '';
	const descriptionLower = description.toLowerCase();

	if (DESCRIPTION_KEYWORDS.some(k => descriptionLower.includes(k))) {
		return true;
	}

	if (ID_KEYWORDS.some(k => id.includes(k))) {
		return true;
	}

	return false;
}

module.exports = { isExtensionBanned, DESCRIPTION_KEYWORDS, ID_KEYWORDS };
