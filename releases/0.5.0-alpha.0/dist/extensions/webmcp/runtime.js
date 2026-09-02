import { formatCalendarDate, parseCalendarDate } from "../../internal/domain/civil-date.js";
import { createExecutionSignalResolver } from "./execution-signal.js";
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const GET_EVENTS_TOOL_SUFFIX = "-get-events";
const NAVIGATE_TOOL_SUFFIX = "-navigate";
const EVENT_PAGE_SIZE = 10;
const CURSOR_VERSION = 1;
const MAXIMUM_CURSOR_LENGTH = 512;
const CURSOR_PATTERN = /^lfc\.([0-9a-f]+)$/u;
const CURSOR_INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
let nextFallbackCursorInstance = 0;
const GET_EVENTS_INPUT_SCHEMA = Object.freeze({
    oneOf: Object.freeze([
        Object.freeze({
            additionalProperties: false,
            properties: Object.freeze({
                date: Object.freeze({
                    description: "Optional strict YYYY-MM-DD date filter. Omit it to inspect every event available on allowed dates in the current visible range.",
                    pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
                    type: "string"
                })
            }),
            type: "object"
        }),
        Object.freeze({
            additionalProperties: false,
            properties: Object.freeze({
                cursor: Object.freeze({
                    description: "Opaque continuation cursor returned by a previous get-events result.",
                    maxLength: MAXIMUM_CURSOR_LENGTH,
                    minLength: 1,
                    type: "string"
                })
            }),
            required: Object.freeze(["cursor"]),
            type: "object"
        })
    ]),
    type: "object"
});
const NAVIGATE_INPUT_SCHEMA = Object.freeze({
    oneOf: Object.freeze([
        Object.freeze({
            additionalProperties: false,
            properties: Object.freeze({
                date: Object.freeze({
                    description: "Destination in strict YYYY-MM-DD form.",
                    pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
                    type: "string"
                }),
                target: Object.freeze({ const: "date" })
            }),
            required: Object.freeze(["target", "date"]),
            type: "object"
        }),
        Object.freeze({
            additionalProperties: false,
            properties: Object.freeze({
                target: Object.freeze({
                    enum: Object.freeze(["today", "previous-month", "next-month"])
                })
            }),
            required: Object.freeze(["target"]),
            type: "object"
        })
    ]),
    type: "object"
});
const GET_EVENTS_ANNOTATIONS = Object.freeze({
    readOnlyHint: true,
    untrustedContentHint: true
});
const NAVIGATE_ANNOTATIONS = Object.freeze({ readOnlyHint: false });
/** Activates WebMCP against the exact capabilities declared by its extension definition. */
export function activateWebMcp(context, toolNamePrefix) {
    const document = context.document;
    const navigation = context.navigation;
    const presentationEvents = context.presentationEvents;
    const state = context.state;
    if (document === undefined || navigation === undefined ||
        presentationEvents === undefined || state === undefined) {
        throw new TypeError("The WebMCP extension did not receive its declared capabilities.");
    }
    const controller = new WebMcpController({
        cursorInstanceId: createCursorInstanceId(document),
        fail: context.fail,
        isLive: context.isLive,
        navigation,
        presentationEvents,
        signal: context.signal,
        state,
        toolNamePrefix
    });
    controller.register(document);
    return Object.freeze({
        dispose: () => { controller.dispose(); },
        stateChanged: () => { controller.notifyStateChanged(); }
    });
}
/** Owns WebMCP tools and pending executions for one activated extension instance. */
class WebMcpController {
    options;
    resolveExecutionSignal;
    waiters = new Set();
    isDisposed = false;
    isStateNotificationPending = false;
    lastState;
    navigationSequence = 0;
    constructor(options) {
        this.options = options;
        this.resolveExecutionSignal = createExecutionSignalResolver(options.signal);
        this.lastState = options.state.getState();
    }
    register(document) {
        let modelContext;
        try {
            modelContext = getModelContext(document);
        }
        catch (cause) {
            this.options.fail(cause, "register");
            return;
        }
        if (modelContext === null) {
            return;
        }
        void this.registerTools(modelContext).catch((cause) => {
            if (this.isDisposed || this.options.signal.aborted || !this.options.isLive()) {
                return;
            }
            this.options.fail(cause, "register");
        });
    }
    dispose() {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        for (const waiter of [...this.waiters]) {
            this.removeWaiter(waiter);
            waiter.reject(createAbortError("The calendar was destroyed."));
        }
    }
    notifyStateChanged() {
        if (this.isDisposed || this.isStateNotificationPending) {
            return;
        }
        this.lastState = this.options.state.getState();
        this.isStateNotificationPending = true;
        const settle = () => {
            this.isStateNotificationPending = false;
            for (const waiter of [...this.waiters]) {
                this.settleWaiter(waiter);
            }
        };
        try {
            queueMicrotask(settle);
        }
        catch {
            //A broken optional browser hook must not affect the calendar UI.
            settle();
        }
    }
    async registerTools(modelContext) {
        const registrationOptions = Object.freeze({ signal: this.options.signal });
        await modelContext.registerTool(this.createGetEventsTool(), registrationOptions);
        if (this.options.signal.aborted) {
            return;
        }
        await modelContext.registerTool(this.createNavigateTool(), registrationOptions);
    }
    createGetEventsTool() {
        return Object.freeze({
            annotations: GET_EVENTS_ANNOTATIONS,
            description: `Read up to ${EVENT_PAGE_SIZE.toString()} unique events from this calendar's currently loaded, allowed visible range. Omit date for the whole range, provide date to filter one day, and continue with nextCursor.`,
            execute: (input, options) => this.executeGetEvents(input, this.resolveExecutionSignal(options)),
            inputSchema: GET_EVENTS_INPUT_SCHEMA,
            name: `${this.options.toolNamePrefix}${GET_EVENTS_TOOL_SUFFIX}`,
            title: "Get calendar events"
        });
    }
    createNavigateTool() {
        return Object.freeze({
            annotations: NAVIGATE_ANNOTATIONS,
            description: "Change this calendar's visible and selected date without activating events or application actions.",
            execute: (input, options) => this.executeNavigate(input, this.resolveExecutionSignal(options)),
            inputSchema: NAVIGATE_INPUT_SCHEMA,
            name: `${this.options.toolNamePrefix}${NAVIGATE_TOOL_SUFFIX}`,
            title: "Navigate calendar"
        });
    }
    executeGetEvents(input, signal) {
        if (isExecutionCanceled(signal)) {
            return Promise.reject(createAbortError("The WebMCP tool execution was canceled."));
        }
        const parsedInput = parseGetEventsInput(input);
        if (parsedInput === null) {
            return Promise.resolve(this.createFailure("invalid-input", "Input must contain either an optional strict date or one opaque continuation cursor."));
        }
        if (isExecutionCanceled(signal)) {
            return Promise.reject(createAbortError("The WebMCP tool execution was canceled."));
        }
        if (!this.isLive()) {
            return Promise.resolve(this.createFailure("calendar-unavailable", "The calendar is no longer available."));
        }
        const state = this.readState();
        return Promise.resolve(parsedInput.kind === "cursor"
            ? this.executeCursorGetEvents(parsedInput.cursor, state)
            : this.executeInitialGetEvents(parsedInput.date, state));
    }
    executeInitialGetEvents(date, state) {
        const dateString = date === null ? null : formatCalendarDate(date);
        if (state.range === null || (dateString !== null &&
            (dateString < state.range.start || dateString >= state.range.end))) {
            return this.createFailure("date-outside-visible-range", state.range === null
                ? "The calendar does not have a visible range."
                : "The requested date is outside the current visible range; navigate the calendar first.");
        }
        const dataAvailable = this.options.state.hasCurrentSnapshot();
        if (!dataAvailable) {
            return this.createFailure(state.phase === "unavailable" ? "calendar-unavailable" : "date-not-loaded", state.phase === "unavailable"
                ? "The calendar has no usable event snapshot."
                : "The current visible range does not have a loaded event snapshot yet.");
        }
        const sourcePage = this.options.presentationEvents.getPage(date, 0, EVENT_PAGE_SIZE);
        return this.createVisibleEventsSuccess(sourcePage, dateString, 0, state.range.start, state.range.end, state);
    }
    executeCursorGetEvents(cursor, state) {
        if (!this.options.state.hasCurrentSnapshot()) {
            return state.phase === "unavailable"
                ? this.createFailure("calendar-unavailable", "The calendar has no usable event snapshot.")
                : this.createPaginationStaleFailure();
        }
        const token = parseCursorToken(cursor);
        if (token === null) {
            return this.createFailure("invalid-input", "The pagination cursor is malformed.");
        }
        if (token.instanceId !== this.options.cursorInstanceId) {
            return this.createPaginationStaleFailure();
        }
        const range = state.range;
        if (range?.start !== token.rangeStart || range.end !== token.rangeEnd ||
            token.offset < EVENT_PAGE_SIZE ||
            token.offset % EVENT_PAGE_SIZE !== 0 || (token.dateString !== null &&
            (token.dateString < token.rangeStart || token.dateString >= token.rangeEnd))) {
            return this.createPaginationStaleFailure();
        }
        const sourcePage = this.options.presentationEvents.getPage(token.date, token.offset, EVENT_PAGE_SIZE);
        if (sourcePage.snapshotRevision !== token.snapshotRevision ||
            token.offset >= sourcePage.totalEvents) {
            return this.createPaginationStaleFailure();
        }
        return this.createVisibleEventsSuccess(sourcePage, token.dateString, token.offset, token.rangeStart, token.rangeEnd, state);
    }
    createVisibleEventsSuccess(sourcePage, dateString, offset, rangeStart, rangeEnd, state) {
        const page = sourcePage.events.map((event) => Object.freeze({
            end: event.end,
            isAllDay: event.isAllDay,
            start: event.start,
            title: event.title
        }));
        const totalEvents = sourcePage.totalEvents;
        const nextOffset = offset + page.length < totalEvents
            ? offset + page.length
            : null;
        const nextCursor = nextOffset === null
            ? null
            : createCursor(Object.freeze({
                dateString,
                instanceId: this.options.cursorInstanceId,
                offset: nextOffset,
                rangeEnd,
                rangeStart,
                snapshotRevision: sourcePage.snapshotRevision
            }));
        const result = Object.freeze({
            date: dateString,
            events: Object.freeze(page),
            nextCursor,
            offset,
            ok: true,
            state,
            totalEvents
        });
        return result;
    }
    createPaginationStaleFailure() {
        return this.createFailure("pagination-stale", "The pagination cursor is no longer valid for this calendar state; call get-events again without a cursor.");
    }
    executeNavigate(input, signal) {
        if (isExecutionCanceled(signal)) {
            return Promise.reject(createAbortError("The WebMCP tool execution was canceled."));
        }
        const target = parseNavigateInput(input);
        if (target === null) {
            return Promise.resolve(this.createFailure("invalid-input", "Input must select a date, today, the previous month, or the next month."));
        }
        if (!this.isLive()) {
            return Promise.resolve(this.createFailure("calendar-unavailable", "The calendar is no longer available."));
        }
        if (signal.isAborted()) {
            return Promise.reject(createAbortError("The WebMCP tool execution was canceled."));
        }
        const previousNavigationSequence = this.navigationSequence;
        const navigationSequence = previousNavigationSequence + 1;
        this.navigationSequence = navigationSequence;
        let commit;
        try {
            commit = this.options.navigation.navigate(target);
        }
        catch {
            if (this.navigationSequence === navigationSequence) {
                this.navigationSequence = previousNavigationSequence;
            }
            if (!this.isLive() || isExecutionCanceled(signal)) {
                return Promise.reject(createAbortError("The calendar navigation was interrupted by teardown."));
            }
            return Promise.resolve(this.createFailure("invalid-input", "The requested calendar destination is not available."));
        }
        if (!this.isLive() || isExecutionCanceled(signal)) {
            return Promise.reject(createAbortError("The calendar navigation was interrupted by teardown."));
        }
        for (const waiter of [...this.waiters]) {
            this.settleWaiter(waiter);
        }
        return this.waitForNavigation(commit, navigationSequence, signal);
    }
    waitForNavigation(commit, navigationSequence, signal) {
        if (signal.isAborted()) {
            return Promise.reject(createAbortError("The WebMCP tool execution was canceled."));
        }
        if (!this.isLive()) {
            return Promise.reject(createAbortError("The calendar navigation was interrupted by teardown."));
        }
        if (!commit.startedLoad) {
            if (navigationSequence !== this.navigationSequence ||
                commit.navigationRevision !== this.options.state.getNavigationRevision()) {
                return Promise.resolve(this.createFailure("navigation-superseded", "A newer calendar operation superseded this navigation."));
            }
            const state = this.readState();
            if (!this.isLive()) {
                return Promise.reject(createAbortError("The calendar navigation was interrupted by teardown."));
            }
            if (state.phase === "unavailable") {
                return Promise.resolve(this.createFailure("calendar-unavailable", "The calendar is not currently available."));
            }
            return Promise.resolve(Object.freeze({
                changed: commit.changed,
                ok: true,
                state
            }));
        }
        return new Promise((resolve, reject) => {
            if (!this.isLive()) {
                reject(createAbortError("The calendar navigation was interrupted by teardown."));
                return;
            }
            const onAbort = () => {
                this.removeWaiter(waiter);
                reject(createAbortError("The WebMCP tool execution was canceled."));
            };
            const waiter = {
                changed: commit.changed,
                generation: commit.generation,
                navigationRevision: commit.navigationRevision,
                navigationSequence,
                onAbort,
                reject,
                resolve,
                signal
            };
            if (signal.isAborted()) {
                reject(createAbortError("The WebMCP tool execution was canceled."));
                return;
            }
            signal.addAbortListener(onAbort);
            this.waiters.add(waiter);
            this.settleWaiter(waiter);
        });
    }
    settleWaiter(waiter) {
        if (!this.waiters.has(waiter)) {
            return;
        }
        if (!this.isLive()) {
            this.removeWaiter(waiter);
            waiter.reject(createAbortError("The calendar navigation was interrupted by teardown."));
            return;
        }
        let result = null;
        if (waiter.navigationSequence !== this.navigationSequence ||
            waiter.navigationRevision !== this.options.state.getNavigationRevision() ||
            this.options.state.getGeneration() !== waiter.generation) {
            result = this.createFailure("navigation-superseded", "A newer calendar operation superseded this navigation.");
        }
        else {
            const state = this.readState();
            if (state.phase === "unavailable") {
                result = this.createFailure("calendar-unavailable", "The calendar could not load the requested view.");
            }
            else if (state.phase !== "loading") {
                result = Object.freeze({ changed: waiter.changed, ok: true, state });
            }
        }
        if (result !== null) {
            this.removeWaiter(waiter);
            waiter.resolve(result);
        }
    }
    removeWaiter(waiter) {
        this.waiters.delete(waiter);
        waiter.signal.removeAbortListener(waiter.onAbort);
    }
    createFailure(code, message) {
        return Object.freeze({
            error: Object.freeze({ code, message }),
            ok: false,
            state: this.readState()
        });
    }
    isLive() {
        return !this.isDisposed && !this.options.signal.aborted && this.options.isLive();
    }
    readState() {
        if (this.isLive()) {
            this.lastState = this.options.state.getState();
        }
        return this.lastState;
    }
}
function parseGetEventsInput(input) {
    const keys = getInputKeys(input, new Set(["cursor", "date"]));
    if (keys === null) {
        return null;
    }
    if (keys.has("cursor")) {
        if (keys.size !== 1) {
            return null;
        }
        let cursor;
        try {
            cursor = Reflect.get(input, "cursor");
        }
        catch {
            return null;
        }
        return typeof cursor === "string" && cursor.length <= MAXIMUM_CURSOR_LENGTH &&
            parseCursorToken(cursor) !== null
            ? Object.freeze({ cursor, kind: "cursor" })
            : null;
    }
    let date = null;
    try {
        if (keys.has("date")) {
            const dateValue = Reflect.get(input, "date");
            if (typeof dateValue !== "string" || !DATE_INPUT_PATTERN.test(dateValue)) {
                return null;
            }
            date = parseCalendarDate(dateValue);
            if (date === null) {
                return null;
            }
        }
    }
    catch {
        return null;
    }
    return Object.freeze({ date, kind: "initial" });
}
function parseCursorToken(cursor) {
    const match = CURSOR_PATTERN.exec(cursor);
    const encodedPayload = match?.[1];
    if (encodedPayload === undefined) {
        return null;
    }
    const serializedPayload = decodeAsciiHex(encodedPayload);
    if (serializedPayload === null) {
        return null;
    }
    return parseCursorPayload(serializedPayload);
}
function parseCursorPayload(serializedPayload) {
    let payload;
    try {
        payload = JSON.parse(serializedPayload);
    }
    catch {
        return null;
    }
    if (!Array.isArray(payload) || payload.length !== 8) {
        return null;
    }
    const values = payload;
    if (values[0] !== CURSOR_VERSION) {
        return null;
    }
    const instanceId = parseCursorInstanceId(values[1]);
    const snapshotRevision = parsePositiveSafeInteger(values[2]);
    const rangeStart = parseStrictCursorDate(values[3]);
    const rangeEnd = parseStrictCursorDate(values[4]);
    const scope = parseCursorScope(values[5], values[6]);
    const offset = parsePositiveSafeInteger(values[7]);
    if (instanceId === null || snapshotRevision === null || rangeStart === null ||
        rangeEnd === null || scope === null || offset === null) {
        return null;
    }
    return Object.freeze({
        date: scope.date,
        dateString: scope.dateString,
        instanceId,
        offset,
        rangeEnd: rangeEnd.dateString,
        rangeStart: rangeStart.dateString,
        snapshotRevision
    });
}
function parseCursorInstanceId(value) {
    return typeof value === "string" && CURSOR_INSTANCE_ID_PATTERN.test(value) ? value : null;
}
function parsePositiveSafeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}
function parseStrictCursorDate(value) {
    if (typeof value !== "string" || !DATE_INPUT_PATTERN.test(value)) {
        return null;
    }
    const date = parseCalendarDate(value);
    return date === null ? null : Object.freeze({ date, dateString: value });
}
function parseCursorScope(scope, dateValue) {
    if (scope === "range") {
        return dateValue === null ? Object.freeze({ date: null, dateString: null }) : null;
    }
    if (scope !== "date") {
        return null;
    }
    return parseStrictCursorDate(dateValue);
}
function createCursor(payload) {
    const serializedPayload = JSON.stringify([
        CURSOR_VERSION,
        payload.instanceId,
        payload.snapshotRevision,
        payload.rangeStart,
        payload.rangeEnd,
        payload.dateString === null ? "range" : "date",
        payload.dateString,
        payload.offset
    ]);
    const cursor = `lfc.${encodeAsciiHex(serializedPayload)}`;
    if (cursor.length > MAXIMUM_CURSOR_LENGTH) {
        throw new RangeError("The WebMCP pagination cursor exceeded its internal bound.");
    }
    return cursor;
}
function encodeAsciiHex(value) {
    let encoded = "";
    for (let index = 0; index < value.length; index += 1) {
        encoded += value.charCodeAt(index).toString(16).padStart(2, "0");
    }
    return encoded;
}
function decodeAsciiHex(value) {
    if (value.length === 0 || value.length % 2 !== 0) {
        return null;
    }
    let decoded = "";
    for (let index = 0; index < value.length; index += 2) {
        const code = Number.parseInt(value.slice(index, index + 2), 16);
        if (code > 0x7f) {
            return null;
        }
        decoded += String.fromCharCode(code);
    }
    return decoded;
}
function parseNavigateInput(input) {
    const keys = getInputKeys(input, new Set(["date", "target"]));
    if (keys?.has("target") !== true) {
        return null;
    }
    let target;
    try {
        target = Reflect.get(input, "target");
    }
    catch {
        return null;
    }
    if (target === "date") {
        if (keys.size !== 2 || !keys.has("date")) {
            return null;
        }
        let dateValue;
        try {
            dateValue = Reflect.get(input, "date");
        }
        catch {
            return null;
        }
        if (typeof dateValue !== "string" || !DATE_INPUT_PATTERN.test(dateValue)) {
            return null;
        }
        const date = parseCalendarDate(dateValue);
        return date === null ? null : Object.freeze({ date, target });
    }
    if (keys.size !== 1 ||
        (target !== "today" && target !== "previous-month" && target !== "next-month")) {
        return null;
    }
    return Object.freeze({ target });
}
function getInputKeys(input, allowed) {
    if (!isRecord(input)) {
        return null;
    }
    let keys;
    try {
        if (Array.isArray(input)) {
            return null;
        }
        keys = Reflect.ownKeys(input);
    }
    catch {
        return null;
    }
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
        return null;
    }
    return new Set(keys);
}
function createCursorInstanceId(document) {
    try {
        const crypto = document.defaultView?.crypto;
        if (crypto !== undefined) {
            const randomUuid = Reflect.get(crypto, "randomUUID");
            if (typeof randomUuid === "function") {
                const value = Reflect.apply(randomUuid, crypto, []);
                if (typeof value === "string" && CURSOR_INSTANCE_ID_PATTERN.test(value)) {
                    return value;
                }
            }
            const getRandomValues = Reflect.get(crypto, "getRandomValues");
            if (typeof getRandomValues === "function") {
                const values = new Uint32Array(4);
                Reflect.apply(getRandomValues, crypto, [values]);
                return [...values]
                    .map((value) => value.toString(16).padStart(8, "0"))
                    .join("");
            }
        }
    }
    catch {
        //A nonce prevents accidental cross-instance reuse; it does not grant authority.
    }
    nextFallbackCursorInstance += 1;
    const randomPart = Math.floor(Math.random() * 0x1_0000_0000).toString(36);
    return `fallback_${Date.now().toString(36)}_${randomPart}_${nextFallbackCursorInstance.toString(36)}`;
}
function getModelContext(document) {
    const candidate = Reflect.get(document, "modelContext");
    if (candidate === undefined || candidate === null || !isRecord(candidate)) {
        return null;
    }
    const registerTool = Reflect.get(candidate, "registerTool");
    if (typeof registerTool !== "function") {
        return null;
    }
    const callable = registerTool;
    return Object.freeze({
        registerTool: (tool, options) => Reflect.apply(callable, candidate, [tool, options])
    });
}
function createAbortError(message) {
    return new DOMException(message, "AbortError");
}
function isExecutionCanceled(signal) {
    return signal.isAborted();
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
//# sourceMappingURL=runtime.js.map