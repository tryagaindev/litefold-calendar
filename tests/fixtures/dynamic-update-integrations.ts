import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	type CalendarEvents,
	type CalendarOptions
} from "../../src/index.js";

export interface DynamicFixtureData<TMetadata = unknown> {
	readonly events: CalendarEvents<TMetadata>;
	readonly filter?: (
		this: void,
		event: Readonly<CalendarEventInput<TMetadata>>
	) => boolean;
}

export type DynamicFixtureConfiguration<TMetadata = unknown> =
	Readonly<Omit<CalendarOptions<TMetadata>, "events">>;

export interface DynamicFixtureProps<TMetadata = unknown> {
	readonly configuration: DynamicFixtureConfiguration<TMetadata>;
	readonly data: Readonly<DynamicFixtureData<TMetadata>>;
}

/**
 * A plain TypeScript integration that replaces event input on one instance and
 * recreates the calendar only when construction-time configuration changes.
 */
export class PlainTypeScriptDynamicFixture<TMetadata = unknown> {
	private calendarValue: Calendar<TMetadata> | null = null;
	private configuration: DynamicFixtureConfiguration<TMetadata>;
	private data: Readonly<DynamicFixtureData<TMetadata>>;
	private readonly host: HTMLElement;

	public constructor(host: HTMLElement, props: Readonly<DynamicFixtureProps<TMetadata>>) {
		this.host = host;
		this.configuration = props.configuration;
		this.data = props.data;
		this.calendarValue = this.createAndRender(this.configuration);
	}

	public get calendar(): Calendar<TMetadata> {
		if (this.calendarValue === null) {
			throw new Error("The dynamic-update fixture has been destroyed.");
		}
		return this.calendarValue;
	}

	/** Replaces application-owned event/filter state on the current instance. */
	public replaceData(data: Readonly<DynamicFixtureData<TMetadata>>): void {
		this.data = data;
		this.calendar.setEvents(resolveFixtureEvents(data));
	}

	/**
	 * Recreates the instance for construction-time options. Supplying a valid
	 * initialDate is required when new bounds exclude the previous selection.
	 */
	public replaceConfiguration(
		configuration: DynamicFixtureConfiguration<TMetadata>,
		data: Readonly<DynamicFixtureData<TMetadata>> = this.data
	): void {
		const previous = this.calendar;
		const previousState = previous.getState();
		const restoreFocus = this.host.contains(this.host.ownerDocument.activeElement);
		this.data = data;
		previous.destroy();
		this.calendarValue = null;
		this.configuration = configuration;
		const initialDate = configuration.initialDate ?? previousState.selectedDate;
		this.calendarValue = this.createAndRender({ ...configuration, initialDate });
		if (restoreFocus) {
			this.calendarValue.focusDate(initialDate);
		}
	}

	/** Releases provider work and package-owned DOM. */
	public destroy(): void {
		this.calendarValue?.destroy();
		this.calendarValue = null;
	}

	private createAndRender(configuration: DynamicFixtureConfiguration<TMetadata>): Calendar<TMetadata> {
		const calendar = createCalendar(this.host, {
			...configuration,
			events: resolveFixtureEvents(this.data)
		});
		calendar.render();
		return calendar;
	}
}

/** A React-style commit/effect lifecycle without adding a framework dependency. */
export class ComponentLifecycleDynamicFixture<TMetadata = unknown> {
	private readonly host: HTMLElement;
	private props: Readonly<DynamicFixtureProps<TMetadata>> | null = null;
	private session: PlainTypeScriptDynamicFixture<TMetadata> | null = null;

	public constructor(host: HTMLElement) {
		this.host = host;
	}

	public get calendar(): Calendar<TMetadata> {
		if (this.session === null) {
			throw new Error("The component fixture has not been committed.");
		}
		return this.session.calendar;
	}

	/** Applies one component commit using reference identity as an effect dependency boundary. */
	public commit(props: Readonly<DynamicFixtureProps<TMetadata>>): void {
		if (this.session === null || this.props === null) {
			this.session = new PlainTypeScriptDynamicFixture(this.host, props);
			this.props = props;
			return;
		}
		if (this.props.configuration !== props.configuration) {
			this.session.replaceConfiguration(props.configuration, props.data);
		} else if (this.props.data !== props.data) {
			this.session.replaceData(props.data);
		}
		this.props = props;
	}

	/** Models component-effect cleanup. */
	public unmount(): void {
		this.session?.destroy();
		this.session = null;
		this.props = null;
	}
}

export interface FixtureSignal<TValue> {
	readonly value: TValue;
	set(value: TValue): void;
	subscribe(listener: (value: TValue) => void): () => void;
}

/** Creates the small observable used by the Vue-style reactive fixture. */
export function createFixtureSignal<TValue>(initialValue: TValue): FixtureSignal<TValue> {
	let currentValue = initialValue;
	const listeners = new Set<(value: TValue) => void>();
	return {
		get value(): TValue {
			return currentValue;
		},
		set(value: TValue): void {
			currentValue = value;
			for (const listener of [...listeners]) {
				listener(value);
			}
		},
		subscribe(listener: (value: TValue) => void): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
	};
}

/** A Vue-style watcher lifecycle without adding a framework dependency. */
export class ReactiveLifecycleDynamicFixture<TMetadata = unknown> {
	private readonly disposeWatchers: readonly (() => void)[];
	private readonly session: PlainTypeScriptDynamicFixture<TMetadata>;

	public constructor(
		host: HTMLElement,
		configuration: FixtureSignal<DynamicFixtureConfiguration<TMetadata>>,
		data: FixtureSignal<Readonly<DynamicFixtureData<TMetadata>>>
	) {
		this.session = new PlainTypeScriptDynamicFixture(host, {
			configuration: configuration.value,
			data: data.value
		});
		this.disposeWatchers = [
			configuration.subscribe((next) => {
				this.session.replaceConfiguration(next, data.value);
			}),
			data.subscribe((next) => {
				this.session.replaceData(next);
			})
		];
	}

	public get calendar(): Calendar<TMetadata> {
		return this.session.calendar;
	}

	/** Stops reactive work before destroying the calendar. */
	public dispose(): void {
		for (const dispose of this.disposeWatchers) {
			dispose();
		}
		this.session.destroy();
	}
}

type ProgressiveConfiguration<TMetadata> =
	Readonly<Omit<DynamicFixtureConfiguration<TMetadata>, "fallbackElement">>;

/** Coordinates a server-authored fallback with the same dynamic-data split. */
export class ProgressiveEnhancementDynamicFixture<TMetadata = unknown> {
	private readonly fallbackElement: HTMLElement;
	private readonly session: PlainTypeScriptDynamicFixture<TMetadata>;

	public constructor(
		host: HTMLElement,
		fallbackElement: HTMLElement,
		configuration: ProgressiveConfiguration<TMetadata>,
		data: Readonly<DynamicFixtureData<TMetadata>>
	) {
		this.fallbackElement = fallbackElement;
		this.session = new PlainTypeScriptDynamicFixture(host, {
			configuration: { ...configuration, fallbackElement },
			data
		});
	}

	public get calendar(): Calendar<TMetadata> {
		return this.session.calendar;
	}

	public replaceData(data: Readonly<DynamicFixtureData<TMetadata>>): void {
		this.session.replaceData(data);
	}

	public replaceConfiguration(
		configuration: ProgressiveConfiguration<TMetadata>,
		data: Readonly<DynamicFixtureData<TMetadata>>
	): void {
		this.session.replaceConfiguration({
			...configuration,
			fallbackElement: this.fallbackElement
		}, data);
	}

	public destroy(): void {
		this.session.destroy();
	}
}

function filterEvents<TMetadata>(
	events: readonly CalendarEventInput<TMetadata>[],
	filter: DynamicFixtureData<TMetadata>["filter"]
): readonly CalendarEventInput<TMetadata>[] {
	return filter === undefined ? events : events.filter((event) => filter(event));
}

function resolveFixtureEvents<TMetadata>(
	data: Readonly<DynamicFixtureData<TMetadata>>
): CalendarEvents<TMetadata> {
	if (data.filter === undefined) {
		return data.events;
	}
	return (range) => {
		const result = typeof data.events === "function"
			? data.events(range)
			: data.events;
		if (Array.isArray(result)) {
			return filterEvents(result, data.filter);
		}
		return Promise.resolve(result).then((events) => filterEvents(events, data.filter));
	};
}
