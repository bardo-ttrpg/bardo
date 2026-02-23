import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseMarkdown } from "../../../domain/markdown/markdown";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import type { AuthContext } from "../../../types/contracts";
import { runPlayerAction } from "./register";

async function makeTempRoot(prefix: string): Promise<string> {
	return mkdtemp(path.join(os.tmpdir(), prefix));
}

function authFor(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

describe("runPlayerAction", () => {
	test("replays idempotent result and avoids duplicate history entries", async () => {
		const root = await makeTempRoot("bardo-player-action-idempotency-");
		const auth = authFor(root);
		const bardoRoot = resolveBardoRoot(root);

		const first = await runPlayerAction({
			auth,
			action: "I explore the old ruins",
			idempotencyKey: "player_action_key_12345",
			guidedSetupEnabled: false,
			nowIso: "2026-02-22T00:00:00.000Z",
		});
		const second = await runPlayerAction({
			auth,
			action: "I explore the old ruins",
			idempotencyKey: "player_action_key_12345",
			guidedSetupEnabled: false,
			nowIso: "2026-02-22T00:00:01.000Z",
		});

		expect(first.success).toBe(true);
		expect(first.idempotentReplay).toBe(false);
		expect(first.requiresSetup).toBe(false);
		expect(second.success).toBe(true);
		expect(second.idempotentReplay).toBe(true);
		expect(second.historyEntry).toBe(first.historyEntry);

		const historyRaw = await readFile(
			path.join(bardoRoot, "state/history.md"),
			"utf8",
		);
		const history = parseMarkdown(historyRaw).content.trim().split("\n");
		expect(history.length).toBe(1);

		await rm(root, { recursive: true, force: true });
	});

	test("can bypass guided setup when feature flag is disabled", async () => {
		const root = await makeTempRoot("bardo-player-action-setup-flag-");
		const auth = authFor(root);

		const result = await runPlayerAction({
			auth,
			action: "I rest at camp",
			guidedSetupEnabled: false,
			nowIso: "2026-02-22T00:00:00.000Z",
		});

		expect(result.success).toBe(true);
		expect(result.requiresSetup).toBe(false);
		expect(result.setupStatus).toBe("complete");

		await rm(root, { recursive: true, force: true });
	});
});
