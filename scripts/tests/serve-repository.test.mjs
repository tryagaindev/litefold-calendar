import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";

import { startRepositoryServer } from "../serve-repository.mjs";

const EXPECTED_SECURITY_HEADERS = Object.freeze({
	"cache-control": "no-store",
	"cross-origin-opener-policy": "same-origin",
	"cross-origin-resource-policy": "same-origin",
	"referrer-policy": "no-referrer",
	"x-content-type-options": "nosniff"
});
const EXAMPLE_ROUTES = Object.freeze([
	"/examples/advanced/",
	"/examples/async-errors/",
	"/examples/basic/",
	"/examples/classic-script/",
	"/examples/fullcalendar-v6-migration/",
	"/examples/progressive-enhancement/"
]);

function requestWithHost(origin, host) {
	const url = new URL(origin);
	return new Promise((resolve, reject) => {
		const outgoing = request({
			headers: { Host: host },
			hostname: url.hostname,
			method: "GET",
			path: "/examples/",
			port: url.port
		}, (response) => {
			response.resume();
			response.once("end", () => {
				resolve(response.statusCode);
			});
		});
		outgoing.once("error", reject);
		outgoing.end();
	});
}

function assertSecurityHeaders(response) {
	for (const [name, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
		assert.equal(response.headers.get(name), value);
	}
	assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/u);
	assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/u);
	assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/u);
}

void test("repository server routes the landing page without weakening its boundary", async () => {
	const server = await startRepositoryServer({ port: 0 });
	try {
		assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/u);

		const root = await fetch(`${server.origin}/`, { redirect: "manual" });
		assert.equal(root.status, 302);
		assert.equal(root.headers.get("location"), "/examples/");
		assertSecurityHeaders(root);

		const landing = await fetch(`${server.origin}/examples/`);
		assert.equal(landing.status, 200);
		assert.match(landing.headers.get("content-type") ?? "", /^text\/html/u);
		assert.match(await landing.text(), /<title>Examples \| Litefold Calendar<\/title>/u);
		assertSecurityHeaders(landing);

		for (const route of EXAMPLE_ROUTES) {
			const example = await fetch(`${server.origin}${route}`);
			assert.equal(example.status, 200, `Expected a runnable example route: ${route}`);
			assert.match(example.headers.get("content-type") ?? "", /^text\/html/u);
			assertSecurityHeaders(example);
		}

		const head = await fetch(`${server.origin}/examples/index.css`, { method: "HEAD" });
		assert.equal(head.status, 200);
		assert.equal(await head.text(), "");
		assert.ok(Number(head.headers.get("content-length")) > 0);
		assertSecurityHeaders(head);

		for (const path of [
			"/package.json",
			"/examples/%2e%2e/package.json",
			"/examples/%2e%2e%2fpackage.json",
			"/examples/x%5c..%5c..%5cpackage.json",
			"/examples/x%5c..%5c..%5c.git%5cHEAD",
			"/examples/index.html%00.txt",
			"/examples/.private",
			"/examples%5cindex.html"
		]) {
			const forbidden = await fetch(`${server.origin}${path}`);
			assert.equal(forbidden.status, 404, `Expected a restricted path: ${path}`);
			assertSecurityHeaders(forbidden);
		}

		const method = await fetch(`${server.origin}/examples/`, { method: "POST" });
		assert.equal(method.status, 405);
		assert.equal(method.headers.get("allow"), "GET, HEAD");
		assertSecurityHeaders(method);

		assert.equal(await requestWithHost(server.origin, "example.invalid"), 400);
	} finally {
		await server.close();
	}
});
