import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** Returns every regular file below a directory without following symlinks. */
export async function listFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];

	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...await listFiles(path));
		} else if (entry.isFile()) {
			files.push(path);
		}
	}

	return files;
}
