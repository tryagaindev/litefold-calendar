/** Exercises only the shipped non-Baseline enhancements' fallback paths. */
export async function useBaselineFallbacks(page) {
	await page.addInitScript(() => {
		for (const method of ["showPopover", "hidePopover", "togglePopover"]) {
			Object.defineProperty(HTMLElement.prototype, method, { configurable: true, value: undefined });
		}
		Reflect.deleteProperty(HTMLDialogElement.prototype, "closedBy");
		const supports = CSS.supports.bind(CSS);
		CSS.supports = (...arguments_) => arguments_.some((value) => value.includes("light-dark("))
			? false : supports(...arguments_);
	});
	await page.route("**/*.css", async (route) => {
		const response = await route.fetch();
		const body = (await response.text())
			.replaceAll("light-dark(", "lfc-unsupported-color(")
			.replaceAll(":popover-open", ":lfc-unsupported-popover");
		await route.fulfill({ response, body });
	});
}
