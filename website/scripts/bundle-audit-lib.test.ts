import { describe, expect, test } from "bun:test";
import { auditBundleArtifacts } from "./bundle-audit-lib";

describe("auditBundleArtifacts", () => {
	test("passes clean analyzer output", () => {
		const result = auditBundleArtifacts({
			analyzeArtifacts: ["client.html", "edge.html", "nodejs.html"],
			clientChunks: [
				{
					path: "static/chunks/app-home.js",
					bytes: 10_000,
					contents: "console.log('marketing route');",
				},
				{
					path: "static/chunks/app-dashboard.js",
					bytes: 20_000,
					contents: "console.log('dashboard route');",
				},
			],
		});

		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
		expect(result.summary.totalClientChunkBytes).toBe(30_000);
	});

	test("fails when analyzer artifacts are missing", () => {
		const result = auditBundleArtifacts({
			analyzeArtifacts: [],
			clientChunks: [],
		});

		expect(result.errors).toEqual([
			"Missing Next bundle analyzer artifacts. Run the audit through an ANALYZE=true build.",
		]);
	});

	test("warns instead of failing when analyzer artifacts are missing but client chunks exist", () => {
		const result = auditBundleArtifacts({
			analyzeArtifacts: [],
			clientChunks: [
				{
					path: "static/chunks/app-home.js",
					bytes: 10_000,
					contents: "console.log('marketing route');",
				},
			],
		});

		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([
			"Next bundle analyzer artifacts were missing, so the audit used generated client chunks only.",
		]);
	});

	test("fails if client chunks contain the MCP package", () => {
		const result = auditBundleArtifacts({
			analyzeArtifacts: ["client.html"],
			clientChunks: [
				{
					path: "static/chunks/app-dashboard.js",
					bytes: 25_000,
					contents: 'import "@bardo/mcp";',
				},
			],
		});

		expect(result.errors).toEqual([
			"Client bundle leaked @bardo/mcp into static/chunks/app-dashboard.js.",
		]);
	});

	test("fails if client chunks contain the engine package", () => {
		const result = auditBundleArtifacts({
			analyzeArtifacts: ["client.html"],
			clientChunks: [
				{
					path: "static/chunks/app-dashboard.js",
					bytes: 25_000,
					contents: 'import "@bardo/engine";',
				},
			],
		});

		expect(result.errors).toEqual([
			"Client bundle leaked @bardo/engine into static/chunks/app-dashboard.js.",
		]);
	});

	test("warns when public chunks pull Clerk or framer-motion", () => {
		const result = auditBundleArtifacts({
			analyzeArtifacts: ["client.html"],
			clientChunks: [
				{
					path: "static/chunks/app-home.js",
					bytes: 40_000,
					contents: 'import "@clerk/nextjs";',
				},
				{
					path: "static/chunks/app-blog.js",
					bytes: 30_000,
					contents: 'import "framer-motion";',
				},
			],
		});

		expect(result.warnings).toEqual([
			"Public route chunk static/chunks/app-home.js includes Clerk runtime code.",
			"Public route chunk static/chunks/app-blog.js includes framer-motion.",
		]);
	});
});
