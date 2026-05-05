import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeTextAtomic(
	filePath: string,
	content: string,
): Promise<void> {
	const tempPath = `${filePath}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(tempPath, content, "utf8");
	try {
		await rename(tempPath, filePath);
	} catch (error) {
		await rm(tempPath, { force: true });
		throw error;
	}
}
