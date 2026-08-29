import {
	copyFile,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rename,
	rm,
	writeFile
} from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseExampleMetadata } from "./lib/example-metadata.mjs";
import { REPOSITORY_ROOT } from "./lib/process.mjs";
import { parseSemVer } from "./lib/semver.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_SHELL_DIRECTORY = join(REPOSITORY_ROOT, "scripts", "pages-site");
const SHELL_MARK_FILENAME = "litefold-calendar-mark.svg";
const EXAMPLE_RUNTIME_EXTENSIONS = new Set([".css", ".html", ".js", ".json"]);
const PACKAGE_RUNTIME_EXTENSIONS = new Set([".css", ".js"]);
const SHELL_RUNTIME_EXTENSIONS = new Set([".css", ".html", ".js"]);
const CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-src 'none'; img-src 'self' data:; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'";

function displayPath(path, root) {
	return relative(root, path).replaceAll(sep, "/");
}

function escapeHtml(value) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function deploymentChannelLabel(channel) {
	return channel === "main" ? "Rolling main preview" : "Immutable release";
}

function repositoryWebUrl(repository) {
	const value = typeof repository === "string" ? repository : repository?.url;
	if (typeof value !== "string") {
		throw new Error("Package repository metadata must identify a GitHub repository.");
	}
	let parsed;
	try {
		parsed = new URL(value.startsWith("git+") ? value.slice(4) : value);
	} catch {
		throw new Error("Package repository metadata must identify a GitHub repository.");
	}
	const segments = parsed.pathname.replace(/\.git$/u, "").split("/").filter(Boolean);
	if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" ||
		parsed.username !== "" || parsed.password !== "" || parsed.search !== "" ||
		parsed.hash !== "" || segments.length !== 2) {
		throw new Error("Package repository metadata must identify a GitHub repository.");
	}
	return `https://github.com/${segments.map(encodeURIComponent).join("/")}`;
}

function repositoryPathUrl(repositoryUrl, kind, commit, path) {
	const encodedPath = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
	return `${repositoryUrl}/${kind}/${commit}/${encodedPath}${kind === "tree" ? "/" : ""}`;
}

function relativeDirectoryHref(fromDirectory, toDirectory) {
	let href = relative(fromDirectory, toDirectory).replaceAll(sep, "/");
	if (!href.startsWith(".")) {
		href = `./${href}`;
	}
	return `${href.replace(/\/$/u, "")}/`;
}

function parseArguments(arguments_) {
	if (arguments_.length !== 2 || arguments_[0] !== "--output" || arguments_[1]?.length === 0) {
		throw new Error("Usage: node scripts/build-pages.mjs --output <directory>");
	}

	return { outputDirectory: resolve(arguments_[1]) };
}

export function validateDeploymentMetadata(metadata, packageVersion) {
	const parsed = parseExampleMetadata(metadata);
	if (parsed.channel !== "main" && parsed.channel !== "release") {
		throw new Error("A Pages artifact must use the main or release deployment channel.");
	}
	try {
		parseSemVer(parsed.version);
	} catch {
		throw new Error("Deployment metadata version must match the package version.");
	}
	if (parsed.version !== packageVersion) {
		throw new Error("Deployment metadata version must match the package version.");
	}

	return parsed;
}

function assertNoRemoteHtmlAssets(source, path) {
	const assetTagPattern = /<(?:audio|base|embed|iframe|img|link|object|script|source|track|video)\b[^>]*>/giu;
	const resourceAttributePattern = /\b(?:data|href|poster|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;
	for (const tag of source.matchAll(assetTagPattern)) {
		for (const attribute of tag[0].matchAll(resourceAttributePattern)) {
			const value = attribute[1] ?? attribute[2] ?? attribute[3] ?? "";
			if (/(?:^|,)\s*(?:https?:)?\/\//iu.test(value)) {
				throw new Error(`${path} loads a remote runtime asset.`);
			}
		}
	}
	for (const meta of source.matchAll(/<meta\b[^>]*>/giu)) {
		if (/\bhttp-equiv\s*=\s*["']?\s*refresh\b/iu.test(meta[0]) &&
			/(?:https?:)?\/\//iu.test(meta[0])) {
			throw new Error(`${path} redirects to a remote runtime resource.`);
		}
	}
	assertNoRemoteCssAssets(source, path);
}

function assertNoRemoteCssAssets(source, path) {
	const remoteImport = /@import\s+(?:url\(\s*)?["']?\s*(?:https?:)?\/\//iu;
	const remoteUrl = /url\(\s*["']?\s*(?:https?:)?\/\//iu;
	const remoteImageSet = /(?:-webkit-)?image-set\([^)]*["']\s*(?:https?:)?\/\//iu;
	if (remoteImport.test(source) || remoteUrl.test(source) || remoteImageSet.test(source)) {
		throw new Error(`${path} loads a remote runtime asset.`);
	}
}

function assertNoRemoteJavaScriptRequests(source, path) {
	const remoteRequestPatterns = [
		/\b(?:export|import)\b[\s\S]*?\bfrom\s*["']\s*(?:https?:)?\/\//iu,
		/\bimport\s*["']\s*(?:https?:)?\/\//iu,
		/\bimport\s*\(\s*["']\s*(?:https?:)?\/\//iu,
		/\bfetch\s*\(\s*["']\s*(?:https?:)?\/\//iu,
		/\bnew\s+(?:EventSource|SharedWorker|WebSocket|Worker)\s*\(\s*["']\s*(?:https?:)?\/\//iu,
		/\bnavigator\.sendBeacon\s*\(\s*["']\s*(?:https?:)?\/\//iu
	];
	if (remoteRequestPatterns.some((pattern) => pattern.test(source))) {
		throw new Error(`${path} requests a remote runtime resource.`);
	}
}

function assertSelfContainedSvgAsset(source, path) {
	const disallowedMarkup = /<(?:foreignObject|image|script)\b|<\?xml-stylesheet\b|\bon[a-z]+\s*=/iu;
	const remoteReference = /\b(?:href|xlink:href)\s*=\s*(?:"[^"]*(?:https?:)?\/\/|'[^']*(?:https?:)?\/\/|[^\s"'=<>`]*(?:https?:)?\/\/)/iu;
	if (disallowedMarkup.test(source) || remoteReference.test(source)) {
		throw new Error(`${path} must be a self-contained, script-free SVG runtime asset.`);
	}
	for (const use of source.matchAll(/<use\b[^>]*>/giu)) {
		const reference = /\b(?:href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/iu.exec(use[0]);
		const value = reference?.[1] ?? reference?.[2] ?? reference?.[3];
		if (value === undefined || !value.startsWith("#")) {
			throw new Error(`${path} must be a self-contained, script-free SVG runtime asset.`);
		}
	}
	assertNoRemoteCssAssets(source, path);
}

async function injectContentSecurityPolicy(htmlPath, root) {
	const source = await readFile(htmlPath, "utf8");
	if (!source.includes("<head>") || !source.includes("</head>")) {
		throw new Error(`${displayPath(htmlPath, root)} is not a complete HTML document.`);
	}
	if (/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy/iu.test(source)) {
		throw new Error(`${displayPath(htmlPath, root)} already declares a Content Security Policy.`);
	}
	const meta = `\t<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`;
	const charsetPattern = /(<head>\s*<meta\s+charset=[^>]+>)/iu;
	if (!charsetPattern.test(source)) {
		throw new Error(`${displayPath(htmlPath, root)} must declare charset before runtime resources.`);
	}
	await writeFile(htmlPath, source.replace(charsetPattern, `$1\n${meta}`), "utf8");
}

export function assertNoRemoteRuntimeAssets(source, path) {
	switch (extname(path).toLowerCase()) {
		case ".css":
			assertNoRemoteCssAssets(source, path);
			break;
		case ".html":
			assertNoRemoteHtmlAssets(source, path);
			break;
		case ".js":
			assertNoRemoteJavaScriptRequests(source, path);
			break;
		case ".svg":
			assertSelfContainedSvgAsset(source, path);
			break;
		default:
			break;
	}
}

async function pathExists(path) {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

async function copyRuntimeTree(sourceDirectory, destinationDirectory, extensions, repositoryRoot) {
	const copiedFiles = [];
	const entries = await readdir(sourceDirectory, { withFileTypes: true });
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
		const sourcePath = join(sourceDirectory, entry.name);
		const destinationPath = join(destinationDirectory, entry.name);
		if (entry.isSymbolicLink()) {
			throw new Error(`${displayPath(sourcePath, repositoryRoot)} must not be a symbolic link.`);
		}
		if (entry.isDirectory()) {
			copiedFiles.push(...await copyRuntimeTree(
				sourcePath,
				destinationPath,
				extensions,
				repositoryRoot
			));
			continue;
		}
		if (!entry.isFile()) {
			throw new Error(`${displayPath(sourcePath, repositoryRoot)} must be a regular file.`);
		}
		if (!extensions.has(extname(entry.name).toLowerCase())) {
			continue;
		}

		await mkdir(destinationDirectory, { recursive: true });
		await copyFile(sourcePath, destinationPath);
		copiedFiles.push(destinationPath);
	}
	return copiedFiles;
}

async function copyRegularFile(sourcePath, destinationPath, repositoryRoot) {
	const source = await lstat(sourcePath);
	if (source.isSymbolicLink()) {
		throw new Error(`${displayPath(sourcePath, repositoryRoot)} must not be a symbolic link.`);
	}
	if (!source.isFile()) {
		throw new Error(`${displayPath(sourcePath, repositoryRoot)} must be a regular file.`);
	}

	await mkdir(dirname(destinationPath), { recursive: true });
	await copyFile(sourcePath, destinationPath);
	return destinationPath;
}

function developerFooter(metadata, stylesheetHref, navigation) {
	const channel = escapeHtml(deploymentChannelLabel(metadata.channel));
	const commit = escapeHtml(metadata.commit);
	const version = escapeHtml(metadata.version);
	return [
		`\t<link rel="stylesheet" href="${escapeHtml(stylesheetHref)}">`,
		`\t<footer class="lfc-developer-footer" data-deployment-channel="${escapeHtml(metadata.channel)}">`,
		'\t\t<nav aria-label="Developer resources">',
		'\t\t\t<ul class="lfc-developer-footer-links">',
		`\t\t\t\t<li><a href="${escapeHtml(navigation.examplesHref)}">All examples</a></li>`,
		`\t\t\t\t<li><a href="${escapeHtml(navigation.sourceHref)}">Recipe source</a></li>`,
		`\t\t\t\t<li><a href="${escapeHtml(navigation.apiHref)}">API reference</a></li>`,
		`\t\t\t\t<li><a href="${escapeHtml(navigation.integrationHref)}">Integration guide</a></li>`,
		"\t\t\t</ul>",
		"\t\t</nav>",
		"\t\t<dl>",
		"\t\t\t<dt>Package version</dt>",
		`\t\t\t<dd><code>${version}</code></dd>`,
		"\t\t\t<dt>Deployment channel</dt>",
		`\t\t\t<dd>${channel}</dd>`,
		"\t\t\t<dt>Source commit</dt>",
		`\t\t\t<dd><a href="${escapeHtml(navigation.commitHref)}"><code>${commit}</code></a></dd>`,
		"\t\t</dl>",
		"\t</footer>"
	].join("\n");
}

async function injectDeveloperFooter(htmlPath, contentDirectory, exampleDirectory, metadata, repositoryUrl) {
	const source = await readFile(htmlPath, "utf8");
	if (source.includes("class=\"lfc-developer-footer\"")) {
		throw new Error(`${displayPath(htmlPath, contentDirectory)} already contains a developer footer.`);
	}
	if (!source.includes("</head>") || !source.includes("</body>")) {
		throw new Error(`${displayPath(htmlPath, contentDirectory)} is not a complete HTML document.`);
	}

	const stylesheetPath = join(contentDirectory, "deployment-details.css");
	let stylesheetHref = relative(dirname(htmlPath), stylesheetPath).replaceAll(sep, "/");
	if (!stylesheetHref.startsWith(".")) {
		stylesheetHref = `./${stylesheetHref}`;
	}
	const exampleRelativeDirectory = displayPath(dirname(htmlPath), exampleDirectory);
	if (exampleRelativeDirectory === "" || exampleRelativeDirectory.startsWith("../")) {
		throw new Error(`${displayPath(htmlPath, contentDirectory)} must be a nested example document.`);
	}
	const navigation = {
		apiHref: repositoryPathUrl(repositoryUrl, "blob", metadata.commit, "docs/api.md"),
		commitHref: `${repositoryUrl}/commit/${metadata.commit}`,
		examplesHref: relativeDirectoryHref(dirname(htmlPath), exampleDirectory),
		integrationHref: repositoryPathUrl(
			repositoryUrl,
			"blob",
			metadata.commit,
			"docs/integration-guide.md"
		),
		sourceHref: repositoryPathUrl(
			repositoryUrl,
			"tree",
			metadata.commit,
			`examples/${exampleRelativeDirectory}`
		)
	};
	const footer = developerFooter(metadata, stylesheetHref, navigation);
	const link = footer.split("\n")[0];
	const markup = footer.split("\n").slice(1).join("\n");
	const withStylesheet = source.replace("</head>", `${link}\n</head>`);
	await writeFile(htmlPath, withStylesheet.replace("</body>", `${markup}\n</body>`), "utf8");
}

async function validateRuntimeFiles(files, root) {
	for (const path of files) {
		const source = await readFile(path, "utf8");
		assertNoRemoteRuntimeAssets(source, displayPath(path, root));
	}
}

async function requireFiles(root, paths) {
	for (const path of paths) {
		if (!await pathExists(join(root, ...path.split("/")))) {
			throw new Error(`Pages artifact is missing ${path}.`);
		}
	}
}

export async function buildPagesArtifact(options) {
	const {
		outputDirectory,
		repositoryRoot = REPOSITORY_ROOT,
		shellDirectory = DEFAULT_SHELL_DIRECTORY
	} = options;
	const resolvedOutput = resolve(outputDirectory);
	if (await pathExists(resolvedOutput)) {
		throw new Error(`Pages artifact output already exists: ${resolvedOutput}`);
	}

	const packageManifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
	const metadataPath = join(repositoryRoot, "examples", "metadata.json");
	const metadata = validateDeploymentMetadata(
		JSON.parse(await readFile(metadataPath, "utf8")),
		packageManifest.version
	);
	const repositoryUrl = repositoryWebUrl(packageManifest.repository);

	await mkdir(dirname(resolvedOutput), { recursive: true });
	const stagingDirectory = await mkdtemp(join(dirname(resolvedOutput), ".lfc-pages-staging-"));
	try {
		const contentDirectory = join(stagingDirectory, "content");
		const exampleDirectory = join(contentDirectory, "examples");
		const packageFiles = await copyRuntimeTree(
			join(repositoryRoot, "dist"),
			join(contentDirectory, "dist"),
			PACKAGE_RUNTIME_EXTENSIONS,
			repositoryRoot
		);
		const exampleFiles = await copyRuntimeTree(
			join(repositoryRoot, "examples"),
			exampleDirectory,
			EXAMPLE_RUNTIME_EXTENSIONS,
			repositoryRoot
		);
		const shellFiles = await copyRuntimeTree(
			shellDirectory,
			join(stagingDirectory, "shell"),
			SHELL_RUNTIME_EXTENSIONS,
			repositoryRoot
		);
		shellFiles.push(await copyRegularFile(
			join(repositoryRoot, "docs", "assets", SHELL_MARK_FILENAME),
			join(stagingDirectory, "shell", SHELL_MARK_FILENAME),
			repositoryRoot
		));

		await requireFiles(stagingDirectory, [
			"content/dist/index.js",
			"content/dist/styles.css",
			"content/examples/index.html",
			"content/examples/metadata.json",
			"shell/deployment-details.css",
			"shell/index.html",
			`shell/${SHELL_MARK_FILENAME}`,
			"shell/site.css",
			"shell/site.js"
		]);

		const nestedExampleHtml = exampleFiles.filter((path) =>
			extname(path).toLowerCase() === ".html" &&
			displayPath(path, exampleDirectory) !== "index.html"
		);
		for (const htmlPath of nestedExampleHtml) {
			await injectDeveloperFooter(
				htmlPath,
				contentDirectory,
				exampleDirectory,
				metadata,
				repositoryUrl
			);
		}
		const allHtmlFiles = [...exampleFiles, ...shellFiles]
			.filter((path) => extname(path).toLowerCase() === ".html");
		for (const htmlPath of allHtmlFiles) {
			await injectContentSecurityPolicy(htmlPath, stagingDirectory);
		}
		const deploymentStylesheetPath = join(contentDirectory, "deployment-details.css");
		await copyFile(join(shellDirectory, "deployment-details.css"), deploymentStylesheetPath);
		await writeFile(
			join(stagingDirectory, "channel.json"),
			`${JSON.stringify(metadata, null, 2)}\n`,
			"utf8"
		);

		await validateRuntimeFiles(
			[...packageFiles, ...exampleFiles, ...shellFiles, deploymentStylesheetPath],
			stagingDirectory
		);
		await rename(stagingDirectory, resolvedOutput);
	} catch (error) {
		await rm(stagingDirectory, { force: true, recursive: true });
		throw error;
	}

	console.log(
		`Built ${deploymentChannelLabel(metadata.channel).toLowerCase()} artifact for ${metadata.version} at ${metadata.commit}.`
	);
	return { metadata, outputDirectory: resolvedOutput };
}

async function main() {
	const { outputDirectory } = parseArguments(process.argv.slice(2));
	await buildPagesArtifact({ outputDirectory });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
	await main();
}
