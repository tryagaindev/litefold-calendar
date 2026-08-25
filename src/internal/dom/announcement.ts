import type { CalendarAnnouncement } from "../../types.js";

/** Stable internal live regions used by the calendar announcer. */
export interface CalendarAnnouncementElements {
	readonly assertiveLive: HTMLParagraphElement;
	readonly politeLive: HTMLParagraphElement;
}

/** A prepared live-region update that the coordinator may commit when still current. */
export type CalendarAnnouncementUpdate = (this: void) => void;

/** Presents distinct announcements while leaving scheduling and generation ownership to the coordinator. */
export class CalendarAnnouncementPresenter {
	private lastAnnouncement: Readonly<CalendarAnnouncement> | null = null;

	public constructor(private readonly elements: Readonly<CalendarAnnouncementElements>) {}

	/** Clears both live regions and permits the same announcement to be presented again. */
	public clear(): void {
		this.lastAnnouncement = null;
		this.clearRegions();
	}

	/** Clears the live regions and returns a commit for a distinct announcement. */
	public prepare(
		announcement: Readonly<CalendarAnnouncement>
	): CalendarAnnouncementUpdate | null {
		if (isSameAnnouncement(this.lastAnnouncement, announcement)) {
			return null;
		}
		const snapshot = Object.freeze({ ...announcement });
		this.lastAnnouncement = snapshot;
		this.clearRegions();
		return () => {
			const region = snapshot.politeness === "assertive"
				? this.elements.assertiveLive
				: this.elements.politeLive;
			region.textContent = snapshot.message;
		};
	}

	private clearRegions(): void {
		this.elements.politeLive.textContent = "";
		this.elements.assertiveLive.textContent = "";
	}
}

function isSameAnnouncement(
	previous: Readonly<CalendarAnnouncement> | null,
	next: Readonly<CalendarAnnouncement>
): boolean {
	return previous !== null &&
		previous.message === next.message &&
		previous.politeness === next.politeness;
}
