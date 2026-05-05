#!/usr/bin/env node

import { runCli } from "../dist/cli.mjs";

void runCli(process.argv.slice(2))
	.then((exitCode) => {
		process.exit(exitCode);
	})
	.catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exit(1);
	});
