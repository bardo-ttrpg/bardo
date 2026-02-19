import { describe, expect, test } from "bun:test";
import path from "node:path";
import { resolvePathInsideRoot } from "./filesystem";

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
