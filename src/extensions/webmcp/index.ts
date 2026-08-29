import { createRegisteredExtension } from "../../internal/runtime/registered-extension-contract.js";
import type { CalendarExtension } from "../../types.js";
import {
	normalizeCalendarWebMcpOptions,
	type CalendarWebMcpOptions
} from "./configuration.js";
import { activateWebMcp } from "./runtime.js";

export type { CalendarWebMcpOptions } from "./configuration.js";

/** Creates the optional, tree-shakeable first-party WebMCP extension. */
export function webMcp(
	options?: Readonly<CalendarWebMcpOptions>
): CalendarExtension {
	const snapshot = normalizeCalendarWebMcpOptions(options);
	return createRegisteredExtension({
		activate: (context) => activateWebMcp(context, snapshot.toolNamePrefix),
		capabilities: ["document", "navigation", "presentationEvents", "state"],
		id: "webmcp"
	});
}
