import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const globalErrorSource = readFileSync(
	new URL("./global-error.tsx", import.meta.url),
	"utf8",
);

describe("GlobalError", () => {
	test("keeps a root-level fallback document with the shared font contract", () => {
		expect(globalErrorSource).toContain("<html");
		expect(globalErrorSource).toContain("siteReading.variable");
		expect(globalErrorSource).toContain("siteUi.variable");
		expect(globalErrorSource).toContain("siteCode.variable");
		expect(globalErrorSource).toContain("Something went wrong");
		expect(globalErrorSource).toContain("Try again");
	});
});
