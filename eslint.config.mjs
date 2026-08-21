import js from "@eslint/js";
import globals from "globals";
import path from "node:path";
import tseslint from "typescript-eslint";

const SOURCE_ROOT = path.resolve(import.meta.dirname, "src");
const PACKAGE_NAME = "litefold-calendar";
const INTERNAL_LAYER_PATTERN = /^internal\/(domain|dom|runtime)(?:\/|$)/u;
const ALLOWED_INTERNAL_DEPENDENCIES = Object.freeze({
	domain: Object.freeze(["domain"]),
	dom: Object.freeze(["domain", "dom"]),
	runtime: Object.freeze(["domain", "dom", "runtime"])
});
const PUBLIC_ROOT_MODULES = Object.freeze({
	domain: new Set(["errors.ts", "types.ts"]),
	dom: new Set(["errors.ts", "icons.ts", "messages.ts", "types.ts"]),
	runtime: new Set(["errors.ts", "icons.ts", "messages.ts", "types.ts"])
});
const PUBLIC_INTERNAL_DEPENDENCIES = Object.freeze({
	"calendar.ts": new Set(["internal/runtime/coordinator.ts"])
});

function normalizeSourcePath(filePath) {
	return path.relative(SOURCE_ROOT, filePath).replaceAll(path.sep, "/");
}

function getInternalLayer(filePath) {
	return INTERNAL_LAYER_PATTERN.exec(normalizeSourcePath(filePath))?.[1] ?? null;
}

function resolveTypeScriptTarget(importerPath, specifier) {
	const resolvedPath = path.resolve(path.dirname(importerPath), specifier);
	if (resolvedPath.endsWith(".js")) {
		return `${resolvedPath.slice(0, -3)}.ts`;
	}
	if (path.extname(resolvedPath).length === 0) {
		return `${resolvedPath}.ts`;
	}
	return resolvedPath;
}

function createArchitectureRule() {
	return {
		meta: {
			type: "problem",
			docs: {
				description: "Enforce public composition, internal dependency direction, and concrete-module imports."
			},
			schema: [],
			messages: {
				barrel: "Internal barrels are not allowed. Import concrete modules directly.",
				facade: "Source modules must not import the package facade '{{specifier}}'. Import a concrete public contract or implementation.",
				layer: "The {{sourceLayer}} layer cannot import the {{targetLayer}} layer through '{{specifier}}'. Allowed internal targets: {{allowedLayers}}.",
				outsideSource: "Relative source imports must remain within src; '{{specifier}}' resolves outside it.",
				publicInternal: "Public contract module '{{source}}' cannot import internal implementation '{{specifier}}'. Allowed internal targets: {{allowedTargets}}.",
				rootModule: "The {{sourceLayer}} layer cannot import root module '{{target}}'. Allowed root modules: {{allowedModules}}.",
				unknownInternal: "Internal module '{{specifier}}' is outside the domain, dom, and runtime layers."
			}
		},
		create(context) {
			const importerPath = context.filename;
			const source = normalizeSourcePath(importerPath);
			const sourceLayer = getInternalLayer(importerPath);

			function checkSource(sourceNode) {
				if (typeof sourceNode.value !== "string") {
					return;
				}
				const specifier = sourceNode.value;
				if (specifier === PACKAGE_NAME || specifier.startsWith(`${PACKAGE_NAME}/`)) {
					context.report({
						node: sourceNode,
						messageId: "facade",
						data: { specifier }
					});
					return;
				}
				if (!specifier.startsWith(".")) {
					return;
				}

				const targetPath = resolveTypeScriptTarget(importerPath, specifier);
				const target = normalizeSourcePath(targetPath);
				if (target === ".." || target.startsWith("../")) {
					context.report({
						node: sourceNode,
						messageId: "outsideSource",
						data: { specifier }
					});
					return;
				}

				if (sourceLayer === null) {
					if (!target.startsWith("internal/")) {
						return;
					}
					const allowedTargets = PUBLIC_INTERNAL_DEPENDENCIES[source] ?? new Set();
					if (!allowedTargets.has(target)) {
						context.report({
							node: sourceNode,
							messageId: "publicInternal",
							data: {
								allowedTargets: [...allowedTargets].join(", ") || "none",
								source,
								specifier
							}
						});
					}
					return;
				}

				if (target === "index.ts") {
					context.report({
						node: sourceNode,
						messageId: "facade",
						data: { specifier }
					});
					return;
				}

				if (target.startsWith("internal/")) {
					const targetLayer = getInternalLayer(targetPath);
					if (targetLayer === null) {
						context.report({
							node: sourceNode,
							messageId: "unknownInternal",
							data: { specifier }
						});
						return;
					}
					const allowedLayers = ALLOWED_INTERNAL_DEPENDENCIES[sourceLayer];
					if (!allowedLayers.includes(targetLayer)) {
						context.report({
							node: sourceNode,
							messageId: "layer",
							data: {
								allowedLayers: allowedLayers.join(", "),
								sourceLayer,
								specifier,
								targetLayer
							}
						});
					}
					return;
				}

				const allowedRootModules = PUBLIC_ROOT_MODULES[sourceLayer];
				if (!allowedRootModules.has(target)) {
					context.report({
						node: sourceNode,
						messageId: "rootModule",
						data: {
							allowedModules: [...allowedRootModules].join(", "),
							sourceLayer,
							target
						}
					});
				}
			}

			return {
				ExportAllDeclaration: (node) => { checkSource(node.source); },
				ExportNamedDeclaration: (node) => {
					if (node.source !== null) {
						checkSource(node.source);
					}
				},
				ImportDeclaration: (node) => { checkSource(node.source); },
				ImportExpression: (node) => { checkSource(node.source); },
				Program: (node) => {
					if (sourceLayer !== null && path.basename(importerPath) === "index.ts") {
						context.report({ node, messageId: "barrel" });
					}
				}
			};
		}
	};
}

const ARCHITECTURE_PLUGIN = Object.freeze({
	rules: Object.freeze({
		"internal-dependency-direction": createArchitectureRule()
	})
});

const TYPE_CHECKED_CONFIGS = [
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked
];

const JAVASCRIPT_RULES = {
	...js.configs.recommended.rules,
	"curly": ["error", "all"],
	"eqeqeq": ["error", "always"],
	"no-eval": "error",
	"no-implied-eval": "error",
	"no-new-func": "error"
};

const TYPE_CHECKED_RULES = {
	"@typescript-eslint/consistent-type-exports": "error",
	"@typescript-eslint/consistent-type-imports": [
		"error",
		{
			prefer: "type-imports",
			fixStyle: "inline-type-imports"
		}
	],
	"@typescript-eslint/no-deprecated": "error",
	"@typescript-eslint/no-explicit-any": "error",
	"@typescript-eslint/no-floating-promises": [
		"error",
		{
			ignoreVoid: true
		}
	],
	"@typescript-eslint/no-misused-promises": [
		"error",
		{
			checksVoidReturn: {
				arguments: true,
				attributes: true
			}
		}
	],
	"@typescript-eslint/no-invalid-void-type": "off",
	"@typescript-eslint/no-unnecessary-condition": "error",
	"@typescript-eslint/restrict-template-expressions": [
		"error",
		{
			allowNumber: true
		}
	],
	"@typescript-eslint/strict-boolean-expressions": "error",
	"complexity": ["error", 20],
	"curly": ["error", "all"],
	"eqeqeq": ["error", "always"],
	"max-lines": [
		"error",
		{
			max: 900,
			skipBlankLines: true,
			skipComments: true
		}
	],
	"no-eval": "error",
	"no-implied-eval": "error",
	"no-new-func": "error"
};

export default tseslint.config(
	{
		ignores: [
			".artifacts/**",
			".test-dist/**",
			"coverage/**",
			"dist/**",
			"node_modules/**",
			"test-results/**"
		]
	},
	{
		files: ["src/**/*.ts"],
		extends: TYPE_CHECKED_CONFIGS,
		languageOptions: {
			parser: tseslint.parser,
			ecmaVersion: 2022,
			sourceType: "module",
			globals: globals.browser,
			parserOptions: {
				project: ["./tsconfig.json"],
				tsconfigRootDir: import.meta.dirname
			}
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error"
		},
		rules: {
			...TYPE_CHECKED_RULES,
			"no-console": "error",
			"no-restricted-properties": [
				"error",
				{
					property: "innerHTML",
					message: "Render untrusted text with textContent or createTextNode."
				},
				{
					property: "outerHTML",
					message: "Do not serialize or inject HTML."
				},
				{
					property: "insertAdjacentHTML",
					message: "Build DOM with typed node APIs."
				}
			]
		}
	},
	{
		files: ["tests/**/*.ts"],
		extends: TYPE_CHECKED_CONFIGS,
		languageOptions: {
			parser: tseslint.parser,
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node
			},
			parserOptions: {
				project: ["./tsconfig.test.json"],
				tsconfigRootDir: import.meta.dirname
			}
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error"
		},
		rules: {
			...TYPE_CHECKED_RULES,
			"@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
			"@typescript-eslint/no-unnecessary-condition": "off",
			"@typescript-eslint/prefer-promise-reject-errors": "off",
			"@typescript-eslint/require-await": "off"
		}
	},
	{
		files: ["src/**/*.ts"],
		plugins: {
			architecture: ARCHITECTURE_PLUGIN
		},
		rules: {
			"architecture/internal-dependency-direction": "error"
		}
	},
	{
		files: ["examples/**/*.ts"],
		extends: TYPE_CHECKED_CONFIGS,
		languageOptions: {
			parser: tseslint.parser,
			ecmaVersion: 2022,
			sourceType: "module",
			globals: globals.browser,
			parserOptions: {
				project: ["./examples/advanced/tsconfig.eslint.json"],
				tsconfigRootDir: import.meta.dirname
			}
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error"
		},
		rules: TYPE_CHECKED_RULES
	},
	{
		files: ["examples/**/*.js", "tests/e2e/**/*.js"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: globals.browser
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error"
		},
		rules: JAVASCRIPT_RULES
	},
	{
		files: ["tests/e2e/**/*.js"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ["examples/classic-script/main.js"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "script",
			globals: globals.browser
		}
	},
	{
		files: ["src/internal/runtime/coordinator.ts"],
		rules: {
			"max-lines": [
				"error",
				{
					max: 2600,
					skipBlankLines: true,
					skipComments: true
				}
			]
		}
	},
	{
		files: ["*.config.mjs", "scripts/**/*.mjs"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: globals.node
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error"
		},
		rules: JAVASCRIPT_RULES
	},
	{
		files: ["scripts/screenshot-scenes.mjs"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	}
);
