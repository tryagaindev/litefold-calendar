function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeNpmPackResult(value, expectedPackageName) {
	let result;
	if (Array.isArray(value)) {
		if (value.length !== 1) {
			throw new Error("npm pack must return exactly one package result.");
		}
		[result] = value;
	} else if (isRecord(value)) {
		const keys = Object.keys(value);
		if (keys.length !== 1) {
			throw new Error("npm pack must return exactly one package result.");
		}
		const [packageName] = keys;
		if (packageName !== expectedPackageName) {
			throw new Error("npm pack object result must be keyed by the expected package name.");
		}
		result = value[packageName];
	} else {
		throw new Error("npm pack returned an unsupported JSON result shape.");
	}

	if (!isRecord(result)) {
		throw new Error("npm pack returned a malformed package result.");
	}
	if (result.name !== expectedPackageName) {
		throw new Error("npm pack result name must match the expected package name.");
	}
	return result;
}
