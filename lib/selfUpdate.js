// Self-update support: find the latest published version of an extension on the
// VS Code Marketplace. Installing it is done by VS Code's own
// `workbench.extensions.installExtension` command, which upgrades an installed
// extension in place.

const GALLERY_QUERY_URL = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
const FILTER_EXTENSION_NAME = 7;
const FLAG_INCLUDE_VERSIONS = 0x1;
const FLAG_LATEST_VERSION_ONLY = 0x200;
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Compare two "x.y.z" version strings numerically.
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
function compareVersions(a, b) {
	const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
	const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] || 0) - (pb[i] || 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

/**
 * @param {string} extensionId e.g. "publisher.name"
 * @returns {Promise<string|null>} latest version, or null on any failure
 */
async function fetchLatestVersion(extensionId) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(GALLERY_QUERY_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json;api-version=3.0-preview.1',
			},
			body: JSON.stringify({
				filters: [{ criteria: [{ filterType: FILTER_EXTENSION_NAME, value: extensionId }] }],
				flags: FLAG_INCLUDE_VERSIONS | FLAG_LATEST_VERSION_ONLY,
			}),
			signal: controller.signal,
		});
		if (!response.ok) return null;
		const data = await response.json();
		const extension = data && data.results && data.results[0]
			&& data.results[0].extensions && data.results[0].extensions[0];
		const version = extension && extension.versions && extension.versions[0]
			&& extension.versions[0].version;
		return typeof version === 'string' ? version : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

module.exports = { compareVersions, fetchLatestVersion };
