import { runScreenshotAutomation } from "./lib/screenshot-automation.mjs";

await runScreenshotAutomation({ command: process.argv[2] });
