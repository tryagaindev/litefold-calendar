import { expect, test } from "@playwright/test";

test("preview policy blocks service workers while preserving ordinary runtime requests", async ({ page }) => {
	await page.goto("/examples/");
	const result = await page.evaluate(async () => {
		const metadataResponse = await fetch("/examples/metadata.json");
		const library = await import("/dist/index.js");
		let registrationError = null;
		let registrationSucceeded = false;
		try {
			const registration = await navigator.serviceWorker.register("/dist/index.js", {
				scope: "/dist/",
				type: "module"
			});
			registrationSucceeded = true;
			await registration.unregister();
		} catch (error) {
			registrationError = error instanceof DOMException ? error.name : String(error);
		}
		const registrations = await navigator.serviceWorker.getRegistrations();
		await Promise.all(registrations.map((registration) => registration.unregister()));
		return {
			createCalendarAvailable: typeof library.createCalendar === "function",
			metadataOk: metadataResponse.ok,
			registrationCount: registrations.length,
			registrationError,
			registrationSucceeded
		};
	});

	expect(result).toEqual({
		createCalendarAvailable: true,
		metadataOk: true,
		registrationCount: 0,
		registrationError: "SecurityError",
		registrationSucceeded: false
	});
});
