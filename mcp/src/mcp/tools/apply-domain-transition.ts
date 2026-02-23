import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { appendCanonicalEvent } from "../../domain/events/store";
import {
	getIdempotentResult,
	setIdempotentResult,
} from "../../domain/idempotency/store";
import {
	evaluateRuntimePolicy,
	loadAuthorityPolicy,
	loadTableContract,
	summarizeRuntimePolicyViolations,
} from "../../domain/policy/runtime-guards";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const applyDomainTransitionInputSchema = z.object({
	domain: z
		.enum(["entity", "location", "faction"])
		.describe("Canonical domain to transition."),
	recordId: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.describe("Domain record identifier."),
	transition: z
		.enum(["create", "update", "delete"])
		.describe("Transition type to apply."),
	payload: z
		.record(z.string(), z.unknown())
		.default({})
		.describe("Structured transition payload."),
	reason: z
		.string()
		.trim()
		.min(1)
		.max(300)
		.optional()
		.describe("Optional operator reason or trace note."),
	dryRun: z.boolean().default(false),
	idempotencyKey: z
		.string()
		.trim()
		.min(8)
		.max(256)
		.optional()
		.describe("Required when dryRun is false."),
});

const applyDomainTransitionOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	dryRun: z.boolean(),
	idempotentReplay: z.boolean(),
	domain: z.enum(["entity", "location", "faction"]),
	recordId: z.string(),
	transition: z.enum(["create", "update", "delete"]),
	eventId: z.string().nullable(),
});

type ApplyDomainTransitionOutput = z.infer<
	typeof applyDomainTransitionOutputSchema
>;

function canonicalDomainTransitionEventId(
	idempotencyKey: string | undefined,
): string {
	if (!idempotencyKey) {
		return `evt-domain-transition-${crypto.randomUUID()}`;
	}
	const normalized = idempotencyKey
		.toLowerCase()
		.replaceAll(/[^a-z0-9_-]/g, "-")
		.slice(0, 80);
	return `evt-domain-transition-${normalized}`;
}

export function registerApplyDomainTransitionTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"apply_domain_transition",
		{
			title: "Apply Domain Transition",
			description:
				"Append an auditable canonical domain transition event for entity/location/faction state changes.",
			inputSchema: applyDomainTransitionInputSchema,
			outputSchema: applyDomainTransitionOutputSchema,
			annotations: {
				title: "Apply Domain Transition",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({
			domain,
			recordId,
			transition,
			payload,
			reason,
			dryRun,
			idempotencyKey,
		}) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			try {
				if (!dryRun && !idempotencyKey) {
					throw new Error("`idempotencyKey` is required when dryRun is false.");
				}
				if (!dryRun && idempotencyKey) {
					const replay = await getIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope: "apply_domain_transition",
					});
					if (replay) {
						return makeToolResult({
							...(replay as ApplyDomainTransitionOutput),
							idempotentReplay: true,
						});
					}
				}
				const tableContract = await loadTableContract({ bardoRoot });
				const authorityPolicy = await loadAuthorityPolicy({ bardoRoot });
				const runtimeViolations = evaluateRuntimePolicy({
					action: reason ?? "",
					tableContract,
					authorityPolicy,
				});
				if (runtimeViolations.length > 0) {
					throw new Error(
						`Runtime policy blocked domain transition: ${summarizeRuntimePolicyViolations(runtimeViolations)}`,
					);
				}

				const eventId = canonicalDomainTransitionEventId(idempotencyKey);
				if (!dryRun) {
					await appendCanonicalEvent({
						bardoRoot,
						event: {
							id: eventId,
							type: "domain_transition_applied",
							atISO: new Date().toISOString(),
							source: "apply_domain_transition",
							data: {
								domain,
								recordId,
								transition,
								reason: reason ?? "",
								payload,
							},
						},
					});
				}

				const output: ApplyDomainTransitionOutput = {
					success: true,
					message: dryRun
						? "Domain transition dry-run succeeded."
						: "Domain transition appended successfully.",
					rootPath: bardoRoot,
					dryRun,
					idempotentReplay: false,
					domain,
					recordId,
					transition,
					eventId,
				};

				if (!dryRun && idempotencyKey) {
					await setIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope: "apply_domain_transition",
						result: output,
						nowIso: new Date().toISOString(),
					});
				}

				return makeToolResult(output);
			} catch (error) {
				const output: ApplyDomainTransitionOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to apply domain transition: ${error.message}`
							: "Failed to apply domain transition.",
					rootPath: bardoRoot,
					dryRun,
					idempotentReplay: false,
					domain,
					recordId,
					transition,
					eventId: null,
				};
				return makeToolResult(output, true);
			}
		},
	);
}
