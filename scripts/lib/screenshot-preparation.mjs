import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

/** Builds once only when evidence is stale. CI can verify evidence but never accept it. */
export async function prepareScreenshots({ checkCurrent, build, capture, verify, force = false,
	ci = Boolean(process.env["CI"]) }) {
	if (!force && await checkCurrent()) {
		return "current";
	}
	if (ci) {
		throw new Error("Screenshot evidence is stale. Prepare and review captures locally; CI cannot accept them.");
	}
	await build();
	await capture();
	await verify();
	return "updated";
}

function escapeHtml(value) {
	return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Creates a self-contained comparison gallery outside canonical documentation assets. */
export async function writeScreenshotReview({ directory, beforeDirectory, afterDirectory,
	previousManifest, manifest }) {
	await mkdir(join(directory, "before"), { recursive: true });
	await mkdir(join(directory, "after"), { recursive: true });
	const scenes = [];
	for (const scene of manifest.scenes) {
		const filename = basename(scene.output);
		const previous = previousManifest.scenes.find((candidate) => candidate.id === scene.id);
		let before = null;
		try {
			await copyFile(join(beforeDirectory, filename), join(directory, "before", filename));
			before = `before/${filename}`;
		} catch (error) {
			if (error.code !== "ENOENT") { throw error; }
		}
		await copyFile(join(afterDirectory, filename), join(directory, "after", filename));
		scenes.push({ id: scene.id, alt: scene.alt, before, after: `after/${filename}`,
			changed: previous?.sha256 !== scene.sha256,
			previousSha256: previous?.sha256 ?? null, sha256: scene.sha256 });
	}
	const changed = scenes.filter((scene) => scene.changed).map((scene) => scene.id);
	const report = { sourceFingerprint: manifest.sourceFingerprint, changed, scenes };
	await writeFile(join(directory, "changes.json"), `${JSON.stringify(report, null, 2)}\n`);
	const figures = scenes.map((scene) => `<section><h2>${escapeHtml(scene.id)} — ${scene.changed ? "changed" : "unchanged"}</h2><div class="comparison"><figure><figcaption>Before</figcaption>${scene.before === null ? "<p>No previous capture</p>" : `<img src="${scene.before}" alt="Before: ${escapeHtml(scene.alt)}">`}</figure><figure><figcaption>After</figcaption><img src="${scene.after}" alt="After: ${escapeHtml(scene.alt)}"></figure></div></section>`).join("\n");
	await writeFile(join(directory, "index.html"), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Calendar screenshot review</title><style>
body{font:1rem/1.5 system-ui,sans-serif;margin:2rem;color:#17202a;background:#f8fafc}section{margin-block:2rem;container-type:inline-size}.comparison{display:grid;gap:1rem}figure{margin:0;min-width:0}figcaption{font-weight:600}img{display:block;max-width:100%;height:auto;border:1px solid #7c8795}@container (min-width:50rem){.comparison{grid-template-columns:1fr 1fr}}
</style><h1>Calendar screenshot review</h1><p>${changed.length} of ${scenes.length} scenes changed. Compare at native dimensions before committing.</p>${figures}</html>\n`);
	return report;
}

/** Replaces a validated batch, committing the manifest last and restoring originals on failure. */
export async function replaceScreenshotBatch({ stagingDirectory, screenshotDirectory, manifestPath,
	manifest, renameFile = rename }) {
	const backupDirectory = join(stagingDirectory, "backup");
	await mkdir(backupDirectory, { recursive: true });
	const stagedManifest = join(stagingDirectory, "manifest.json");
	await writeFile(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
	const files = [...manifest.scenes.map((scene) => ({
		from: join(stagingDirectory, basename(scene.output)),
		to: join(screenshotDirectory, basename(scene.output))
	})), { from: stagedManifest, to: manifestPath }];
	const replaced = [];
	try {
		for (const file of files) {
			const backup = join(backupDirectory, basename(file.to));
			let hadOriginal = false;
			try {
				await renameFile(file.to, backup);
				hadOriginal = true;
			} catch (error) {
				if (error.code !== "ENOENT") { throw error; }
			}
			const record = { ...file, backup, hadOriginal, installed: false };
			replaced.push(record);
			await renameFile(file.from, file.to);
			record.installed = true;
		}
	} catch (error) {
		const recoveryErrors = [];
		for (const file of replaced.reverse()) {
			try {
				if (file.installed) { await rm(file.to, { force: true }); }
				if (file.hadOriginal) { await rename(file.backup, file.to); }
			} catch (recoveryError) { recoveryErrors.push(recoveryError); }
		}
		if (recoveryErrors.length > 0) {
			throw new AggregateError([error, ...recoveryErrors],
				`Screenshot replacement failed; recover originals from ${backupDirectory}.`, { cause: error });
		}
		throw error;
	}
}

/** Checks captured dimensions and bytes before any canonical file is replaced. */
export async function validateScreenshotBatch({ directory, manifest, readDimensions, hashFile }) {
	for (const scene of manifest.scenes) {
		const path = join(directory, basename(scene.output));
		const dimensions = await readDimensions(path);
		if (dimensions.width !== scene.viewport.width || dimensions.height !== scene.viewport.height ||
			await hashFile(path) !== scene.sha256) {
			throw new Error(`${scene.id}: staged screenshot dimensions or SHA-256 do not match.`);
		}
	}
}
