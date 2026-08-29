import type { CalendarDate, CalendarExtension, CalendarState } from "../../types.js";
import { formatCalendarDate } from "../domain/civil-date.js";
import type { NormalizedCalendarEvent } from "../domain/event-normalization.js";
import type {
	RegisteredExtensionNavigationCommit,
	RegisteredExtensionNavigationTarget
} from "./registered-extension-contract.js";
import { RegisteredExtensionEventPager } from "./registered-extension-events.js";
import { RegisteredExtensionManager } from "./registered-extensions.js";
import { CalendarNavigationRevisionTracker } from "./navigation-revision.js";

/** Coordinator providers consumed by the isolated extension host. */
export interface RegisteredExtensionHostOptions<TMetadata> {
	readonly abortControllerConstructor: typeof AbortController;
	readonly document: Document;
	readonly extensions: readonly CalendarExtension[];
	readonly getEventsByDate: (
		this: void
	) => ReadonlyMap<string, readonly NormalizedCalendarEvent<TMetadata>[]>;
	readonly getGeneration: (this: void) => number;
	readonly getSelectedDate: (this: void) => Readonly<CalendarDate>;
	readonly getState: (this: void) => Readonly<CalendarState>;
	readonly hasCurrentSnapshot: (this: void) => boolean;
	readonly isDateAllowed: (this: void, date: Readonly<CalendarDate>) => boolean;
	readonly isLive: (this: void) => boolean;
	readonly performNavigation: (
		this: void,
		target: RegisteredExtensionNavigationTarget,
		navigationRevision: number
	) => void;
	readonly reportFailure: (
		this: void,
		extensionId: string,
		hook: string,
		cause: unknown
	) => void;
}

/** Owns generic extension lifecycle, event projection, and navigation transactions. */
export class RegisteredExtensionHost<TMetadata> {
	private eventPager: RegisteredExtensionEventPager<TMetadata> | null = null;
	private readonly manager: RegisteredExtensionManager;
	private readonly navigation = new CalendarNavigationRevisionTracker();
	private readonly options: Readonly<RegisteredExtensionHostOptions<TMetadata>>;

	public constructor(options: Readonly<RegisteredExtensionHostOptions<TMetadata>>) {
		this.options = options;
		this.manager = new RegisteredExtensionManager({
			abortControllerConstructor: options.abortControllerConstructor,
			document: options.document,
			extensions: options.extensions,
			getGeneration: options.getGeneration,
			getNavigationRevision: () => this.navigation.revision,
			getPresentationEventPage: (date, offset, limit) => {
				this.eventPager ??= new RegisteredExtensionEventPager<TMetadata>();
				return this.eventPager.getPage(
					options.getEventsByDate(),
					date,
					offset,
					limit,
					options.isDateAllowed
				);
			},
			getState: options.getState,
			hasCurrentSnapshot: options.hasCurrentSnapshot,
			isLive: options.isLive,
			navigate: (target) => this.commitNavigation(target),
			reportFailure: options.reportFailure
		});
	}

	public get hasExtensions(): boolean { return this.manager.hasExtensions; }

	public activate(): void { this.manager.activate(); }

	public claimNavigation(navigationRevision?: number): number | null {
		return this.navigation.claim(navigationRevision);
	}

	public isNavigationCurrent(navigationRevision: number): boolean {
		return this.navigation.isCurrent(navigationRevision);
	}

	public notifyStateChanged(): void { this.manager.notifyStateChanged(); }

	public stop(): void { this.manager.stop(); }

	private commitNavigation(
		target: RegisteredExtensionNavigationTarget
	): Readonly<RegisteredExtensionNavigationCommit> {
		const selectedDateBefore = formatCalendarDate(this.options.getSelectedDate());
		const stateBefore = this.options.getState();
		const generationBefore = this.options.getGeneration();
		const navigationRevision = this.navigation.begin();
		try {
			this.options.performNavigation(target, navigationRevision);
		} catch (cause: unknown) {
			this.navigation.cancel(navigationRevision);
			throw cause;
		}
		this.navigation.complete(navigationRevision);
		const generation = this.options.getGeneration();
		const startedLoad = generationBefore !== generation;
		if (this.navigation.isCurrent(navigationRevision) &&
			!startedLoad &&
			this.options.getState() === stateBefore) {
			this.manager.notifyStateChanged();
		}
		return Object.freeze({
			changed: selectedDateBefore !== formatCalendarDate(this.options.getSelectedDate()),
			generation,
			navigationRevision,
			startedLoad
		});
	}
}

/** Creates no persistent host for omitted or empty extension registration. */
export function createRegisteredExtensionHost<TMetadata>(
	options: Readonly<RegisteredExtensionHostOptions<TMetadata>> | null
): RegisteredExtensionHost<TMetadata> | null {
	if (options === null) {
		return null;
	}
	const host = new RegisteredExtensionHost(options);
	return host.hasExtensions ? host : null;
}
