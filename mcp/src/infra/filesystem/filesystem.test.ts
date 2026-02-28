import { describe, expect, test } from "bun:test";
import path from "node:path";
import { resolveBardoRoot, resolvePathInsideRoot } from "./filesystem";

describe("resolveBardoRoot", () => {
	test("uses nested bardo directory by default", () => {
		delete process.env.BARDO_WORKSPACE_LAYOUT;
		expect(resolveBardoRoot("/repo/customer-a")).toBe(
			path.resolve("/repo/customer-a", "bardo"),
		);
	});

	test("keeps existing bardo root unchanged in nested mode", () => {
		delete process.env.BARDO_WORKSPACE_LAYOUT;
		expect(resolveBardoRoot("/repo/customer-a/bardo")).toBe(
			"/repo/customer-a/bardo",
		);
	});

	test("uses flat workspace root when BARDO_WORKSPACE_LAYOUT=flat", () => {
		const previous = process.env.BARDO_WORKSPACE_LAYOUT;
		process.env.BARDO_WORKSPACE_LAYOUT = "flat";
		try {
			expect(resolveBardoRoot("/repo/customer-a")).toBe("/repo/customer-a");
		} finally {
			if (previous === undefined) {
				delete process.env.BARDO_WORKSPACE_LAYOUT;
			} else {
				process.env.BARDO_WORKSPACE_LAYOUT = previous;
			}
		}
	});
});

describe("resolvePathInsideRoot", () => {
	test("decodes percent-encoded path segments", () => {
		const root = "/repo/customer-a/bardo";
		const resolved = resolvePathInsideRoot(root, "notes%2Fchapter-1.md");

		expect(resolved).toBe(path.resolve(root, "notes/chapter-1.md"));
	});

	test("rejects percent-encoded traversal attempts", () => {
		expect(() =>
			resolvePathInsideRoot(
				"/repo/customer-a/bardo",
				"%2e%2e%2f%2e%2e%2fsecrets.md",
			),
		).toThrow("Path escapes bardo root");
	});

	test("rejects invalid percent-encoding", () => {
		expect(() =>
			resolvePathInsideRoot("/repo/customer-a/bardo", "bad%E0%A4%A.md"),
		).toThrow("Path contains invalid URL encoding");
	});
});
