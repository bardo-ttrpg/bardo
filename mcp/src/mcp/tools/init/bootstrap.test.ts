import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type BootstrapAnswerKey, runBootstrapStep } from "./bootstrap";
import { resolveInitPaths } from "./paths";

const tempRoots: string[] = [];

async function makeTempRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), prefix));
	tempRoots.push(root);
	return root;
}

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe("runBootstrapStep", () => {
	test("seeds bootstrap artifacts and asks first prompt", async () => {
		const root = await makeTempRoot("bardo-bootstrap-seed-");
		const bardoRoot = path.join(root, "bardo");
		await mkdir(bardoRoot, { recursive: true });
		const paths = resolveInitPaths(bardoRoot);

		const result = await runBootstrapStep({
			paths,
			nowIso: "2026-02-20T00:00:00.000Z",
		});

		expect(result.complete).toBe(false);
		expect(result.requiresUserInput).toBe(true);
		expect(result.pendingQuestionKey).toBe("purpose");
		expect(result.nextPrompt).toContain("What are we building together");

		const agentsRaw = await readFile(paths.agentsPath, "utf8");
		const bootstrapRaw = await readFile(paths.bootstrapPath, "utf8");
		const identityRaw = await readFile(paths.identityPath, "utf8");
		const userRaw = await readFile(paths.userPath, "utf8");

		expect(agentsRaw).toContain("Bootstrap Contract");
		expect(bootstrapRaw).toContain('"initialized": false');
		expect(identityRaw).toContain("Identity");
		expect(userRaw).toContain("User Profile");
	});

	test("progresses one question at a time and removes BOOTSTRAP.md when complete", async () => {
		const root = await makeTempRoot("bardo-bootstrap-progress-");
		const bardoRoot = path.join(root, "bardo");
		await mkdir(bardoRoot, { recursive: true });
		const paths = resolveInitPaths(bardoRoot);

		const orderedAnswers: Array<[BootstrapAnswerKey, string]> = [
			["purpose", "Build a collaborative world simulator with strict canon."],
			["userProfile", "User prefers concise responses and direct edits."],
			["agentProfile", "Agent should challenge weak assumptions politely."],
			["workingPreferences", "One clear plan update every major action."],
			["boundaries", "Never invent persistent facts without syncing files."],
			["successCriteria", "Campaign state remains coherent across sessions."],
		];

		let finalResult: Awaited<ReturnType<typeof runBootstrapStep>> | null = null;
		for (const [questionKey, answer] of orderedAnswers) {
			finalResult = await runBootstrapStep({
				paths,
				nowIso: "2026-02-20T00:00:00.000Z",
				bootstrapAnswers: {
					[questionKey]: answer,
				},
			});
		}

		if (!finalResult) {
			throw new Error("Expected final bootstrap result");
		}

		expect(finalResult.complete).toBe(true);
		expect(finalResult.requiresUserInput).toBe(false);
		expect(finalResult.pendingQuestionKey).toBeNull();
		expect(finalResult.nextPrompt).toBeNull();

		await expect(readFile(paths.bootstrapPath, "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});

		const identityRaw = await readFile(paths.identityPath, "utf8");
		const userRaw = await readFile(paths.userPath, "utf8");
		expect(identityRaw).toContain("Build a collaborative world simulator");
		expect(userRaw).toContain("User prefers concise responses");

		const repeatResult = await runBootstrapStep({
			paths,
			nowIso: "2026-02-21T00:00:00.000Z",
		});
		expect(repeatResult.complete).toBe(true);
		expect(repeatResult.alreadyInitialized).toBe(true);
		expect(repeatResult.requiresUserInput).toBe(false);
	});

	test("does not advance bootstrap when pending question answer is missing", async () => {
		const root = await makeTempRoot("bardo-bootstrap-strict-missing-");
		const bardoRoot = path.join(root, "bardo");
		await mkdir(bardoRoot, { recursive: true });
		const paths = resolveInitPaths(bardoRoot);

		const first = await runBootstrapStep({
			paths,
			nowIso: "2026-02-20T00:00:00.000Z",
		});
		expect(first.pendingQuestionKey).toBe("purpose");

		const second = await runBootstrapStep({
			paths,
			nowIso: "2026-02-20T00:00:01.000Z",
		});
		expect(second.pendingQuestionKey).toBe("purpose");
		expect(second.answeredCount).toBe(0);
	});

	test("ignores out-of-order bootstrap answers until pending key is answered", async () => {
		const root = await makeTempRoot("bardo-bootstrap-strict-order-");
		const bardoRoot = path.join(root, "bardo");
		await mkdir(bardoRoot, { recursive: true });
		const paths = resolveInitPaths(bardoRoot);

		const first = await runBootstrapStep({
			paths,
			nowIso: "2026-02-20T00:00:00.000Z",
		});
		expect(first.pendingQuestionKey).toBe("purpose");

		const outOfOrder = await runBootstrapStep({
			paths,
			nowIso: "2026-02-20T00:00:01.000Z",
			bootstrapAnswers: {
				userProfile: "This should not be accepted yet.",
			},
		});
		expect(outOfOrder.pendingQuestionKey).toBe("purpose");
		expect(outOfOrder.answeredCount).toBe(0);

		const inOrder = await runBootstrapStep({
			paths,
			nowIso: "2026-02-20T00:00:02.000Z",
			bootstrapAnswers: {
				purpose: "Now the required first answer is provided.",
			},
		});
		expect(inOrder.pendingQuestionKey).toBe("userProfile");
		expect(inOrder.answeredCount).toBe(1);
	});

	test("requires values answer when SOUL.md exists", async () => {
		const root = await makeTempRoot("bardo-bootstrap-soul-");
		const bardoRoot = path.join(root, "bardo");
		await mkdir(bardoRoot, { recursive: true });
		const paths = resolveInitPaths(bardoRoot);
		await writeFile(paths.soulPath, "# Soul\n\nPending values.\n", "utf8");

		const baseAnswers: Record<BootstrapAnswerKey, string> = {
			purpose: "Build a tactical campaign engine.",
			userProfile: "User wants transparent tradeoffs.",
			agentProfile: "Agent should be decisive and technical.",
			workingPreferences: "Use short progress updates.",
			boundaries: "Avoid unsafe filesystem operations.",
			successCriteria: "State consistency with deterministic updates.",
			values: "Truthfulness, restraint, and durability.",
		};

		for (const key of [
			"purpose",
			"userProfile",
			"agentProfile",
			"workingPreferences",
			"boundaries",
			"successCriteria",
		] as const) {
			await runBootstrapStep({
				paths,
				nowIso: "2026-02-20T00:00:00.000Z",
				bootstrapAnswers: { [key]: baseAnswers[key] },
			});
		}

		const pendingValues = await runBootstrapStep({
			paths,
			nowIso: "2026-02-20T00:00:00.000Z",
		});
		expect(pendingValues.complete).toBe(false);
		expect(pendingValues.pendingQuestionKey).toBe("values");
		expect(pendingValues.nextPrompt).toContain("values");

		const done = await runBootstrapStep({
			paths,
			nowIso: "2026-02-20T00:00:00.000Z",
			bootstrapAnswers: { values: baseAnswers.values },
		});
		expect(done.complete).toBe(true);

		const soulRaw = await readFile(paths.soulPath, "utf8");
		expect(soulRaw).toContain("Truthfulness");
	});
});
