import { describe, expect, test } from "bun:test";
import { externalLinkRel, isExternalHref } from "./link-target";

describe("isExternalHref", () => {
	test("detects external web and protocol-relative links", () => {
		expect(isExternalHref("https://cursor.com/")).toBe(true);
		expect(isExternalHref("http://localhost:3000")).toBe(true);
		expect(isExternalHref("//cdn.example.com/file.js")).toBe(true);
	});

	test("keeps app routes and page anchors in the current tab", () => {
		expect(isExternalHref("/docs/install")).toBe(false);
		expect(isExternalHref("#macos-linux")).toBe(false);
		expect(isExternalHref(undefined)).toBe(false);
	});
});

describe("externalLinkRel", () => {
	test("preserves existing rel tokens and adds safe new-tab defaults", () => {
		expect(externalLinkRel("ugc")).toBe("ugc noopener noreferrer");
		expect(externalLinkRel("noopener")).toBe("noopener noreferrer");
	});
});
