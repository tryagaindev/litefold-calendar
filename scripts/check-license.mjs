import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT } from "./lib/process.mjs";

const EXPECTED_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const license = await readFile(join(REPOSITORY_ROOT, "LICENSE"), "utf8");
const lines = license.split("\n");
const heading = lines.shift();
const blankAfterHeading = lines.shift();
const copyright = lines.shift();
const blankAfterCopyright = lines.shift();
const body = lines.join("\n");

if (heading !== "MIT License" || blankAfterHeading !== "" || blankAfterCopyright !== "") {
    throw new Error("LICENSE must use the canonical MIT heading and spacing.");
}

if (!/^Copyright \(c\) \d{4} \S(?:.*\S)?$/u.test(copyright ?? "")) {
    throw new Error("LICENSE must contain one non-empty copyright holder line with a four-digit year.");
}

if (body !== EXPECTED_BODY) {
    throw new Error("LICENSE body differs from the canonical MIT License text.");
}

console.log("MIT License text is canonical.");
