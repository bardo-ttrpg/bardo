import {
	type LoopDetectionPolicy,
	validateLoopDetectionPolicy,
} from "./loop-detection";
import type { SecurityPolicy } from "./security";
import {
	findConflictingToolPolicyTokens,
	type ToolPolicyConfig,
} from "./tool-policy";

export function validateRuntimeConfiguration(args: {
	securityPolicy: SecurityPolicy;
	loopPolicy: LoopDetectionPolicy;
	toolPolicy: ToolPolicyConfig;
}): void {
	const issues: string[] = [];

	if (
		args.securityPolicy.metricsRouteEnabled &&
		!args.securityPolicy.telemetryEnabled
	) {
		issues.push(
			"Invalid configuration: metrics route cannot be enabled when telemetry is disabled.",
		);
	}

	if (
		args.securityPolicy.transportMode === "stateless" &&
		!args.securityPolicy.mcpEnableJsonResponse
	) {
		issues.push(
			"Invalid configuration: stateless MCP transport requires BARDO_MCP_ENABLE_JSON_RESPONSE=true.",
		);
	}

	try {
		validateLoopDetectionPolicy(args.loopPolicy);
	} catch (error) {
		issues.push(
			error instanceof Error ? error.message : "Invalid loop policy.",
		);
	}

	const baseConflicts = findConflictingToolPolicyTokens(
		args.toolPolicy.baseAllowTokens,
		args.toolPolicy.baseDenyTokens,
	);
	if (baseConflicts.length > 0) {
		issues.push(
			`Invalid tool policy: the same base tokens appear in allow and deny: ${baseConflicts.join(", ")}.`,
		);
	}

	for (const [providerKey, rule] of Object.entries(
		args.toolPolicy.byProvider,
	)) {
		const conflicts = findConflictingToolPolicyTokens(
			rule.allowTokens,
			rule.denyTokens,
		);
		if (conflicts.length > 0) {
			issues.push(
				`Invalid tool policy for ${providerKey}: conflicting allow/deny tokens: ${conflicts.join(", ")}.`,
			);
		}
	}

	if (issues.length > 0) {
		throw new Error(issues.join("\n"));
	}
}
