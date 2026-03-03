import path from "node:path";

export type ReleaseTarget = {
	target: string;
	platform: "linux" | "darwin" | "windows";
	arch: "x64" | "arm64";
	extension: "" | ".exe";
};

export const RELEASE_TARGETS: readonly ReleaseTarget[] = [
	{
		target: "bun-linux-x64",
		platform: "linux",
		arch: "x64",
		extension: "",
	},
	{
		target: "bun-linux-arm64",
		platform: "linux",
		arch: "arm64",
		extension: "",
	},
	{
		target: "bun-darwin-arm64",
		platform: "darwin",
		arch: "arm64",
		extension: "",
	},
	{
		target: "bun-darwin-x64",
		platform: "darwin",
		arch: "x64",
		extension: "",
	},
	{
		target: "bun-windows-x64",
		platform: "windows",
		arch: "x64",
		extension: ".exe",
	},
] as const;

export function resolveReleaseArtifacts(args: {
	version: string;
	distDir?: string;
	binaryName?: string;
}) {
	const version = args.version.startsWith("v")
		? args.version
		: `v${args.version}`;
	const distDir = args.distDir ?? "dist/release";
	const binaryName = args.binaryName ?? "bardo";

	return RELEASE_TARGETS.map((entry) => ({
		...entry,
		filename: `${binaryName}-${version}-${entry.platform}-${entry.arch}${entry.extension}`,
		outfile: path.posix.join(
			distDir,
			`${binaryName}-${version}-${entry.platform}-${entry.arch}${entry.extension}`,
		),
	}));
}
