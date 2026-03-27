import { describe, expect, test } from "bun:test";

import { buttonVariants } from "./button";

describe("shadcn button", () => {
	test("exports button variants for app usage", () => {
		expect(buttonVariants()).toContain("inline-flex");
		expect(buttonVariants({ variant: "outline" })).toContain("border");
		expect(buttonVariants({ size: "icon" })).toContain("size-9");
	});
});
