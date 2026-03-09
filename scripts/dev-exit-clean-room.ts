import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { shouldExcludeFromDevExitCleanRoom } from "./dev-exit-clean-room-lib";

function runOrThrow(
	command: string,
	args: string[],
	options: {
		cwd: string;
		env?: NodeJS.ProcessEnv;
	},
): void {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		encoding: "utf8",
		env: options.env,
		stdio: "inherit",
	});

	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed with exit code ${
				result.status ?? 1
			}.`,
		);
	}
}

async function main() {
	const repoRoot = process.cwd();
	const repoName = basename(repoRoot);
	const cleanRoomParent = await mkdtemp(join(tmpdir(), "bardo-dev-exit-"));
	const cleanRoomRoot = join(cleanRoomParent, repoName);
	const keepCleanRoom = process.env.BARDO_KEEP_DEV_EXIT_CLEAN_ROOM === "true";

	console.log(`[dev-exit-clean-room] creating ${cleanRoomRoot}`);

	try {
		await mkdir(cleanRoomRoot, { recursive: true });
		await cp(repoRoot, cleanRoomRoot, {
			recursive: true,
			filter(source) {
				const relativePath = relative(repoRoot, source);
				return !shouldExcludeFromDevExitCleanRoom(relativePath);
			},
		});

		runOrThrow("git", ["init"], { cwd: cleanRoomRoot });
		runOrThrow("git", ["checkout", "-b", "codex/dev-exit-clean-room"], {
			cwd: cleanRoomRoot,
		});
		runOrThrow("git", ["config", "user.name", "Codex Clean Room"], {
			cwd: cleanRoomRoot,
		});
		runOrThrow(
			"git",
			["config", "user.email", "codex-dev-exit@example.invalid"],
			{ cwd: cleanRoomRoot },
		);
		runOrThrow("git", ["add", "-A"], { cwd: cleanRoomRoot });
		runOrThrow("git", ["commit", "-m", "Prepare dev exit clean room"], {
			cwd: cleanRoomRoot,
		});

		console.log("[dev-exit-clean-room] installing dependencies");
		runOrThrow("bun", ["install", "--frozen-lockfile"], {
			cwd: cleanRoomRoot,
			env: {
				...process.env,
			},
		});

		console.log("[dev-exit-clean-room] running bun run dev:exit");
		runOrThrow("bun", ["run", "dev:exit"], {
			cwd: cleanRoomRoot,
			env: {
				...process.env,
			},
		});

		if (keepCleanRoom) {
			console.log(
				`[dev-exit-clean-room] success; preserving clean room at ${cleanRoomRoot}`,
			);
			return;
		}

		await rm(cleanRoomParent, { force: true, recursive: true });
		console.log("[dev-exit-clean-room] success; cleaned temporary workspace");
	} catch (error) {
		console.error(
			`[dev-exit-clean-room] failed; preserved clean room at ${cleanRoomRoot}`,
		);
		throw error;
	}
}

await main();
