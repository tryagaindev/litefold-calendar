import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const TSC_PATH = fileURLToPath(
	new URL("../../node_modules/typescript/bin/tsc", import.meta.url)
);

export function run(command, arguments_, options = {}) {
	const {
		capture = false,
		cwd = REPOSITORY_ROOT,
		env = process.env
	} = options;

	return new Promise((resolve, reject) => {
		const child = spawn(command, arguments_, {
			cwd,
			env,
			shell: false,
			stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
		});
		let stdout = "";
		let stderr = "";

		if (capture) {
			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stdout.on("data", (chunk) => {
				stdout += chunk;
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk;
			});
		}

		child.on("error", reject);
		child.on("close", (code, signal) => {
			if (code === 0) {
				resolve({ stderr, stdout });
				return;
			}

			const detail = signal === null ? `exit code ${String(code)}` : `signal ${signal}`;
			const captured = stderr.trim().length > 0 ? `\n${stderr.trim()}` : "";
			reject(new Error(`${command} failed with ${detail}.${captured}`));
		});
	});
}

export function runNpm(arguments_, options = {}) {
	const npmCli = process.env.npm_execpath;
	if (typeof npmCli === "string" && npmCli.length > 0) {
		return run(process.execPath, [npmCli, ...arguments_], options);
	}

	if (process.platform === "win32") {
		const bundledCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
		if (existsSync(bundledCli)) {
			return run(process.execPath, [bundledCli, ...arguments_], options);
		}
	}

	const executable = process.platform === "win32" ? "npm.cmd" : "npm";
	return run(executable, arguments_, options);
}

export function runTsc(arguments_, options = {}) {
	return run(process.execPath, [TSC_PATH, ...arguments_], options);
}
