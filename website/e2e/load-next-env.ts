import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(filePath: string) {
	if (!existsSync(filePath)) {
		return;
	}

	const contents = readFileSync(filePath, "utf8");
	for (const rawLine of contents.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const separatorIndex = line.indexOf("=");
		if (separatorIndex <= 0) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		if (!key || process.env[key] !== undefined) {
			continue;
		}

		let value = line.slice(separatorIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		process.env[key] = value;
	}
}

const projectDir = resolve(process.cwd());

parseEnvFile(resolve(projectDir, ".env.local"));
parseEnvFile(resolve(projectDir, ".env"));
