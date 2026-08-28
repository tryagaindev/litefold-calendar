import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { REPOSITORY_ROOT } from "../lib/process.mjs";

const execFileAsync = promisify(execFile);

void test("setup is explicit and is never an install lifecycle hook", async () => {
	const manifest = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
	assert.equal(manifest.scripts.setup, "./scripts/setup-environment.sh");
	for (const hook of ["preinstall", "install", "postinstall", "prepare"]) {
		assert.equal(manifest.scripts[hook], undefined);
	}
});

void test("environment setup caches npm and installs offline Codex guidance", async (context) => {
	const workspace = await mkdtemp(join(tmpdir(), "lfc-setup-"));
	context.after(() => rm(workspace, { force: true, recursive: true }));
	const binaryDirectory = join(workspace, "bin");
	const codexHome = join(workspace, "codex");
	const commandLog = join(workspace, "commands.log");
	await mkdir(binaryDirectory);

	const corepack = join(binaryDirectory, "corepack");
	await writeFile(corepack, `#!/usr/bin/env bash
set -euo pipefail
printf 'corepack %s\\n' "$*" >> "\${LFC_SETUP_TEST_LOG}"
`, "utf8");
	await chmod(corepack, 0o755);
	const npm = join(binaryDirectory, "npm");
	await writeFile(npm, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
	printf '%s\\n' '12.0.2'
else
	printf 'npm %s\\n' "$*" >> "\${LFC_SETUP_TEST_LOG}"
fi
`, "utf8");
	await chmod(npm, 0o755);

	const git = join(binaryDirectory, "git");
	await writeFile(git, `#!/usr/bin/env bash
set -euo pipefail
test "$1" = "-C"
directory="$2"
command="$3"
printf 'git %s\\n' "$*" >> "\${LFC_SETUP_TEST_LOG}"
if [[ "\${command}" == "init" ]]; then
	mkdir -p "\${directory}/.git"
elif [[ "\${command}" == "fetch" ]]; then
	mkdir -p "\${directory}/skills/performance"
	printf '%s\\n' '---' 'name: performance' '---' > \
		"\${directory}/skills/performance/SKILL.md"
elif [[ "\${command}" == "rev-parse" ]]; then
	printf '%040d\\n' 1
fi
`, "utf8");
	await chmod(git, 0o755);

	const { stdout } = await execFileAsync(join(REPOSITORY_ROOT, "scripts", "setup-environment.sh"), [], {
		cwd: workspace,
		env: {
			...process.env,
			CODEX_HOME: codexHome,
			LFC_SETUP_SKIP_BROWSER: "1",
			LFC_SETUP_TEST_LOG: commandLog,
			LFC_WEB_QUALITY_SKILLS_REPOSITORY: "https://example.invalid/guidance.git",
			PATH: `${binaryDirectory}${delimiter}${process.env.PATH ?? ""}`
		}
	});

	assert.match(stdout, /Environment ready: npm 12\.0\.2, Chromium skipped, and 1 Google web-quality skills are cached\./u);
	assert.match(
		await readFile(commandLog, "utf8"),
		/corepack prepare npm@12\.0\.2 --activate[\s\S]*corepack enable npm[\s\S]*npm ci --ignore-scripts/u
	);
	assert.match(
		await readFile(join(codexHome, "skills", "google-web-performance", "SKILL.md"), "utf8"),
		/name: performance/u
	);
	assert.equal(
		await readFile(join(codexHome, "google-web-quality-skills.commit"), "utf8"),
		"0000000000000000000000000000000000000001\n"
	);
});
