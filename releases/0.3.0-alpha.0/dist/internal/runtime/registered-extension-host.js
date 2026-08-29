import { formatCalendarDate } from "../domain/civil-date.js";
import { RegisteredExtensionEventPager } from "./registered-extension-events.js";
import { RegisteredExtensionManager } from "./registered-extensions.js";
import { CalendarNavigationRevisionTracker } from "./navigation-revision.js";
/** Owns generic extension lifecycle, event projection, and navigation transactions. */
export class RegisteredExtensionHost {
    eventPager = null;
    manager;
    navigation = new CalendarNavigationRevisionTracker();
    options;
    constructor(options) {
        this.options = options;
        this.manager = new RegisteredExtensionManager({
            abortControllerConstructor: options.abortControllerConstructor,
            document: options.document,
            extensions: options.extensions,
            getGeneration: options.getGeneration,
            getNavigationRevision: () => this.navigation.revision,
            getPresentationEventPage: (date, offset, limit) => {
                this.eventPager ??= new RegisteredExtensionEventPager();
                return this.eventPager.getPage(options.getEventsByDate(), date, offset, limit, options.isDateAllowed);
            },
            getState: options.getState,
            hasCurrentSnapshot: options.hasCurrentSnapshot,
            isLive: options.isLive,
            navigate: (target) => this.commitNavigation(target),
            reportFailure: options.reportFailure
        });
    }
    get hasExtensions() { return this.manager.hasExtensions; }
    activate() { this.manager.activate(); }
    claimNavigation(navigationRevision) {
        return this.navigation.claim(navigationRevision);
    }
    isNavigationCurrent(navigationRevision) {
        return this.navigation.isCurrent(navigationRevision);
    }
    notifyStateChanged() { this.manager.notifyStateChanged(); }
    stop() { this.manager.stop(); }
    commitNavigation(target) {
        const selectedDateBefore = formatCalendarDate(this.options.getSelectedDate());
        const stateBefore = this.options.getState();
        const generationBefore = this.options.getGeneration();
        const navigationRevision = this.navigation.begin();
        try {
            this.options.performNavigation(target, navigationRevision);
        }
        catch (cause) {
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
export function createRegisteredExtensionHost(options) {
    if (options === null) {
        return null;
    }
    const host = new RegisteredExtensionHost(options);
    return host.hasExtensions ? host : null;
}
//# sourceMappingURL=registered-extension-host.js.map