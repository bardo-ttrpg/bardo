export function shouldTolerateAnalyzeFailure(args: {
	exitCode: number;
	output: string;
	hasClientChunks: boolean;
}): boolean {
	if (args.exitCode === 0 || !args.hasClientChunks) {
		return false;
	}

	return (
		args.output.includes("crates/next-api/src/analyze.rs") &&
		args.output.includes("Module with ident")
	);
}
