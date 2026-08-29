import { createRegisteredExtension } from "../../internal/runtime/registered-extension-contract.js";
import { normalizeCalendarWebMcpOptions } from "./configuration.js";
import { activateWebMcp } from "./runtime.js";
/** Creates the optional, tree-shakeable first-party WebMCP extension. */
export function webMcp(options) {
    const snapshot = normalizeCalendarWebMcpOptions(options);
    return createRegisteredExtension({
        activate: (context) => activateWebMcp(context, snapshot.toolNamePrefix),
        capabilities: ["document", "navigation", "presentationEvents", "state"],
        id: "webmcp"
    });
}
//# sourceMappingURL=index.js.map