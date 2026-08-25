import { verifyAdvancedStyleContracts } from "./advanced-smoke/contracts.mjs";
import { createAdvancedSmokeEnvironment } from "./advanced-smoke/environment.mjs";
import { verifyExamplesLandingPage } from "./advanced-smoke/landing.mjs";
import { runAdvancedSmokeScenarios } from "./advanced-smoke/ordered-scenarios.mjs";
import { verifyRecipeExamples } from "./advanced-smoke/recipes.mjs";

await verifyAdvancedStyleContracts();
await verifyExamplesLandingPage();

const environment = await createAdvancedSmokeEnvironment();
try {
	await runAdvancedSmokeScenarios(environment);
} finally {
	environment.dispose();
}

await verifyRecipeExamples();

console.log("Landing, advanced, and runnable example smoke tests passed in JSDOM.");
