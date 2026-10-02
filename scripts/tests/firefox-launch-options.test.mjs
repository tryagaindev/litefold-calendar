import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { createFirefoxLaunchOptions } from "../lib/firefox-launch-options.mjs";

void test("Firefox launch options stay unchanged without an explicit opt-in", () => {
	for (const optIn of [undefined, ""]) {
		const env = Object.freeze({ LFC_FIREFOX_OUTER_SANDBOX: optIn, CI: "true" });
		for (const platform of ["win32", "linux", "darwin"]) {
			assert.equal(createFirefoxLaunchOptions({ env, platform }), undefined);
		}
	}
});

void test("Firefox compatibility rejects ambiguous opt-in values", () => {
	for (const optIn of ["0", "false", "true", "yes", " 1", "1 ", " "]) {
		assert.throws(() => createFirefoxLaunchOptions({
			env: { LFC_FIREFOX_OUTER_SANDBOX: optIn }, platform: "win32", appDataRoot: "isolated"
		}), /must be unset or exactly 1/u);
	}
});

void test("Firefox compatibility is restricted to Windows outside CI", () => {
	const env = { LFC_FIREFOX_OUTER_SANDBOX: "1" };
	for (const platform of ["linux", "darwin", "freebsd"]) {
		assert.throws(() => createFirefoxLaunchOptions({ env, platform,
			appDataRoot: "isolated" }), /only supported on Windows/u);
	}
	for (const ci of ["1", "true", "false", "0"]) {
		assert.throws(() => createFirefoxLaunchOptions({ env: { ...env, CI: ci },
			platform: "win32", appDataRoot: "isolated" }), /cannot be enabled in CI/u);
	}
});

void test("Firefox compatibility requires its caller to supply isolated app-data storage", () => {
	for (const appDataRoot of [undefined, ""]) {
		assert.throws(() => createFirefoxLaunchOptions({
			env: { LFC_FIREFOX_OUTER_SANDBOX: "1" }, platform: "win32", appDataRoot
		}), /requires an isolated appDataRoot/u);
	}
});

void test("Firefox compatibility isolates both app-data paths while preserving inherited environment", () => {
	const env = Object.freeze({
		LFC_FIREFOX_OUTER_SANDBOX: "1",
		CI: "",
		PATH: "inherited-search-path",
		CODEX_SANDBOX_NETWORK_DISABLED: "1",
		MOZ_APP_DATA: "inherited-app-data",
		MOZ_LOCAL_APP_DATA: "inherited-local-app-data",
		MOZ_DISABLE_CONTENT_SANDBOX: "0"
	});
	const before = { ...env };
	const appDataRoot = join("isolated storage", "run-123");
	const options = Object.freeze({ env, platform: "win32", appDataRoot });
	const result = createFirefoxLaunchOptions(options);
	assert.deepEqual(result, { env: { ...env,
		MOZ_APP_DATA: join(appDataRoot, "app"),
		MOZ_LOCAL_APP_DATA: join(appDataRoot, "local"),
		MOZ_DISABLE_CONTENT_SANDBOX: "1" } });
	assert.notEqual(result.env, env);
	assert.deepEqual(env, before);
	assert.equal(options.appDataRoot, appDataRoot);
	result.env.PATH = "changed-result";
	assert.equal(env.PATH, "inherited-search-path");
});
