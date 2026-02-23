import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseMarkdown } from "../../../domain/markdown/markdown";
import {
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "../../../telemetry";
import { persistStateAndHistory } from "./persistence";

describe("persistStateAndHistory", () => {
	test("records legacy compatibility writes for state and history artifacts", async () => {
		resetTelemetryForTests();
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-init-persist-"));
		const statePath = path.join(root, "state/current.md");
		const historyPath = path.join(root, "state/history.md");

		await persistStateAndHistory({
			statePath,
			historyPath,
			nowIso: "2026-02-23T12:00:00.000Z",
			startingLocationSlug: "starting-area",
			startingLocationName: "Starting Area",
			resolvedDiceRoller: "bardo",
			resolvedTheme: "dark-fantasy",
			startingSceneSource: "user_provided",
		});

		const stateRaw = await readFile(statePath, "utf8");
		const historyRaw = await readFile(historyPath, "utf8");
		expect(parseMarkdown(stateRaw).content).toContain("starting-area");
		expect(parseMarkdown(historyRaw).content).toContain("campaign init");

		const metrics = renderPrometheusMetrics();
		expect(metrics).toContain(
			'bardo_legacy_compat_writes_total{artifact="state_current",consumer="init",strictmode="false"}',
		);
		expect(metrics).toContain(
			'bardo_legacy_compat_writes_total{artifact="state_history",consumer="init",strictmode="false"}',
		);

		await rm(root, { recursive: true, force: true });
	});
});
