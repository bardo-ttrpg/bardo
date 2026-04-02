import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeTextAtomic(
	filePath: string,
	content: string,
): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	const tempPath = `${filePath}.${randomUUID()}.tmp`;
	await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
	try {
		await rename(tempPath, filePath);
	} catch (error) {
		await rm(tempPath, { force: true });
		throw error;
	}
}
