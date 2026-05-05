#!/usr/bin/env node

import { runCli } from "./runtime";

void runCli(process.argv.slice(2))
	.then((exitCode) => {
		process.exit(exitCode);
	})
	.catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exit(1);
	});
