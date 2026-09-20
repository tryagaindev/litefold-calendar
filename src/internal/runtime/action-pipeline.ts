import type { LitefoldCalendarError } from "../../errors.js";
import type { CalendarMessages } from "../../messages.js";
import { createInternalError } from "./state.js";

interface ActionPipelineOptions {
	readonly canInvoke: () => boolean;
	readonly isLive: () => boolean;
	readonly messages: () => Readonly<CalendarMessages>;
	readonly clearIssue: (name: string) => void;
	readonly report: (name: string, error: LitefoldCalendarError, isCurrent: () => boolean) => void;
}

/** Runs synchronous action bodies and observes promises with per-hook stale-error ownership. */
export class CalendarActionPipeline {
	private readonly generations = new Map<string, number>();
	private readonly options: Readonly<ActionPipelineOptions>;

	public constructor(options: Readonly<ActionPipelineOptions>) { this.options = options; }

	/** Invalidates retained asynchronous actions at teardown or fatal failure. */
	public clear(): void { this.generations.clear(); }

	/** Invokes without awaiting; successful current actions clear only their own issue. */
	public invoke(name: string, action: () => unknown): void {
		if (!this.options.canInvoke()) { return; }
		const generation = (this.generations.get(name) ?? 0) + 1;
		this.generations.set(name, generation);
		const isCurrent = (): boolean => this.options.isLive() && this.generations.get(name) === generation;
		const succeed = (): void => { if (isCurrent()) { this.options.clearIssue(name); } };
		const fail = (cause: unknown): void => {
			const messages = this.options.messages();
			this.options.report(name, createInternalError({
				cause, code: "action-failed", hook: name, recoverable: true, severity: "error",
				stale: !isCurrent(), userMessage: messages.actionErrorMessage, userTitle: messages.actionErrorTitle
			}), isCurrent);
		};
		let result: unknown;
		try { result = action(); } catch (cause: unknown) { fail(cause); return; }
		if (result === undefined) { succeed(); return; }
		void Promise.resolve(result).then(succeed, fail);
	}
}
