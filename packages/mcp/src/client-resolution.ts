import { access } from "node:fs/promises";
import path from "node:path";
import {
	type AutoInstallConnectionClient,
	type ConnectionClient,
	getConnectionClientAdapter,
	isAutoInstallConnectionClient,
	isConnectionClient,
	listConnectionClientAdapters,
} from "./client-adapters";

type ClientDetectionSource = "explicit" | "workspace";

type AutoInstallClientSelection = {
	client: AutoInstallConnectionClient;
	configPath: string;
	detectionSource: ClientDetectionSource;
};

type DoctorClientSelection = {
	client: ConnectionClient;
	configPath: string | null;
	detectionSource: ClientDetectionSource;
};

async function detectWorkspaceClient(
	workspaceRoot: string,
): Promise<AutoInstallConnectionClient> {
	const detected: AutoInstallConnectionClient[] = [];

	for (const client of listConnectionClientAdapters()) {
		if (!client.autoInstall || !client.defaultConfigPath) {
			continue;
		}
		const configPath = path.join(workspaceRoot, client.defaultConfigPath);
		const exists = await access(configPath)
			.then(() => true)
			.catch(() => false);
		if (exists) {
			detected.push(client.id as AutoInstallConnectionClient);
		}
	}

	if (detected.length === 1) {
		const [client] = detected;
		if (!client) {
			throw new Error("Detected client is missing.");
		}
		return client;
	}

	if (detected.length > 1) {
		throw new Error(
			`Multiple client configs detected: ${detected.join(
				", ",
			)}. Pass --client explicitly.`,
		);
	}

	throw new Error(
		"No supported client config detected in this workspace. Pass --client explicitly.",
	);
}

export async function resolveAutoInstallClientSelection(args: {
	client: string | null;
	workspaceRoot: string;
}): Promise<AutoInstallClientSelection> {
	const normalized = args.client?.trim().toLowerCase() ?? null;
	if (normalized === "auto") {
		const client = await detectWorkspaceClient(args.workspaceRoot);
		const adapter = getConnectionClientAdapter(client);
		return {
			client,
			configPath: path.join(
				args.workspaceRoot,
				adapter.defaultConfigPath ?? "",
			),
			detectionSource: "workspace",
		};
	}
	if (!isAutoInstallConnectionClient(normalized)) {
		throw new Error(
			"Unsupported client. Use claude, opencode, codex, gemini, cursor, or auto.",
		);
	}
	const adapter = getConnectionClientAdapter(normalized);
	return {
		client: normalized,
		configPath: path.join(args.workspaceRoot, adapter.defaultConfigPath ?? ""),
		detectionSource: "explicit",
	};
}

export async function resolveDoctorClientSelection(args: {
	client: string | null;
	workspaceRoot: string;
}): Promise<DoctorClientSelection> {
	const normalized = args.client?.trim().toLowerCase() ?? null;
	if (normalized === "auto") {
		const client = await detectWorkspaceClient(args.workspaceRoot);
		const adapter = getConnectionClientAdapter(client);
		return {
			client,
			configPath: path.join(
				args.workspaceRoot,
				adapter.defaultConfigPath ?? "",
			),
			detectionSource: "workspace",
		};
	}
	if (!isConnectionClient(normalized)) {
		throw new Error(
			"Unsupported client. Use claude, opencode, codex, gemini, cursor, generic, or auto.",
		);
	}
	const adapter = getConnectionClientAdapter(normalized);
	return {
		client: normalized,
		configPath: adapter.defaultConfigPath
			? path.join(args.workspaceRoot, adapter.defaultConfigPath)
			: null,
		detectionSource: "explicit",
	};
}
