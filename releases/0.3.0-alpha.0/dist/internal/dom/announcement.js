/** Presents distinct announcements while leaving scheduling and generation ownership to the coordinator. */
export class CalendarAnnouncementPresenter {
    elements;
    lastAnnouncement = null;
    constructor(elements) {
        this.elements = elements;
    }
    /** Clears both live regions and permits the same announcement to be presented again. */
    clear() {
        this.lastAnnouncement = null;
        this.clearRegions();
    }
    /** Clears the live regions and returns a commit for a distinct announcement. */
    prepare(announcement) {
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
    clearRegions() {
        this.elements.politeLive.textContent = "";
        this.elements.assertiveLive.textContent = "";
    }
}
function isSameAnnouncement(previous, next) {
    return previous !== null &&
        previous.message === next.message &&
        previous.politeness === next.politeness;
}
//# sourceMappingURL=announcement.js.map