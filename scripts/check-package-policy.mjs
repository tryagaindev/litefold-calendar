import { readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";

import ts from "typescript";

import { listFiles } from "./lib/files.mjs";
import {
    isSupportedNodeVersion,
    SUPPORTED_NODE_RANGE,
    SUPPORTED_NODE_SELECTOR
} from "./lib/node-version.mjs";
import { normalizeNpmPackResult } from "./lib/npm-pack-result.mjs";
import { REPOSITORY_ROOT, runNpm } from "./lib/process.mjs";

const FORBIDDEN_DEPENDENCY_FIELDS = [
    "dependencies",
    "peerDependencies",
    "peerDependenciesMeta",
    "optionalDependencies",
    "bundledDependencies",
    "bundleDependencies"
];
const FORBIDDEN_LIFECYCLE_SCRIPTS = [
    "predependencies",
    "dependencies",
    "postdependencies",
    "preinstall",
    "install",
    "postinstall",
    "prepublish",
    "prepublishOnly",
    "preprepare",
    "prepare",
    "postprepare",
    "prepack",
    "postpack",
    "publish",
    "postpublish",
    "preversion",
    "version",
    "postversion"
];
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const EXPECTED_PACKAGE_NAME = "@tryagaindev/litefold-calendar";
const EXPECTED_REPOSITORY = "git+https://github.com/tryagaindev/litefold-calendar.git";
const EXPECTED_EXPORTS = Object.freeze({
    ".": Object.freeze({
        default: "./dist/index.js",
        import: "./dist/index.js",
        types: "./dist/index.d.ts"
    }),
    "./styles.css": Object.freeze({
        default: "./dist/styles.css",
        types: "./dist/styles.css.d.ts"
    })
});
const EXPECTED_PUBLISH_CONFIG = Object.freeze({
    access: "public",
    provenance: true,
    tag: "alpha"
});
const RELEASE_NODE_VERSION = "24.19.0";
const ALPHA_VERSION = /^0\.\d+\.\d+-alpha\.\d+$/u;
const PUBLIC_ROOT_CLASS = "litefold-calendar";
const PUBLIC_ROOT_SELECTOR = `:where(.${PUBLIC_ROOT_CLASS})`;
const ROOT_ATTRIBUTE_SELECTOR = /\[\s*data-(?:lfc|litefold)-calendar\s*(?=\]|[~|^$*]?=)/iu;
const FORBIDDEN_DOM_PROPERTIES = new Set([
    "cssText",
    "innerHTML",
    "outerHTML",
    "srcdoc"
]);
const FORBIDDEN_HTML_METHODS = new Set([
    "createHTMLDocument",
    "createContextualFragment",
    "insertAdjacentHTML",
    "parseFromString",
    "parseHTML",
    "parseHTMLUnsafe",
    "setHTML",
    "setHTMLUnsafe"
]);
const FORBIDDEN_INTERPRETED_ELEMENTS = new Set(["script", "style"]);
const FORBIDDEN_NETWORK_CONSTRUCTORS = new Set([
    "Audio",
    "EventSource",
    "Image",
    "Request",
    "RTCPeerConnection",
    "SharedWorker",
    "WebSocket",
    "WebSocketStream",
    "WebTransport",
    "Worker",
    "XMLHttpRequest"
]);
const FORBIDDEN_URL_ATTRIBUTES = new Set([
    "action",
    "data",
    "formaction",
    "href",
    "manifest",
    "ping",
    "poster",
    "src",
    "srcdoc",
    "srcset",
    "style",
    "xlink:href"
]);
const errors = [];

function addError(message) {
    errors.push(message);
}

function isExactValue(actual, expected) {
    if (Array.isArray(expected)) {
        return Array.isArray(actual) &&
            actual.length === expected.length &&
            expected.every((value, index) => isExactValue(actual[index], value));
    }

    if (expected !== null && typeof expected === "object") {
        if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
            return false;
        }

        const actualKeys = Object.keys(actual).sort();
        const expectedKeys = Object.keys(expected).sort();
        return isExactValue(actualKeys, expectedKeys) &&
            expectedKeys.every((key) => isExactValue(actual[key], expected[key]));
    }

    return Object.is(actual, expected);
}

async function readJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
}

const PACKED_MODULES = (await listFiles(join(REPOSITORY_ROOT, "src")))
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".d.ts"))
    .map((path) => relative(join(REPOSITORY_ROOT, "src"), path)
        .replaceAll("\\", "/")
        .replace(/\.ts$/u, ""))
    .sort((left, right) => left.localeCompare(right, "en"));

const PACKED_MODULE_SET = new Set(PACKED_MODULES);

const ALLOWED_PACKED_FILES = new Set([
    "LICENSE",
    "README.md",
    "package.json",
    "dist/styles.css",
    "dist/styles.css.d.ts",
    ...PACKED_MODULES.flatMap((moduleName) => [
        `dist/${moduleName}.d.ts`,
        `dist/${moduleName}.d.ts.map`,
        `dist/${moduleName}.js`,
        `dist/${moduleName}.js.map`
    ])
]);

function isRelativeSpecifier(specifier) {
    return specifier.startsWith("./") || specifier.startsWith("../");
}

function getNodeLocation(path, sourceFile, nodeOrPosition) {
    const position = typeof nodeOrPosition === "number"
        ? nodeOrPosition
        : nodeOrPosition.getStart(sourceFile);

    const location = sourceFile.getLineAndCharacterOfPosition(position);

    return `${relative(REPOSITORY_ROOT, path)}:${String(location.line + 1)}:${String(location.character + 1)}`;
}

function addNodeError(path, sourceFile, nodeOrPosition, message) {
    addError(`${getNodeLocation(path, sourceFile, nodeOrPosition)} ${message}`);
}

function getAccessName(expression) {
    if (ts.isPropertyAccessExpression(expression)) {
        return expression.name.text;
    }

    if (ts.isElementAccessExpression(expression) &&
        expression.argumentExpression !== undefined &&
        ts.isStringLiteralLike(expression.argumentExpression)) {
        return expression.argumentExpression.text;
    }

    return undefined;
}

function isGlobalAccess(expression, name) {
    if (ts.isIdentifier(expression)) {
        return expression.text === name;
    }

    if ((!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) ||
        getAccessName(expression) !== name) {
        return false;
    }

    return ts.isIdentifier(expression.expression) &&
        ["globalThis", "self", "window"].includes(expression.expression.text);
}

function isStringExpression(expression) {
    return ts.isStringLiteralLike(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression) ||
        ts.isTemplateExpression(expression);
}

function isInlineStyleMutationTarget(expression) {
    if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) {
        return false;
    }

    return getAccessName(expression) === "style" ||
        getAccessName(expression.expression) === "style";
}

function inspectModuleSpecifier(path, sourceFile, node, specifier, kind) {
    if (!isRelativeSpecifier(specifier)) {
        addNodeError(
            path,
            sourceFile,
            node,
            `${kind} external module ${JSON.stringify(specifier)}.`
        );
    }
}

function inspectImports(path, sourceFile, declaration) {
    const visit = (node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier !== undefined &&
            ts.isStringLiteralLike(node.moduleSpecifier)) {
            inspectModuleSpecifier(
                path,
                sourceFile,
                node.moduleSpecifier,
                node.moduleSpecifier.text,
                "imports"
            );
        } else if (ts.isImportEqualsDeclaration(node) &&
            ts.isExternalModuleReference(node.moduleReference) &&
            node.moduleReference.expression !== undefined &&
            ts.isStringLiteralLike(node.moduleReference.expression)) {
            inspectModuleSpecifier(
                path,
                sourceFile,
                node.moduleReference.expression,
                node.moduleReference.expression.text,
                "imports"
            );
        } else if (ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteralLike(node.argument.literal)) {
            inspectModuleSpecifier(
                path,
                sourceFile,
                node.argument,
                node.argument.literal.text,
                "references"
            );
        } else if (ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const specifier = node.arguments[0];

            if (specifier === undefined || !ts.isStringLiteralLike(specifier)) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    "contains a non-literal dynamic import."
                );
            } else {
                inspectModuleSpecifier(
                    path,
                    sourceFile,
                    specifier,
                    specifier.text,
                    "dynamically imports"
                );
            }
        }

        ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    if (declaration) {
        for (const reference of sourceFile.typeReferenceDirectives) {
            addNodeError(
                path,
                sourceFile,
                reference.pos,
                `references external declaration package ${JSON.stringify(reference.fileName)}.`
            );
        }

        for (const reference of sourceFile.referencedFiles) {
            if (!isRelativeSpecifier(reference.fileName)) {
                addNodeError(
                    path,
                    sourceFile,
                    reference.pos,
                    `references non-relative declaration path ${JSON.stringify(reference.fileName)}.`
                );
            }
        }
    }
}

function inspectSecuritySinks(path, sourceFile) {
    const visit = (node) => {
        const accessName =
            ts.isPropertyAccessExpression(node) ||
            ts.isElementAccessExpression(node)
                ? getAccessName(node)
                : undefined;

        if (accessName !== undefined &&
            FORBIDDEN_DOM_PROPERTIES.has(accessName)) {
            addNodeError(
                path,
                sourceFile,
                node,
                `uses prohibited interpreted-DOM property ${accessName}.`
            );
        }

        if (ts.isCallExpression(node)) {
            const callName = getAccessName(node.expression);

            const receiver =
                ts.isPropertyAccessExpression(node.expression) ||
                ts.isElementAccessExpression(node.expression)
                    ? node.expression.expression.getText(sourceFile)
                    : undefined;

            if (isGlobalAccess(node.expression, "eval") ||
                isGlobalAccess(node.expression, "Function")) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    "uses dynamic code evaluation."
                );
            }

            if (isGlobalAccess(node.expression, "fetch") ||
                isGlobalAccess(node.expression, "importScripts")) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    "uses a package-owned runtime network API."
                );
            }

            if (callName !== undefined &&
                FORBIDDEN_HTML_METHODS.has(callName)) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    `uses prohibited HTML-string method ${callName}.`
                );
            }

            if (callName === "setAttribute" ||
                callName === "setAttributeNS") {
                const attributeIndex =
                    callName === "setAttribute"
                        ? 0
                        : 1;

                const attribute = node.arguments[attributeIndex];

                if (attribute === undefined ||
                    !ts.isStringLiteralLike(attribute)) {
                    addNodeError(
                        path,
                        sourceFile,
                        node,
                        "uses a dynamic DOM attribute name."
                    );
                } else {
                    const name = attribute.text.toLowerCase();

                    if (name.startsWith("on") ||
                        FORBIDDEN_URL_ATTRIBUTES.has(name)) {
                        addNodeError(
                            path,
                            sourceFile,
                            node,
                            `uses prohibited string/URL attribute sink ${JSON.stringify(attribute.text)}.`
                        );
                    }
                }
            }

            if ((callName === "removeProperty" ||
                    callName === "setProperty") &&
                receiver !== undefined &&
                (receiver === "style" ||
                    receiver.endsWith(".style"))) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    "uses a prohibited inline style mutation."
                );
            }

            if ((callName === "write" ||
                    callName === "writeln") &&
                receiver !== undefined &&
                [
                    "document",
                    "globalThis.document",
                    "this.document",
                    "window.document"
                ].includes(receiver)) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    `uses prohibited document.${callName}().`
                );
            }

            if (callName === "sendBeacon" &&
                receiver !== undefined &&
                [
                    "globalThis.navigator",
                    "navigator",
                    "window.navigator"
                ].includes(receiver)) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    "uses package-owned navigator.sendBeacon()."
                );
            }

            if (callName === "open" &&
                receiver !== undefined &&
                [
                    "document",
                    "globalThis",
                    "globalThis.document",
                    "window",
                    "window.document"
                ].includes(receiver)) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    "uses a prohibited window/document navigation sink."
                );
            }

            if ((callName === "assign" ||
                    callName === "replace") &&
                receiver !== undefined &&
                [
                    "document.location",
                    "globalThis.location",
                    "location",
                    "window.location"
                ].includes(receiver)) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    "uses a prohibited location navigation sink."
                );
            }

            if ((callName === "pushState" ||
                    callName === "replaceState") &&
                receiver !== undefined &&
                [
                    "globalThis.history",
                    "history",
                    "window.history"
                ].includes(receiver)) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    "uses a prohibited history navigation sink."
                );
            }

            if ((isGlobalAccess(node.expression, "setInterval") ||
                    isGlobalAccess(node.expression, "setTimeout")) &&
                node.arguments[0] !== undefined &&
                isStringExpression(node.arguments[0])) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    "uses a string timer handler."
                );
            }

            if ((callName === "createElement" ||
                    callName === "createElementNS") &&
                node.arguments.length > 0) {
                const elementName =
                    node.arguments[
                        callName === "createElement"
                            ? 0
                            : 1
                        ];

                if (elementName !== undefined &&
                    ts.isStringLiteralLike(elementName) &&
                    FORBIDDEN_INTERPRETED_ELEMENTS.has(
                        elementName.text.toLowerCase()
                    )) {
                    addNodeError(
                        path,
                        sourceFile,
                        node,
                        "creates a prohibited script/style element."
                    );
                }
            }
        }

        if (ts.isNewExpression(node)) {
            const constructorName = [
                "Function",
                ...FORBIDDEN_NETWORK_CONSTRUCTORS
            ].find((name) =>
                isGlobalAccess(node.expression, name)
            );

            const description =
                constructorName === "Function"
                    ? "uses dynamic code evaluation"
                    : constructorName === undefined
                        ? undefined
                        : `uses package-owned runtime network constructor ${constructorName}`;

            if (description !== undefined) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    `${description}.`
                );
            }
        }

        if (ts.isBinaryExpression(node) &&
            ts.isAssignmentOperator(node.operatorToken.kind)) {
            const leftName =
                ts.isPropertyAccessExpression(node.left) ||
                ts.isElementAccessExpression(node.left)
                    ? getAccessName(node.left)
                    : undefined;

            const styleMutation =
                isInlineStyleMutationTarget(node.left);

            if (styleMutation) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    "assigns a direct inline style property."
                );
            } else if (leftName !== undefined &&
                (FORBIDDEN_URL_ATTRIBUTES.has(leftName.toLowerCase()) ||
                    leftName === "location") &&
                !(leftName.toLowerCase() === "href" &&
                    !isStringExpression(node.right))) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    `assigns prohibited URL/navigation property ${leftName}.`
                );
            }

            if (leftName !== undefined &&
                leftName.toLowerCase().startsWith("on") &&
                isStringExpression(node.right)) {
                addNodeError(
                    path,
                    sourceFile,
                    node,
                    `assigns string event handler ${leftName}.`
                );
            }
        }

        if (((ts.isPrefixUnaryExpression(node) &&
                    (node.operator === ts.SyntaxKind.PlusPlusToken ||
                        node.operator === ts.SyntaxKind.MinusMinusToken)) ||
                ts.isPostfixUnaryExpression(node)) &&
            isInlineStyleMutationTarget(node.operand)) {
            addNodeError(
                path,
                sourceFile,
                node,
                "updates a direct inline style property."
            );
        }

        if (ts.isDeleteExpression(node) &&
            isInlineStyleMutationTarget(node.expression)) {
            addNodeError(
                path,
                sourceFile,
                node,
                "deletes a direct inline style property."
            );
        }

        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
}

function inspectScript(path, source, options = {}) {
    const declaration = options.declaration === true;
    const scriptKind =
        path.endsWith(".js")
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;

    const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
    );

    inspectImports(path, sourceFile, declaration);

    if (!declaration) {
        inspectSecuritySinks(path, sourceFile);
    }
}

function splitCssSelectorList(selectorList) {
    const selectors = [];
    let bracketDepth = 0;
    let parenthesisDepth = 0;
    let quote = null;
    let start = 0;

    for (let index = 0;
         index < selectorList.length;
         index += 1) {
        const character = selectorList[index];

        if (quote !== null) {
            if (character === "\\") {
                index += 1;
            } else if (character === quote) {
                quote = null;
            }

            continue;
        }

        if (character === "\"" ||
            character === "'") {
            quote = character;
        } else if (character === "[") {
            bracketDepth += 1;
        } else if (character === "]") {
            bracketDepth = Math.max(
                0,
                bracketDepth - 1
            );
        } else if (character === "(") {
            parenthesisDepth += 1;
        } else if (character === ")") {
            parenthesisDepth = Math.max(
                0,
                parenthesisDepth - 1
            );
        } else if (character === "," &&
            bracketDepth === 0 &&
            parenthesisDepth === 0) {
            selectors.push(
                selectorList.slice(start, index).trim()
            );
            start = index + 1;
        }
    }

    selectors.push(
        selectorList.slice(start).trim()
    );

    return selectors.filter(
        (selector) => selector.length > 0
    );
}

function inspectStyleSelectorScopes(path, source) {
    const blockKinds = [];
    let quote = null;
    let statementStart = 0;

    for (let index = 0;
         index < source.length;
         index += 1) {
        const character = source[index];

        if (quote !== null) {
            if (character === "\\") {
                index += 1;
            } else if (character === quote) {
                quote = null;
            }

            continue;
        }

        if (character === "\"" ||
            character === "'") {
            quote = character;
            continue;
        }

        if (character === ";") {
            statementStart = index + 1;
            continue;
        }

        if (character === "}") {
            blockKinds.pop();
            statementStart = index + 1;
            continue;
        }

        if (character !== "{") {
            continue;
        }

        const prelude =
            source.slice(statementStart, index).trim();

        if (prelude.startsWith("@")) {
            blockKinds.push(
                /^@(?:-[a-z]+-)?keyframes\b/iu.test(prelude)
                    ? "keyframes"
                    : "at-rule"
            );
        } else if (blockKinds.includes("keyframes")) {
            blockKinds.push("keyframe-step");
        } else {
            for (const selector of
                splitCssSelectorList(prelude)) {
                const displaySelector =
                    selector.replace(/\s+/gu, " ");

                if (ROOT_ATTRIBUTE_SELECTOR.test(selector)) {
                    addError(
                        `${relative(REPOSITORY_ROOT, path)} styles through a forbidden root attribute selector: ${displaySelector}.`
                    );
                    continue;
                }

                if (!selector.startsWith(PUBLIC_ROOT_SELECTOR)) {
                    addError(
                        `${relative(REPOSITORY_ROOT, path)} has an unscoped selector: ${displaySelector}.`
                    );
                }
            }

            blockKinds.push("style");
        }

        statementStart = index + 1;
    }
}

function inspectStyles(path, source) {
    const withoutComments =
        source.replace(/\/\*[\s\S]*?\*\//gu, "");

    const checks = [
        [/@import\b/iu, "contains @import"],
        [/@font-face\b/iu, "contains @font-face"],
        [/\burl\s*\(/iu, "contains url()"],
        [
            /\b(?:image|image-set|src)\s*\(|-webkit-image-set\s*\(/iu,
            "contains an external-asset-capable image/source function"
        ],
        [
            /\bpaint\s*\(/iu,
            "requires an external CSS paint worklet"
        ],
        [/!important\b/iu, "contains !important"],
        [
            /(?:^|[},])\s*:root\b/mu,
            "contains a :root selector"
        ],
        [
            /(?:^|[},])\s*(?:html|body)(?:\s|[.#:{[])/mu,
            "contains a global html/body selector"
        ]
    ];

    for (const [pattern, description] of checks) {
        if (pattern.test(withoutComments)) {
            addError(
                `${relative(REPOSITORY_ROOT, path)} ${description}.`
            );
        }
    }

    for (const match of withoutComments.matchAll(
        /--([a-z][a-z0-9-]*)/giu
    )) {
        const name = match[1];

        if (name !== undefined &&
            !name.startsWith("lfc-")) {
            addError(
                `${relative(REPOSITORY_ROOT, path)} uses non-lfc custom property --${name}.`
            );
        }
    }

    for (const match of withoutComments.matchAll(
        /\.([a-z_][a-z0-9_-]*)/giu
    )) {
        const name = match[1];

        if (name !== undefined &&
            name !== PUBLIC_ROOT_CLASS &&
            !name.startsWith("lfc-")) {
            addError(
                `${relative(REPOSITORY_ROOT, path)} uses non-package class .${name}.`
            );
        }
    }

    inspectStyleSelectorScopes(
        path,
        withoutComments
    );
}

function isFullShaActionReference(reference) {
    if (reference.startsWith("./")) {
        return true;
    }

    if (reference.startsWith("docker://")) {
        return /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/iu.test(
            reference
        );
    }

    return /^[^\s@]+@[0-9a-f]{40}$/iu.test(reference);
}

function hasPullRequestTargetTrigger(source) {
    let insideOnMapping = false;

    for (const rawLine of source.split(/\r?\n/u)) {
        const line =
            rawLine.replace(/#.*$/u, "");

        const onDeclaration =
            /^["']?on["']?\s*:\s*(.*)$/u.exec(line);

        if (onDeclaration !== null) {
            const value =
                onDeclaration[1]?.trim() ?? "";

            if (value.length === 0) {
                insideOnMapping = true;
                continue;
            }

            return /\bpull_request_target\b/u.test(
                value
            );
        }

        if (/^\S/u.test(line) &&
            line.trim().length > 0) {
            insideOnMapping = false;
        }

        if (insideOnMapping &&
            /^\s+(?:-\s*)?["']?pull_request_target["']?(?:\s*:|\s*$)/u.test(
                line
            )) {
            return true;
        }
    }

    return false;
}

function countOccurrences(source, value) {
    return source.split(value).length - 1;
}

function normalizeSimpleYamlScalar(value) {
    const trimmed = value.trim();

    if ((trimmed.startsWith("\"") &&
            trimmed.endsWith("\"")) ||
        (trimmed.startsWith("'") &&
            trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function inspectCiWorkflow(source) {
    if (!source.includes("npm run check")) {
        addError(
            ".github/workflows/ci.yml must run the complete npm run check gate."
        );
    }

    if (source.includes("id-token: write") ||
        /\bnpm\s+publish\b/u.test(source)) {
        addError(
            ".github/workflows/ci.yml must not receive npm OIDC authority or publish packages."
        );
    }

    if (!source.includes("npm ci --ignore-scripts")) {
        addError(
            ".github/workflows/ci.yml must install the lockfile with lifecycle scripts disabled."
        );
    }
}

function inspectPublishWorkflow(source) {
    const required = [
        "release:",
        "prerelease == true",
        "git merge-base --is-ancestor HEAD origin/main",
        "npm ci --ignore-scripts",
        "npm run check",
        "npm run package",
        "environment: npm",
        "actions/download-artifact@",
        "sha256sum --check --strict",
        "npm publish",
        "--access public",
        "--tag alpha",
        "--provenance",
        "--ignore-scripts"
    ];

    for (const value of required) {
        if (!source.includes(value)) {
            addError(
                `.github/workflows/publish-alpha.yml must include ${JSON.stringify(value)}.`
            );
        }
    }

    if (countOccurrences(
        source,
        "id-token: write"
    ) !== 1) {
        addError(
            ".github/workflows/publish-alpha.yml must grant id-token: write to exactly one job."
        );
    }

    if (countOccurrences(
        source,
        "npm publish"
    ) !== 1) {
        addError(
            ".github/workflows/publish-alpha.yml must contain exactly one npm publish command."
        );
    }

    if (/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.[A-Za-z0-9_]*npm/iu.test(source)) {
        addError(
            ".github/workflows/publish-alpha.yml must use trusted publishing without an npm token secret."
        );
    }

    const publishJobIndex =
        source.indexOf("\n  publish:\n");

    if (publishJobIndex < 0) {
        addError(
            ".github/workflows/publish-alpha.yml must separate verify and publish jobs."
        );
        return;
    }

    const verifyJob =
        source.slice(0, publishJobIndex);

    const publishJob =
        source.slice(publishJobIndex);

    if (verifyJob.includes("id-token: write")) {
        addError(
            "The release verification job must not receive npm OIDC authority."
        );
    }

    if (!publishJob.includes("needs: verify") ||
        !publishJob.includes("actions: read") ||
        !publishJob.includes("contents: read") ||
        !publishJob.includes("id-token: write")) {
        addError(
            "The publish job must depend on verification and use explicit least-privilege permissions."
        );
    }

    if (publishJob.includes("actions/checkout@") ||
        publishJob.includes("npm ci") ||
        publishJob.includes("npm run ") ||
        publishJob.includes("node scripts/")) {
        addError(
            "The npm OIDC publish job must not check out or execute project source or install project dependencies."
        );
    }

    if (!publishJob.includes(
            "registry-url: https://registry.npmjs.org"
        ) ||
        !publishJob.includes(
            "Download the verified bundle without checking out source"
        )) {
        addError(
            "The publish job must target npmjs and consume only the verified Actions artifact."
        );
    }
}

function inspectWorkflow(path, source) {
    if (hasPullRequestTargetTrigger(source)) {
        addError(
            `${relative(REPOSITORY_ROOT, path)} uses prohibited pull_request_target authority.`
        );
    }

    for (const [index, line] of
        source.split(/\r?\n/u).entries()) {
        const match =
            /^\s*(?:-\s*)?uses:\s*(.+?)\s*(?:#.*)?$/u.exec(
                line
            );

        if (match === null) {
            continue;
        }

        let reference =
            match[1]?.trim() ?? "";

        if ((reference.startsWith("\"") &&
                reference.endsWith("\"")) ||
            (reference.startsWith("'") &&
                reference.endsWith("'"))) {
            reference =
                reference.slice(1, -1);
        }

        if (!isFullShaActionReference(reference)) {
            addError(
                `${relative(REPOSITORY_ROOT, path)}:${String(index + 1)} action reference must use a full commit SHA: ${reference}.`
            );
        }
    }
}

async function inspectSourceTree() {
    const sourceDirectory =
        join(REPOSITORY_ROOT, "src");

    let files;

    try {
        files = await listFiles(
            sourceDirectory
        );
    } catch (error) {
        if (error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT") {
            return;
        }

        throw error;
    }

    for (const path of files) {
        if (path.endsWith(".ts")) {
            inspectScript(
                path,
                await readFile(path, "utf8"),
                {
                    declaration: path.endsWith(".d.ts")
                }
            );
        }
    }
}

async function inspectWorkflowTree(
    expectedEnvironments
) {
    const workflowDirectory =
        join(
            REPOSITORY_ROOT,
            ".github",
            "workflows"
        );

    let files;

    try {
        files = await listFiles(
            workflowDirectory
        );
    } catch (error) {
        if (error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT") {
            return;
        }

        throw error;
    }

    for (const path of files) {
        if (path.endsWith(".yml") ||
            path.endsWith(".yaml")) {
            const source =
                await readFile(path, "utf8");

            const workflowPath =
                relative(REPOSITORY_ROOT, path)
                    .replaceAll("\\", "/");

            inspectWorkflow(path, source);

            if (workflowPath ===
                ".github/workflows/ci.yml") {
                inspectCiWorkflow(source);
            } else if (workflowPath ===
                ".github/workflows/publish-alpha.yml") {
                inspectPublishWorkflow(source);
            }

            const expectedEnvironment =
                expectedEnvironments[workflowPath];

            if (expectedEnvironment === undefined) {
                continue;
            }

            for (const [name, value] of
                Object.entries(expectedEnvironment)) {
                const match = new RegExp(
                    `^\\s*${name}:\\s*([^#]+?)\\s*(?:#.*)?$`,
                    "mu"
                ).exec(source);

                if (match === null) {
                    addError(
                        `${workflowPath} must declare ${name}=${value}.`
                    );
                    continue;
                }

                const actual =
                    normalizeSimpleYamlScalar(
                        match[1] ?? ""
                    );

                if (actual !== value) {
                    addError(
                        `${workflowPath} uses ${name}=${actual}; expected ${value}.`
                    );
                }
            }
        }
    }
}

function inspectPackedFiles(packResult) {
    for (const file of packResult.files ?? []) {
        const path =
            String(file.path)
                .replaceAll("\\", "/");

        if (!ALLOWED_PACKED_FILES.has(path)) {
            addError(
                `Unexpected packed file: ${path}.`
            );
        }
    }

    const packedPaths =
        new Set(
            (packResult.files ?? []).map(
                (file) =>
                    String(file.path)
                        .replaceAll("\\", "/")
            )
        );

    for (const required of
        ALLOWED_PACKED_FILES) {
        if (!packedPaths.has(required)) {
            addError(
                `Required packed file is missing: ${required}.`
            );
        }
    }
}

function inspectSourceMap(path, source) {
    const packagePath =
        relative(REPOSITORY_ROOT, path)
            .replaceAll("\\", "/");

    const mapExtension =
        packagePath.endsWith(".d.ts.map")
            ? ".d.ts.map"
            : packagePath.endsWith(".js.map")
                ? ".js.map"
                : "";

    const moduleName =
        packagePath.startsWith("dist/") &&
        mapExtension.length > 0
            ? packagePath.slice(
                "dist/".length,
                -mapExtension.length
            )
            : "";

    if (!PACKED_MODULE_SET.has(moduleName)) {
        addError(
            `${packagePath} is not an expected published source map.`
        );
        return;
    }

    let sourceMap;

    try {
        sourceMap =
            JSON.parse(source);
    } catch {
        addError(
            `${packagePath} is not valid JSON.`
        );
        return;
    }

    if (sourceMap === null ||
        typeof sourceMap !== "object" ||
        Array.isArray(sourceMap)) {
        addError(
            `${packagePath} must contain a source map object.`
        );
        return;
    }

    const expectedSource =
        relative(
            dirname(path),
            join(
                REPOSITORY_ROOT,
                "src",
                `${moduleName}.ts`
            )
        ).replaceAll("\\", "/");

    const outputExtension =
        mapExtension === ".d.ts.map"
            ? ".d.ts"
            : ".js";

    const outputFile =
        `${moduleName.split("/").at(-1) ?? moduleName}${outputExtension}`;

    if (sourceMap.version !== 3) {
        addError(
            `${packagePath} must use source map version 3.`
        );
    }

    if (sourceMap.file !== outputFile) {
        addError(
            `${packagePath} must identify ${outputFile} as its generated file.`
        );
    }

    if (sourceMap.sourceRoot !== "") {
        addError(
            `${packagePath} must use an empty sourceRoot.`
        );
    }

    if (!isExactValue(
        sourceMap.sources,
        [expectedSource]
    )) {
        addError(
            `${packagePath} sources must resolve only to ${expectedSource}.`
        );
    }

    if (mapExtension === ".js.map" &&
        (!Array.isArray(sourceMap.sourcesContent) ||
            sourceMap.sourcesContent.length !== 1 ||
            typeof sourceMap.sourcesContent[0] !== "string" ||
            sourceMap.sourcesContent[0].length === 0)) {
        addError(
            `${packagePath} must embed sourcesContent for every source.`
        );
    }
}

const packageJson =
    await readJson(
        join(
            REPOSITORY_ROOT,
            "package.json"
        )
    );

const developmentNodeRange =
    packageJson.devEngines?.runtime?.version;

const developmentNpmRange =
    packageJson.devEngines?.packageManager?.version;

const packageManagerMatch =
    /^npm@(\d+\.\d+\.\d+)$/u.exec(
        String(packageJson.packageManager)
    );

const referenceNpmVersion =
    packageManagerMatch?.[1];

if (packageJson.name !== EXPECTED_PACKAGE_NAME) {
    addError(
        `Package name must be ${EXPECTED_PACKAGE_NAME}.`
    );
}

if (!ALPHA_VERSION.test(packageJson.version) ||
    packageJson.private !== false) {
    addError(
        "The manifest must declare a public 0.x.y-alpha.N prerelease."
    );
}

if (packageJson.license !== "MIT") {
    addError(
        "package.json must declare the MIT license."
    );
}

if (typeof packageJson.description !== "string" ||
    packageJson.description.trim().length === 0) {
    addError(
        "package.json must include a non-empty package description."
    );
}

if (packageJson.type !== "module") {
    addError(
        "package.json must declare pure ESM with type=module."
    );
}

if (developmentNodeRange !== SUPPORTED_NODE_RANGE ||
    developmentNpmRange !== ">=11.0.0") {
    addError(
        `Development Node must declare ${SUPPORTED_NODE_RANGE}; npm devEngines must declare >=11.0.0.`
    );
}

if (!isSupportedNodeVersion(
    process.versions.node
)) {
    addError(
        `Policy checks require Node ${SUPPORTED_NODE_RANGE}; running ${process.versions.node}.`
    );
}

if (packageManagerMatch === null) {
    addError(
        "packageManager must select an exact npm semantic version."
    );
}

if (Object.hasOwn(
    packageJson.engines ?? {},
    "npm"
)) {
    addError(
        "The browser package must not constrain a consumer's npm client."
    );
}

if (packageJson.devEngines?.runtime?.name !== "node" ||
    packageJson.devEngines.runtime.onFail !== "warn" ||
    packageJson.devEngines?.packageManager?.name !== "npm" ||
    packageJson.devEngines.packageManager.onFail !== "warn") {
    addError(
        "Development tools must warn for unsupported Node and npm versions without blocking commands."
    );
}

for (const field of
    FORBIDDEN_DEPENDENCY_FIELDS) {
    if (Object.hasOwn(packageJson, field)) {
        addError(
            `Forbidden runtime dependency field exists: ${field}.`
        );
    }
}

for (const script of
    FORBIDDEN_LIFECYCLE_SCRIPTS) {
    if (Object.hasOwn(
        packageJson.scripts ?? {},
        script
    )) {
        addError(
            `Forbidden lifecycle script exists: ${script}.`
        );
    }
}

for (const [name, version] of
    Object.entries(
        packageJson.devDependencies ?? {}
    )) {
    if (typeof version !== "string" ||
        !EXACT_VERSION.test(version)) {
        addError(
            `Development dependency ${name} is not pinned to an exact version.`
        );
    }
}

if (!isExactValue(
    packageJson.exports,
    EXPECTED_EXPORTS
)) {
    addError(
        "Package exports must be the exact root ESM/types API and ./styles.css contract."
    );
}

if (packageJson.types !==
    "./dist/index.d.ts") {
    addError(
        "The package types entry must resolve to ./dist/index.d.ts."
    );
}

if (packageJson.style !==
    "./dist/styles.css") {
    addError(
        "The package style entry must resolve to ./dist/styles.css."
    );
}

if (packageJson.main !==
    "./dist/index.js" ||
    packageJson.module !==
    "./dist/index.js") {
    addError(
        "The package main and module compatibility entries must resolve to ./dist/index.js."
    );
}

const repositoryUrl =
    typeof packageJson.repository === "string"
        ? packageJson.repository
        : packageJson.repository?.url;

if (repositoryUrl !== EXPECTED_REPOSITORY ||
    packageJson.bugs?.url !==
    "https://github.com/tryagaindev/litefold-calendar/issues" ||
    packageJson.homepage !==
    "https://github.com/tryagaindev/litefold-calendar#readme") {
    addError(
        "Package source, issue, and homepage metadata must identify the canonical GitHub repository."
    );
}

if (JSON.stringify(packageJson.files) !==
    JSON.stringify(["dist"])) {
    addError(
        "Only dist/ may be explicitly included in the package."
    );
}

if (JSON.stringify(packageJson.sideEffects) !==
    JSON.stringify(["./dist/styles.css"])) {
    addError(
        "Only the distributed stylesheet may be marked as a side effect."
    );
}

if (!isExactValue(
    packageJson.publishConfig,
    EXPECTED_PUBLISH_CONFIG
)) {
    addError(
        "Public alpha packages require exact public access, provenance, and alpha dist-tag policy."
    );
}

try {
    const packageLock =
        await readJson(
            join(
                REPOSITORY_ROOT,
                "package-lock.json"
            )
        );

    if (packageLock.lockfileVersion !== 3) {
        addError(
            "package-lock.json must use lockfileVersion 3."
        );
    }

    const rootPackage =
        packageLock.packages?.[""];

    if (packageLock.name !== packageJson.name ||
        packageLock.version !== packageJson.version) {
        addError(
            "Lockfile top-level name and version must match package.json."
        );
    }

    if (rootPackage?.name !== packageJson.name ||
        rootPackage?.version !== packageJson.version) {
        addError(
            "Lockfile root package name and version must match package.json."
        );
    }

    if (!isExactValue(
        rootPackage?.devDependencies,
        packageJson.devDependencies
    )) {
        addError(
            "Lockfile root development dependencies must exactly match package.json."
        );
    }

    if (!isExactValue(
        rootPackage?.devEngines,
        packageJson.devEngines
    )) {
        addError(
            "Lockfile root development engines must exactly match package.json."
        );
    }

    if (!isExactValue(
        rootPackage?.engines,
        packageJson.engines
    )) {
        addError(
            "Lockfile root consumer engines must exactly match package.json."
        );
    }

    for (const field of
        FORBIDDEN_DEPENDENCY_FIELDS) {
        if (Object.hasOwn(
            rootPackage ?? {},
            field
        )) {
            addError(
                `Lockfile root contains forbidden runtime field: ${field}.`
            );
        }
    }

    for (const [path, entry] of
        Object.entries(
            packageLock.packages ?? {}
        )) {
        if (path.length > 0 &&
            entry.dev !== true) {
            addError(
                `Lockfile package is not development-only: ${path}.`
            );
        }
    }
} catch (error) {
    if (error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT") {
        addError(
            "package-lock.json is required."
        );
    } else {
        throw error;
    }
}

try {
    const nvmVersion =
        (
            await readFile(
                join(
                    REPOSITORY_ROOT,
                    ".nvmrc"
                ),
                "utf8"
            )
        ).trim();

    if (nvmVersion !==
        SUPPORTED_NODE_SELECTOR) {
        addError(
            `.nvmrc must select the Node ${SUPPORTED_NODE_SELECTOR} release line.`
        );
    }
} catch (error) {
    if (error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT") {
        addError(
            ".nvmrc is required."
        );
    } else {
        throw error;
    }
}

await inspectSourceTree();

await inspectWorkflowTree({
    ".github/workflows/ci.yml": {
        LFC_NODE_MAJOR:
        SUPPORTED_NODE_SELECTOR,
        LFC_NPM_VERSION:
            String(referenceNpmVersion)
    },
    ".github/workflows/publish-alpha.yml": {
        LFC_NODE_VERSION:
        RELEASE_NODE_VERSION,
        LFC_NPM_VERSION:
            String(referenceNpmVersion)
    }
});

const sourceStylePath =
    join(
        REPOSITORY_ROOT,
        "src",
        "styles.css"
    );

try {
    inspectStyles(
        sourceStylePath,
        await readFile(
            sourceStylePath,
            "utf8"
        )
    );
} catch (error) {
    if (!(error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT")) {
        throw error;
    }
}

if (process.argv.includes("--built")) {
    const distDirectory =
        join(
            REPOSITORY_ROOT,
            "dist"
        );

    let builtFiles = [];

    try {
        builtFiles =
            await listFiles(
                distDirectory
            );
    } catch (error) {
        if (error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT") {
            addError(
                "Built package policy requires dist/ to exist."
            );
        } else {
            throw error;
        }
    }

    for (const path of builtFiles) {
        const extension =
            extname(path);

        const source =
            await readFile(
                path,
                "utf8"
            );

        if (extension === ".js") {
            inspectScript(
                path,
                source
            );
        } else if (path.endsWith(".js.map") ||
            path.endsWith(".d.ts.map")) {
            inspectSourceMap(
                path,
                source
            );
        } else if (path.endsWith(".d.ts")) {
            inspectScript(
                path,
                source,
                {
                    declaration: true
                }
            );
        } else if (extension === ".css") {
            inspectStyles(
                path,
                source
            );
        }
    }
}

if (process.argv.includes("--pack")) {
    const result =
        await runNpm(
            [
                "pack",
                "--dry-run",
                "--ignore-scripts",
                "--json"
            ],
            {
                capture: true
            }
        );

    try {
        const packResult =
            normalizeNpmPackResult(
                JSON.parse(result.stdout),
                packageJson.name
            );

        inspectPackedFiles(
            packResult
        );
    } catch (error) {
        addError(
            error instanceof Error
                ? error.message
                : "npm pack returned an invalid JSON result."
        );
    }
}

if (errors.length > 0) {
    for (const error of errors) {
        console.error(
            `- ${error}`
        );
    }

    throw new Error(
        `Package policy failed with ${String(errors.length)} violation(s).`
    );
}

console.log(
    "Package policy passed: Node-major policy, exact npm/development dependencies, and zero runtime dependencies."
);
