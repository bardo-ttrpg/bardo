import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	appendPendingUsageEntry,
	buildPendingBatch,
	loadPendingUsageEntries,
	sha256,
} from "./auth-pending-log";

describe("auth pending NDJSON log", () => {
	test("appends NDJSON entries and builds deterministic batch id", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-pending-log-"));
		const pendingPath = path.join(root, "auth-cache-pending.ndjson");
		const keyHash = "abc123";
		const workspaceId = "/tmp/workspace";

		try {
			await appendPendingUsageEntry({
				pendingPath,
				keyHash,
				workspaceId,
				ts: 1_710_000_000_000,
				tool: "rules_lookup",
				action: "invoke",
				units: 1,
			});
			await appendPendingUsageEntry({
				pendingPath,
				keyHash,
				workspaceId,
				ts: 1_710_000_000_001,
				tool: "session_recap",
				action: "invoke",
				units: 1,
			});

			const entries = await loadPendingUsageEntries({ pendingPath });
			expect(entries).toHaveLength(2);
			expect(entries[0]?.id).toBeDefined();
			expect(entries[1]?.id).toBeDefined();

			const batchA = buildPendingBatch({
				keyHash,
				workspaceId,
				entries,
			});
			const batchB = buildPendingBatch({
				keyHash,
				workspaceId,
				entries,
			});

			expect(batchA.batch_id).toBe(batchB.batch_id);
			expect(batchA.entries).toHaveLength(2);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("hydrates sequence from existing NDJSON entries after process restarts", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-pending-log-"));
		const pendingPath = path.join(root, "auth-cache-pending.ndjson");
		const workspaceId = "/tmp/workspace";

		try {
			await writeFile(
				pendingPath,
				`${JSON.stringify({
					id: "existing-1",
					ts: 1_710_000_000_000,
					tool: "rules_lookup",
					action: "invoke",
					units: 1,
					workspace_id: workspaceId,
				})}\n${JSON.stringify({
					id: "existing-2",
					ts: 1_710_000_000_001,
					tool: "session_recap",
					action: "invoke",
					units: 1,
					workspace_id: workspaceId,
				})}\n`,
				"utf8",
			);

			const appended = await appendPendingUsageEntry({
				pendingPath,
				keyHash: "hash",
				workspaceId,
				ts: 1_710_000_000_002,
				tool: "bardo_workspace_status",
				action: "invoke",
				units: 1,
			});

			expect(appended.id).toBe(
				sha256(
					`${workspaceId}|1710000000002|bardo_workspace_status|invoke|1|3`,
				),
			);
			const entries = await loadPendingUsageEntries({ pendingPath });
			expect(entries).toHaveLength(3);
			expect(entries[2]?.id).toBe(appended.id);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("ignores a trailing partial line and keeps prior valid entries", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-pending-log-"));
		const pendingPath = path.join(root, "auth-cache-pending.ndjson");

		try {
			await writeFile(
				pendingPath,
				`${JSON.stringify({
					id: "one",
					ts: 1,
					tool: "tool_a",
					action: "invoke",
					units: 1,
					workspace_id: "/tmp/workspace",
				})}\n{"id":"broken`,
				"utf8",
			);

			const entries = await loadPendingUsageEntries({ pendingPath });
			expect(entries).toHaveLength(1);
			expect(entries[0]?.id).toBe("one");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("writes one JSON object per line", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-pending-log-"));
		const pendingPath = path.join(root, "auth-cache-pending.ndjson");
		try {
			await appendPendingUsageEntry({
				pendingPath,
				keyHash: "hash",
				workspaceId: "/tmp/workspace",
				ts: 1,
				tool: "tool_a",
				action: "invoke",
				units: 1,
			});
			const raw = await readFile(pendingPath, "utf8");
			expect(raw.trimEnd().split("\n")).toHaveLength(1);
			expect(() => JSON.parse(raw.trim())).not.toThrow();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
