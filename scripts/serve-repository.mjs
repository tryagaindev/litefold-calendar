import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { REPOSITORY_ROOT } from "./lib/process.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const MAX_PATH_LENGTH = 2_048;
const PUBLIC_PREFIXES = Object.freeze(["dist", "examples"]);
const CONTENT_TYPES = Object.freeze({
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8"
});
const SECURITY_HEADERS = Object.freeze({
	"Cache-Control": "no-store",
	"Content-Security-Policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff"
});

function parsePort(value) {
	if (!/^\d{1,5}$/u.test(value)) {
		throw new Error(`Invalid repository-server port: ${value}`);
	}

	const port = Number(value);
	if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
		throw new Error(`Repository-server port is outside the allowed range: ${value}`);
	}

	return port;
}

function parseArguments(arguments_) {
	let host = DEFAULT_HOST;
	let port = DEFAULT_PORT;
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		const value = arguments_[index + 1];
		if ((argument === "--host" || argument === "--port") && value === undefined) {
			throw new Error(`${argument} requires a value.`);
		}
		if (argument === "--host") {
			host = value;
			index += 1;
		} else if (argument === "--port") {
			port = parsePort(value);
			index += 1;
		} else {
			throw new Error(`Unknown repository-server argument: ${argument}`);
		}
	}

	if (host !== DEFAULT_HOST) {
		throw new Error(`The repository server only binds to ${DEFAULT_HOST}.`);
	}

	return { host, port };
}

function isWithinRepository(candidate) {
	const childPath = relative(REPOSITORY_ROOT, candidate);
	return childPath !== "" && !childPath.startsWith(`..${sep}`) && childPath !== ".." &&
		!isAbsolute(childPath);
}

function setSecurityHeaders(response) {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.setHeader(name, value);
	}
}

function send(response, statusCode, message, method = "GET") {
	const body = Buffer.from(message, "utf8");
	response.statusCode = statusCode;
	response.setHeader("Content-Length", String(body.byteLength));
	response.setHeader("Content-Type", "text/plain; charset=utf-8");
	response.end(method === "HEAD" ? undefined : body);
}

async function resolvePublicFile(pathname) {
	if (pathname.length > MAX_PATH_LENGTH || pathname.includes("\0") || pathname.includes("\\")) {
		return null;
	}

	let decodedPath;
	try {
		decodedPath = decodeURIComponent(pathname);
	} catch {
		return null;
	}

	const segments = decodedPath.split("/").filter((segment) => segment.length > 0);
	if (segments.length === 0 || !PUBLIC_PREFIXES.includes(segments[0]) ||
		segments.some((segment) => segment === "." || segment === ".." || segment.startsWith("."))) {
		return null;
	}

	let candidate = resolve(REPOSITORY_ROOT, ...segments);
	if (decodedPath.endsWith("/")) {
		candidate = resolve(candidate, "index.html");
	}

	try {
		if (!(await stat(candidate)).isFile()) {
			return null;
		}
		const canonicalPath = await realpath(candidate);
		return isWithinRepository(canonicalPath) ? canonicalPath : null;
	} catch {
		return null;
	}
}

function isAllowedHost(hostHeader, port) {
	return hostHeader === `${DEFAULT_HOST}:${String(port)}` || hostHeader === `localhost:${String(port)}`;
}

export async function startRepositoryServer({ port = DEFAULT_PORT } = {}) {
	const server = createServer(async (request, response) => {
		setSecurityHeaders(response);
		const method = request.method ?? "GET";
		if (method !== "GET" && method !== "HEAD") {
			response.setHeader("Allow", "GET, HEAD");
			send(response, 405, "Method not allowed.\n", method);
			return;
		}

		const address = server.address();
		const listeningPort = typeof address === "object" && address !== null ? address.port : port;
		if (!isAllowedHost(request.headers.host ?? "", listeningPort)) {
			send(response, 400, "Invalid Host header.\n", method);
			return;
		}

		const rawUrl = request.url ?? "/";
		if (!rawUrl.startsWith("/") || rawUrl.startsWith("//")) {
			send(response, 400, "Invalid request target.\n", method);
			return;
		}

		let url;
		try {
			url = new URL(rawUrl, `http://${DEFAULT_HOST}:${String(listeningPort)}`);
		} catch {
			send(response, 400, "Invalid request target.\n", method);
			return;
		}

		if (url.pathname === "/__health") {
			send(response, 200, "ok\n", method);
			return;
		}
		if (url.pathname === "/") {
			response.statusCode = 302;
			response.setHeader("Location", "/examples/basic/");
			response.setHeader("Content-Length", "0");
			response.end();
			return;
		}

		const filePath = await resolvePublicFile(url.pathname);
		if (filePath === null) {
			send(response, 404, "Not found.\n", method);
			return;
		}

		try {
			const body = await readFile(filePath);
			response.statusCode = 200;
			response.setHeader("Content-Length", String(body.byteLength));
			response.setHeader(
				"Content-Type",
				CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
			);
			response.end(method === "HEAD" ? undefined : body);
		} catch {
			send(response, 500, "Unable to read repository fixture.\n", method);
		}
	});

	await new Promise((resolvePromise, reject) => {
		server.once("error", reject);
		server.listen(port, DEFAULT_HOST, () => {
			server.off("error", reject);
			resolvePromise();
		});
	});

	const address = server.address();
	if (typeof address !== "object" || address === null) {
		server.close();
		throw new Error("The repository server did not expose a TCP address.");
	}

	return Object.freeze({
		close: () => new Promise((resolvePromise, reject) => {
			server.close((error) => {
				if (error === undefined) {
					resolvePromise();
				} else {
					reject(error);
				}
			});
			server.closeAllConnections();
		}),
		origin: `http://${DEFAULT_HOST}:${String(address.port)}`
	});
}

const executedDirectly = process.argv[1] !== undefined &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (executedDirectly) {
	const options = parseArguments(process.argv.slice(2));
	const runningServer = await startRepositoryServer(options);
	console.log(`Repository fixture server listening at ${runningServer.origin}`);
	const shutdown = () => {
		const forcedExit = setTimeout(() => {
			process.exit(1);
		}, 1_000);
		void runningServer.close().then(() => {
			clearTimeout(forcedExit);
			process.exit(0);
		});
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}
