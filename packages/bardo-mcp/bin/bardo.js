#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const platformMap = {
	darwin: "darwin",
	linux: "linux",
	win32: "windows",
};

const archMap = {
	arm64: "arm64",
	x64: "x64",
};

const platform = platformMap[process.platform];
const arch = archMap[process.arch];

if (!platform || !arch) {
	console.error(
		`Bardo does not ship a prebuilt binary for ${process.platform}/${process.arch}. Install from https://www.bardo.gg/docs/install instead.`,
	);
	process.exit(1);
}

const extension = platform === "windows" ? ".exe" : "";
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(
	readFileSync(join(packageRoot, "package.json"), "utf8"),
);
const filename = `bardo-v${packageJson.version}-${platform}-${arch}${extension}`;
const executable = join(packageRoot, "dist", "release", filename);

if (!existsSync(executable)) {
	console.error(
		`Bardo release binary is missing from this package: ${filename}. Reinstall @bardo/mcp or use https://www.bardo.gg/docs/install.`,
	);
	process.exit(1);
}

const result = spawnSync(executable, process.argv.slice(2), {
	stdio: "inherit",
	windowsHide: false,
});

if (result.error) {
	console.error(result.error.message);
	process.exit(1);
}

process.exit(result.status ?? 0);
