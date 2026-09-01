import { startRepositoryServer } from "../../scripts/serve-repository.mjs";

export default async function globalSetup(config) {
	const baseURL = config.projects.find((project) =>
		typeof project.use.baseURL === "string"
	)?.use.baseURL;
	if (typeof baseURL !== "string") {
		throw new Error("At least one Playwright project must provide a string baseURL.");
	}
	const parsed = new URL(baseURL);
	const port = Number(parsed.port);
	if (parsed.hostname !== "127.0.0.1" || !Number.isSafeInteger(port) || port < 1) {
		throw new Error("Playwright baseURL must use a valid loopback TCP port.");
	}

	const repositoryServer = await startRepositoryServer({ port });
	return async () => {
		await repositoryServer.close();
	};
}
