/** Tracks calendar-wide navigation ownership for public and registered-extension navigation. */
export class CalendarNavigationRevisionTracker {
    currentRevision = 0;
    nextRevision = 0;
    get revision() { return this.currentRevision; }
    /** Reserves the next revision for a coordinated extension navigation. */
    begin() {
        this.nextRevision += 1;
        return this.nextRevision;
    }
    /** Releases a reservation whose navigation did not commit. */
    cancel(revision) {
        this.nextRevision = Math.max(this.nextRevision, revision);
    }
    /** Claims ownership for an ordinary or explicitly reserved navigation. */
    claim(revision) {
        if (revision === undefined) {
            this.nextRevision += 1;
            this.currentRevision = this.nextRevision;
            return this.currentRevision;
        }
        if (revision < this.currentRevision) {
            return null;
        }
        this.currentRevision = revision;
        return revision;
    }
    /** Whether a committed navigation still owns the newest revision. */
    isCurrent(revision) { return revision === this.currentRevision; }
    /** Completes a still-current extension navigation, including a valid no-op. */
    complete(revision) {
        if (revision > this.currentRevision) {
            this.currentRevision = revision;
        }
    }
}
//# sourceMappingURL=navigation-revision.js.map