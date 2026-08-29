import assert from "node:assert/strict";
import test from "node:test";

import {
	createCalendar,
	LitefoldCalendarError
} from "../src/index.js";
import {
	REGISTERED_EXTENSION_INTERFACE,
	createRegisteredExtension,
	resolveRegisteredExtension,
	type RegisteredExtensionActivationContext,
	type RegisteredExtensionCapability
} from "../src/internal/runtime/registered-extension-contract.js";
import {
	createRegisteredExtensionProbe,
	setupRegisteredExtensionDom,
	waitForCalendarPhase
} from "./helpers/registered-extensions.js";

const BASE_CONTEXT_KEYS = Object.freeze(["fail", "isLive", "signal"]);
const CAPABILITIES = Object.freeze([
	"document",
	"navigation",
	"presentationEvents",
	"state"
] as const satisfies readonly RegisteredExtensionCapability[]);

void test("registered extension tokens are opaque, frozen, and snapshot their definition", () => {
	const capabilities: RegisteredExtensionCapability[] = ["state"];
	const activate = (): void => undefined;
	const extension = createRegisteredExtension({
		activate,
		capabilities,
		id: "opaque-probe"
	});
	capabilities[0] = "document";

	assert.equal(Object.getPrototypeOf(extension), null);
	assert.equal(Object.isFrozen(extension), true);
	assert.deepEqual(Object.keys(extension), []);
	assert.deepEqual(Object.getOwnPropertyNames(extension), []);
	assert.deepEqual(Object.getOwnPropertySymbols(extension), [REGISTERED_EXTENSION_INTERFACE]);
	const descriptor = Object.getOwnPropertyDescriptor(extension, REGISTERED_EXTENSION_INTERFACE);
	assert.ok(descriptor);
	assert.equal(descriptor.configurable, false);
	assert.equal(descriptor.enumerable, false);
	assert.equal(descriptor.writable, false);

	const resolved = resolveRegisteredExtension(extension);
	assert.ok(resolved);
	assert.equal(Object.isFrozen(resolved), true);
	assert.equal(Object.isFrozen(resolved.capabilities), true);
	assert.equal(resolved.activate, activate);
	assert.equal(resolved.id, "opaque-probe");
	assert.deepEqual(resolved.capabilities, ["state"]);
});

void test("registered extension factories reject unknown and duplicate capabilities", () => {
	for (const capabilities of [
		["unknown" as RegisteredExtensionCapability],
		["state", "state"] as const
	]) {
		assert.throws(
			() => createRegisteredExtension({
				activate: () => undefined,
				capabilities,
				id: "invalid-capability-probe"
			}),
			(error: unknown) => {
				assert.ok(error instanceof TypeError);
				assert.match(error.message, /invalid capability/u);
				return true;
			}
		);
	}
});

void test("calendar admission rejects malformed, forged, and unreadable registered extensions", (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const issued = createRegisteredExtensionProbe({ id: "issued-probe" });
	const issuedDescriptor = Object.getOwnPropertyDescriptor(issued, REGISTERED_EXTENSION_INTERFACE);
	assert.ok(issuedDescriptor);
	const forged = Object.create(null) as object;
	Object.defineProperty(forged, REGISTERED_EXTENSION_INTERFACE, issuedDescriptor);
	const unreadableEntry = new Proxy(Object.create(null) as object, {
		getOwnPropertyDescriptor: () => {
			throw new Error("private entry inspection failure");
		}
	});
	const unreadableArray = new Proxy([issued], {
		get: (target, key, receiver): unknown => {
			if (key === "0") {
				throw new Error("private array inspection failure");
			}
			return Reflect.get(target, key, receiver);
		}
	});
	const cases: readonly Readonly<{ readonly extensions: unknown; readonly name: string }>[] = [
		{ extensions: {}, name: "non-array" },
		{ extensions: [null], name: "null entry" },
		{ extensions: [{}], name: "plain object" },
		{ extensions: [forged], name: "forged token" },
		{ extensions: [unreadableEntry], name: "unreadable token" },
		{ extensions: unreadableArray, name: "unreadable array" }
	];

	for (const testCase of cases) {
		assert.throws(
			() => createCalendar(host, {
				events: [],
				extensions: testCase.extensions as never,
				initialDate: "2026-07-14"
			}),
			(error: unknown) => {
				assert.ok(error instanceof LitefoldCalendarError, testCase.name);
				assert.equal(error.code, "invalid-configuration", testCase.name);
				assert.equal(error.phase, "configuration", testCase.name);
				return true;
			}
		);
		assert.equal(host.childElementCount, 0, `${testCase.name} mutated the host.`);
	}
});

void test("calendar admission rejects repeated tokens and duplicate IDs atomically", (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const first = createRegisteredExtensionProbe({ id: "duplicate-probe" });
	const sameIdentifier = createRegisteredExtensionProbe({ id: "duplicate-probe" });
	const cases = [
		{ extensions: [first, first], name: "same token" },
		{ extensions: [first, sameIdentifier], name: "duplicate identifier" }
	] as const;

	for (const testCase of cases) {
		assert.throws(
			() => createCalendar(host, {
				events: [],
				extensions: testCase.extensions,
				initialDate: "2026-07-14"
			}),
			(error: unknown) => {
				assert.ok(error instanceof LitefoldCalendarError, testCase.name);
				assert.equal(error.code, "invalid-configuration", testCase.name);
				return true;
			}
		);
		assert.equal(host.childElementCount, 0);
	}
});

void test("calendar snapshots the registered extension array during construction", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const activations: string[] = [];
	const first = createRegisteredExtensionProbe({
		activate: () => { activations.push("first"); },
		id: "snapshot-first"
	});
	const replacement = createRegisteredExtensionProbe({
		activate: () => { activations.push("replacement"); },
		id: "snapshot-replacement"
	});
	const extensions = [first];
	const calendar = createCalendar(host, {
		events: [],
		extensions,
		initialDate: "2026-07-14"
	});
	extensions.splice(0, 1, replacement);

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	assert.deepEqual(activations, ["first"]);
	calendar.destroy();
});

void test("distinct registered extensions coexist and one token is reusable across calendars", async (context) => {
	const { dom, host } = setupRegisteredExtensionDom(
		context,
		'<div id="calendar"></div><div id="second-calendar"></div>'
	);
	const secondHost = dom.window.document.querySelector<HTMLElement>("#second-calendar");
	assert.ok(secondHost);
	const activations: string[] = [];
	const sharedContexts: Readonly<RegisteredExtensionActivationContext>[] = [];
	const companionContexts: Readonly<RegisteredExtensionActivationContext>[] = [];
	const shared = createRegisteredExtensionProbe({
		activate: (activationContext) => {
			activations.push("shared");
			sharedContexts.push(activationContext);
		},
		capabilities: ["state"],
		id: "shared-probe"
	});
	const companion = createRegisteredExtensionProbe({
		activate: (activationContext) => {
			activations.push("companion");
			companionContexts.push(activationContext);
		},
		capabilities: ["state"],
		id: "companion-probe"
	});
	const firstCalendar = createCalendar(host, {
		events: [],
		extensions: [shared, companion],
		initialDate: "2026-07-14"
	});
	const secondCalendar = createCalendar(secondHost, {
		events: [],
		extensions: [shared],
		initialDate: "2026-07-14"
	});

	firstCalendar.render();
	secondCalendar.render();
	await Promise.all([
		waitForCalendarPhase(firstCalendar, "ready"),
		waitForCalendarPhase(secondCalendar, "ready")
	]);
	assert.deepEqual(activations, ["shared", "companion", "shared"]);
	assert.equal(sharedContexts.length, 2);
	assert.equal(companionContexts.length, 1);
	assert.notEqual(sharedContexts[0], sharedContexts[1]);
	assert.notEqual(sharedContexts[0]?.signal, sharedContexts[1]?.signal);

	firstCalendar.destroy();
	assert.equal(sharedContexts[0]?.signal.aborted, true);
	assert.equal(companionContexts[0]?.signal.aborted, true);
	assert.equal(sharedContexts[1]?.signal.aborted, false);
	secondCalendar.destroy();
	assert.equal(sharedContexts[1]?.signal.aborted, true);
});

void test("registered extension contexts expose exactly the declared capabilities", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const contexts = new Map<string, Readonly<RegisteredExtensionActivationContext>>();
	const capabilitySets = Array.from(
		{ length: 2 ** CAPABILITIES.length },
		(_, mask) => CAPABILITIES.filter((_capability, index) =>
			Math.floor(mask / (2 ** index)) % 2 === 1)
	);
	const definitions: readonly Readonly<{
		readonly capabilities: readonly RegisteredExtensionCapability[];
		readonly id: string;
	}>[] = capabilitySets.map((capabilities) => ({
		capabilities,
		id: capabilities.length === 0
			? "capability-baseline"
			: `capability-${capabilities.map((capability) => capability.toLowerCase()).join("-")}`
	}));
	const extensions = definitions.map((definition) => createRegisteredExtensionProbe({
		activate: (activationContext) => { contexts.set(definition.id, activationContext); },
		capabilities: definition.capabilities,
		id: definition.id
	}));
	const calendar = createCalendar(host, {
		events: [],
		extensions,
		initialDate: "2026-07-14"
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	assert.equal(contexts.size, definitions.length);
	for (const definition of definitions) {
		const activationContext = contexts.get(definition.id);
		assert.ok(activationContext);
		assert.equal(Object.isFrozen(activationContext), true);
		assert.deepEqual(
			Reflect.ownKeys(activationContext).map(String).sort(),
			[...BASE_CONTEXT_KEYS, ...definition.capabilities].sort(),
			definition.id
		);
		for (const capability of CAPABILITIES) {
			assert.equal(
				Object.hasOwn(activationContext, capability),
				definition.capabilities.includes(capability),
				`${definition.id}: ${capability}`
			);
		}
	}

	const documentContext = contexts.get("capability-document");
	assert.equal(documentContext?.document, host.ownerDocument);
	const navigation = contexts.get("capability-navigation")?.navigation;
	assert.ok(navigation);
	assert.equal(Object.isFrozen(navigation), true);
	assert.deepEqual(Reflect.ownKeys(navigation), ["navigate"]);
	const presentationEvents = contexts.get("capability-presentationevents")?.presentationEvents;
	assert.ok(presentationEvents);
	assert.equal(Object.isFrozen(presentationEvents), true);
	assert.deepEqual(Reflect.ownKeys(presentationEvents), ["getPage"]);
	const state = contexts.get("capability-state")?.state;
	assert.ok(state);
	assert.equal(Object.isFrozen(state), true);
	assert.deepEqual(Reflect.ownKeys(state).sort(), [
		"getGeneration",
		"getNavigationRevision",
		"getState",
		"hasCurrentSnapshot"
	]);
	calendar.destroy();
});
