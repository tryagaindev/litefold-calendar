import { join } from "node:path";

/**
 * Builds the explicitly requested Windows Firefox compatibility environment.
 * The caller must already run inside an OS sandbox that confines child processes.
 * This mode disables Firefox's nested content sandbox and is unsuitable for normal
 * desktop launches or CI. The caller creates the app-data directories before launch.
 *
 * @param {object} [options]
 * @param {Record<string, string | undefined>} [options.env] Inherited launch environment.
 * @param {string} [options.platform] Host platform, as reported by process.platform.
 * @param {string} [options.appDataRoot] Writable, isolated app-data root for this run.
 * @returns {{ env: Record<string, string | undefined> } | undefined}
 */
export function createFirefoxLaunchOptions({ env = process.env, platform = process.platform,
	appDataRoot } = {}) {
	const optIn = env.LFC_FIREFOX_OUTER_SANDBOX;
	if (optIn === undefined || optIn === "") {
		return undefined;
	}
	if (optIn !== "1") {
		throw new Error("LFC_FIREFOX_OUTER_SANDBOX must be unset or exactly 1.");
	}
	if (platform !== "win32") {
		throw new Error("LFC_FIREFOX_OUTER_SANDBOX is only supported on Windows.");
	}
	if (env.CI) {
		throw new Error("LFC_FIREFOX_OUTER_SANDBOX cannot be enabled in CI.");
	}
	if (typeof appDataRoot !== "string" || appDataRoot.length === 0) {
		throw new Error("LFC_FIREFOX_OUTER_SANDBOX requires an isolated appDataRoot.");
	}
	return {
		env: {
			...env,
			MOZ_APP_DATA: join(appDataRoot, "app"),
			MOZ_LOCAL_APP_DATA: join(appDataRoot, "local"),
			MOZ_DISABLE_CONTENT_SANDBOX: "1"
		}
	};
}
