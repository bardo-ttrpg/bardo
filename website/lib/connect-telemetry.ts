type ConnectCounterName =
	| "bridge_session_started"
	| "bridge_session_start_failed"
	| "bridge_session_poll_pending"
	| "bridge_session_poll_approved"
	| "bridge_session_poll_rejected"
	| "bridge_session_poll_failed"
	| "bridge_session_approved"
	| "bridge_session_approve_rejected"
	| "bridge_session_approve_failed"
	| "runtime_status_success"
	| "runtime_status_invalid"
	| "runtime_status_failed"
	| "connect_snippets_success"
	| "connect_snippets_rejected"
	| "connect_snippets_failed";

type ConnectTelemetryOptions = {
	logEnabled?: boolean;
	logEvery?: number;
	logger?: {
		info: (
			message: string,
			attributes?: Record<string, string | number | boolean>,
		) => void;
	};
};

type ConnectTelemetrySnapshot = Record<ConnectCounterName, number>;

const CONNECT_COUNTER_NAMES: readonly ConnectCounterName[] = [
	"bridge_session_started",
	"bridge_session_start_failed",
	"bridge_session_poll_pending",
	"bridge_session_poll_approved",
	"bridge_session_poll_rejected",
	"bridge_session_poll_failed",
	"bridge_session_approved",
	"bridge_session_approve_rejected",
	"bridge_session_approve_failed",
	"runtime_status_success",
	"runtime_status_invalid",
	"runtime_status_failed",
	"connect_snippets_success",
	"connect_snippets_rejected",
	"connect_snippets_failed",
] as const;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) {
		return fallback;
	}
	return Math.floor(parsed);
}

function emptySnapshot(): ConnectTelemetrySnapshot {
	return {
		bridge_session_started: 0,
		bridge_session_start_failed: 0,
		bridge_session_poll_pending: 0,
		bridge_session_poll_approved: 0,
		bridge_session_poll_rejected: 0,
		bridge_session_poll_failed: 0,
		bridge_session_approved: 0,
		bridge_session_approve_rejected: 0,
		bridge_session_approve_failed: 0,
		runtime_status_success: 0,
		runtime_status_invalid: 0,
		runtime_status_failed: 0,
		connect_snippets_success: 0,
		connect_snippets_rejected: 0,
		connect_snippets_failed: 0,
	};
}

export function createConnectTelemetry(options: ConnectTelemetryOptions = {}) {
	const counters = new Map<ConnectCounterName, number>();
	const logger = options.logger;
	const logEnabled =
		options.logEnabled ??
		parseBoolean(process.env.BARDO_CONNECT_TELEMETRY_LOG, false);
	const logEvery =
		options.logEvery ??
		parsePositiveInteger(process.env.BARDO_CONNECT_TELEMETRY_LOG_EVERY, 100);
	let totalIncrements = 0;

	function snapshot(): ConnectTelemetrySnapshot {
		const next = emptySnapshot();
		for (const name of CONNECT_COUNTER_NAMES) {
			next[name] = counters.get(name) ?? 0;
		}
		return next;
	}

	function increment(name: ConnectCounterName): void {
		counters.set(name, (counters.get(name) ?? 0) + 1);
		totalIncrements += 1;
		if (logEnabled && totalIncrements % logEvery === 0) {
			const current = snapshot();
			logger?.info("bardo.connect.telemetry_snapshot", {
				"bardo.service": "website",
				"bardo.flow": "connect",
				...Object.fromEntries(
					Object.entries(current).map(([key, value]) => [
						`bardo.connect.${key}`,
						value,
					]),
				),
			});
		}
	}

	function reset(): void {
		counters.clear();
		totalIncrements = 0;
	}

	return {
		increment,
		snapshot,
		reset,
	};
}

let defaultConnectTelemetry: ReturnType<typeof createConnectTelemetry> | null =
	null;

export function getDefaultConnectTelemetry() {
	defaultConnectTelemetry ??= createConnectTelemetry();
	return defaultConnectTelemetry;
}

export type ConnectTelemetry = ReturnType<typeof createConnectTelemetry>;
