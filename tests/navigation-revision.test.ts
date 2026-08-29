import assert from "node:assert/strict";
import test from "node:test";

import { CalendarNavigationRevisionTracker } from "../src/internal/runtime/navigation-revision.js";

void test("navigation revisions use unique nested reservations and never revive stale owners", () => {
	const tracker = new CalendarNavigationRevisionTracker();
	const outerRevision = tracker.begin();
	const innerRevision = tracker.begin();

	assert.equal(outerRevision, 1);
	assert.equal(innerRevision, 2);
	assert.equal(tracker.claim(innerRevision), innerRevision);
	tracker.complete(innerRevision);
	assert.equal(tracker.revision, innerRevision);
	assert.equal(tracker.claim(outerRevision), null);
	tracker.complete(outerRevision);
	assert.equal(tracker.revision, innerRevision);

	const ordinaryOuterRevision = tracker.begin();
	const ordinaryRevision = tracker.claim();
	assert.equal(ordinaryOuterRevision, 3);
	assert.equal(ordinaryRevision, 4);
	assert.equal(tracker.claim(ordinaryOuterRevision), null);
	assert.equal(tracker.revision, ordinaryRevision);
});

void test("valid no-ops supersede outer reservations while canceled work does not", () => {
	const noOpTracker = new CalendarNavigationRevisionTracker();
	const outerRevision = noOpTracker.begin();
	const noOpRevision = noOpTracker.begin();

	noOpTracker.complete(noOpRevision);
	assert.equal(noOpTracker.revision, noOpRevision);
	assert.equal(noOpTracker.claim(outerRevision), null);

	const canceledTracker = new CalendarNavigationRevisionTracker();
	const survivingRevision = canceledTracker.begin();
	const canceledRevision = canceledTracker.begin();
	canceledTracker.cancel(canceledRevision);

	assert.equal(canceledTracker.revision, 0);
	assert.equal(canceledTracker.claim(survivingRevision), survivingRevision);
	canceledTracker.complete(survivingRevision);
	assert.equal(canceledTracker.revision, survivingRevision);
	assert.equal(canceledTracker.begin(), 3);
});
