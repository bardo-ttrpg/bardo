import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
	type ConsistencyCheckOutput,
	runConsistencyCheckForRoot,
} from "../../domain/consistency/check";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const consistencyCheckInputSchema = z.object({
	includeWarnings: z
		.boolean()
		.default(true)
		.describe("Include warning-level findings in addition to errors"),
});

const consistencyCheckOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	issues: z.array(
		z.object({
			severity: z.enum(["error", "warning"]),
			code: z.string(),
			message: z.string(),
			path: z.string().optional(),
		}),
	),
	errorCount: z.number().int().nonnegative(),
	warningCount: z.number().int().nonnegative(),
});

export async function runConsistencyCheck(args: {
	auth: AuthContext;
	includeWarnings: boolean;
}): Promise<ConsistencyCheckOutput> {
	const bardoRoot = resolveBardoRoot(args.auth.campaignBasePath);
	return runConsistencyCheckForRoot({
		bardoRoot,
		includeWarnings: args.includeWarnings,
	});
}

export function registerConsistencyCheckTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"consistency_check",
		{
			title: "Consistency Check",
			description:
				"Validate core canon consistency across state, locations, and referenced NPC files.",
			inputSchema: consistencyCheckInputSchema,
			outputSchema: consistencyCheckOutputSchema,
			annotations: {
				title: "Consistency Check",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ includeWarnings }) => {
			const output = await runConsistencyCheck({
				auth,
				includeWarnings,
			});
			return makeToolResult(output, !output.success);
		},
	);
}
