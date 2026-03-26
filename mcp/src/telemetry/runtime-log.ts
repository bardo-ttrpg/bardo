type TelemetryLevel = "info" | "warn" | "error";

function normalizeAttributes(
	attributes: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!attributes) {
		return undefined;
	}
	const entries = Object.entries(attributes).filter(
		([, value]) => value !== undefined,
	);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function logTelemetryMessage(
	level: TelemetryLevel,
	event: string,
	attributes?: Record<string, unknown>,
): void {
	const record = {
		level,
		event,
		attributes: normalizeAttributes(attributes),
	};
	const line = JSON.stringify(record);
	if (level === "error") {
		console.error(line);
		return;
	}
	if (level === "warn") {
		console.warn(line);
		return;
	}
	console.log(line);
}

export function captureTelemetryException(
	error: unknown,
	attributes?: Record<string, unknown>,
): void {
	logTelemetryMessage("error", "mcp.exception", {
		...normalizeAttributes(attributes),
		error:
			error instanceof Error
				? {
						name: error.name,
						message: error.message,
					}
				: String(error),
	});
}
