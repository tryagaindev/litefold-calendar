const NON_SENTINEL_PIXEL_VALUE = /(?:^|[\s,(])(?!(?:-?1px)\b)-?(?:\d+(?:\.\d+)?|\.\d+)px\b/iu;

export default {
	extends: ["stylelint-config-standard"],
	ignoreFiles: ["dist/**"],
	referenceFiles: ["src/**/*.css", "examples/**/*.css", "scripts/pages-site/*.css"],
	overrides: [
		{
			files: ["examples/**/*.css", "scripts/pages-site/*.css"],
			rules: {
				"container-name-pattern": "^(?:my-[a-z0-9]+(?:-[a-z0-9]+)*|lfc-(?!(?:developer|pages|responsive-test|test)(?:-|$))[a-z0-9]+(?:-[a-z0-9]+)*)$",
				"custom-property-pattern": "^(?:my-[a-z0-9]+(?:-[a-z0-9]+)*|lfc-(?!(?:developer|pages|responsive-test|test)(?:-|$))[a-z0-9]+(?:-[a-z0-9]+)*)$",
				"font-family-name-quotes": null,
				"keyframes-name-pattern": "^(?:my-[a-z0-9]+(?:-[a-z0-9]+)*|lfc-(?!(?:developer|pages|responsive-test|test)(?:-|$))[a-z0-9]+(?:-[a-z0-9]+)*)$",
				"layer-name-pattern": "^(?:my(?:\\.[a-z0-9]+(?:-[a-z0-9]+)*)*|lfc)$",
				"no-descending-specificity": null,
				"selector-class-pattern": "^(?:litefold-calendar|my-[a-z0-9]+(?:-[a-z0-9]+)*|lfc-(?!(?:developer|pages|responsive-test|test)(?:-|$))[a-z0-9]+(?:-[a-z0-9]+)*)$",
				"selector-id-pattern": "^(?:my-[a-z0-9]+(?:-[a-z0-9]+)*|lfc-(?!(?:developer|pages|responsive-test|test)(?:-|$))[a-z0-9]+(?:-[a-z0-9]+)*)$"
			}
		}
	],
	rules: {
		"alpha-value-notation": null,
		"at-rule-disallowed-list": ["import"],
		"color-function-alias-notation": null,
		"color-function-notation": null,
		"color-hex-length": null,
		"container-name-pattern": [
			"^lfc-[a-z0-9]+(?:-[a-z0-9]+)*$",
			{
				message: "Prefix container names with lfc-."
			}
		],
		"custom-property-empty-line-before": null,
		"custom-property-no-missing-var-function": true,
		"custom-property-pattern": [
			"^lfc-(?:internal-)?[a-z0-9]+(?:-[a-z0-9]+)*$",
			{
				message: "Use the --lfc-* namespace; reserve --lfc-internal-* for unsupported implementation details."
			}
		],
		"declaration-block-no-duplicate-custom-properties": true,
		"declaration-empty-line-before": null,
		"declaration-no-important": true,
		"declaration-property-value-disallowed-list": {
			"/.*/": [NON_SENTINEL_PIXEL_VALUE]
		},
		"declaration-property-value-keyword-no-deprecated": true,
		"font-family-no-duplicate-names": true,
		"function-disallowed-list": ["url"],
		"function-linear-gradient-no-nonstandard-direction": true,
		"function-no-unknown": true,
		"keyframe-declaration-no-important": true,
		"keyframes-name-pattern": [
			"^lfc-[a-z0-9]+(?:-[a-z0-9]+)*$",
			{
				message: "Prefix keyframe names with lfc-."
			}
		],
		"layer-name-pattern": [
			"^lfc(?:\\.[a-z0-9]+(?:-[a-z0-9]+)*)*$",
			{
				message: "Use lfc or an lfc.* cascade layer."
			}
		],
		"media-feature-range-notation": null,
		"no-descending-specificity": true,
		"no-unknown-animations": true,
		"no-unknown-custom-media": true,
		"no-unknown-custom-properties": true,
		"property-no-vendor-prefix": true,
		"selector-class-pattern": [
			"^(?:litefold-calendar|lfc-[a-z0-9]+(?:-[a-z0-9]+)*)$",
			{
				message: "Use litefold-calendar for the public root or prefix internal generated classes with lfc-.",
				resolveNestedSelectors: true
			}
		],
		"selector-disallowed-list": [
			"^:root(?:\\b|\\s|$)",
			"^(?:html|body)(?:\\b|\\s|$)"
		],
		"selector-id-pattern": "^lfc-[a-z0-9]+(?:-[a-z0-9]+)*$",
		"selector-max-id": 0,
		"selector-no-deprecated": true,
		"selector-no-invalid": true,
		"unit-disallowed-list": [
			["px"],
			{
				message: "Use relative units; reserve px for deliberate hairline borders and canonical visually-hidden sentinels."
			}
		],
		"unit-no-unknown": true,
		"value-keyword-case": null
	}
};
