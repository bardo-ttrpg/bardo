import {
	LOOP_DETECTION_POLICY,
	type LoopDetectionPolicy,
} from "./loop-detection";
import { SECURITY_POLICY, type SecurityPolicy } from "./security";
import { validateRuntimeConfiguration } from "./strict-config";
import { TOOL_POLICY_CONFIG, type ToolPolicyConfig } from "./tool-policy";

type RuntimeValidationOptions = {
	securityPolicy?: SecurityPolicy;
	loopPolicy?: LoopDetectionPolicy;
	toolPolicy?: ToolPolicyConfig;
};

export function validateCurrentRuntimeConfiguration(
	options: RuntimeValidationOptions = {},
): void {
	validateRuntimeConfiguration({
		securityPolicy: options.securityPolicy ?? SECURITY_POLICY,
		loopPolicy: options.loopPolicy ?? LOOP_DETECTION_POLICY,
		toolPolicy: options.toolPolicy ?? TOOL_POLICY_CONFIG,
	});
}

if (import.meta.main) {
	validateCurrentRuntimeConfiguration();
	console.log("MCP runtime configuration is valid.");
}
