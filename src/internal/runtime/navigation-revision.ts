/** Tracks calendar-wide navigation ownership for public and registered-extension navigation. */
export class CalendarNavigationRevisionTracker {
	private currentRevision = 0;
	private nextRevision = 0;

	public get revision(): number { return this.currentRevision; }

	/** Reserves the next revision for a coordinated extension navigation. */
	public begin(): number {
		this.nextRevision += 1;
		return this.nextRevision;
	}

	/** Releases a reservation whose navigation did not commit. */
	public cancel(revision: number): void {
		this.nextRevision = Math.max(this.nextRevision, revision);
	}

	/** Claims ownership for an ordinary or explicitly reserved navigation. */
	public claim(revision?: number): number | null {
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
	public isCurrent(revision: number): boolean { return revision === this.currentRevision; }

	/** Completes a still-current extension navigation, including a valid no-op. */
	public complete(revision: number): void {
		if (revision > this.currentRevision) {
			this.currentRevision = revision;
		}
	}
}
