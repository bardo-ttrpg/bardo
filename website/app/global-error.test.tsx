import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const globalErrorSource = readFileSync(
	new URL("./global-error.tsx", import.meta.url),
	"utf8",
);

describe("GlobalError", () => {
	test("keeps a root-level fallback document without importing app font modules", () => {
		expect(globalErrorSource).toContain("<html");
		expect(globalErrorSource).not.toContain("siteReading.variable");
		expect(globalErrorSource).not.toContain("siteUi.variable");
		expect(globalErrorSource).not.toContain("siteCode.variable");
		expect(globalErrorSource).toContain('className="bg-background text-foreground"');
		expect(globalErrorSource).toContain("Application Error");
		expect(globalErrorSource).toContain("Something went wrong");
		expect(globalErrorSource).toContain("Try again");
		expect(globalErrorSource).toContain('href="/"');
		expect(globalErrorSource).not.toContain("bg-card");
	});
});
