import { readFile } from "node:fs/promises";

const skill = await readFile(
	new URL("../bardo-gm/SKILL.md", import.meta.url),
	"utf8",
);

for (const required of ["name: bardo-gm", "description:", "# Bardo GM"]) {
	if (!skill.includes(required)) {
		throw new Error(`Missing required skill marker: ${required}`);
	}
}
