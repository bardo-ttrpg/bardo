import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CANONICAL_NEXT_ENV = `/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
`;

export async function normalizeNextEnvFile(cwd: string) {
	const nextEnvPath = path.join(cwd, "next-env.d.ts");
	const current = await readFile(nextEnvPath, "utf8").catch(() => null);
	if (current === CANONICAL_NEXT_ENV) {
		return;
	}

	await writeFile(nextEnvPath, CANONICAL_NEXT_ENV);
}
