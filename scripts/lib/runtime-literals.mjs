const ALLOWED_RUNTIME_URL = "http://www.w3.org/2000/svg";
const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>\\]+/giu;
const IPV4_PATTERN = /(?<![A-Za-z0-9.])(?:\d{1,3}\.){3}\d{1,3}(?![A-Za-z0-9.])/gu;

function getLocation(source, index) {
	let column = index + 1;
	let line = 1;

	for (const match of source.slice(0, index).matchAll(/\r\n?|\n/gu)) {
		line += 1;
		column = index - (match.index + match[0].length) + 1;
	}

	return { column, line };
}

function isIpv4Address(value) {
	return value.split(".").every((part) => Number(part) <= 255);
}

/** Finds URL and IPv4 literals that may not appear in shipped runtime files. */
export function findForbiddenRuntimeLiterals(source) {
	const findings = [];
	const urlRanges = [];

	for (const match of source.matchAll(HTTP_URL_PATTERN)) {
		const value = match[0];
		const index = match.index;
		urlRanges.push([index, index + value.length]);

		if (value !== ALLOWED_RUNTIME_URL) {
			findings.push({
				...getLocation(source, index),
				index,
				kind: "URL",
				value
			});
		}
	}

	for (const match of source.matchAll(IPV4_PATTERN)) {
		const value = match[0];
		const index = match.index;
		const belongsToUrl = urlRanges.some(([start, end]) => index >= start && index < end);

		if (!belongsToUrl && isIpv4Address(value)) {
			findings.push({
				...getLocation(source, index),
				index,
				kind: "IPv4",
				value
			});
		}
	}

	return findings.sort((left, right) => left.index - right.index);
}

/** Formats one runtime-literal policy finding with its exact package path and source location. */
export function formatForbiddenRuntimeLiteral(path, finding) {
	return `${path}:${String(finding.line)}:${String(finding.column)} contains prohibited runtime ${finding.kind} literal ${JSON.stringify(finding.value)}.`;
}
