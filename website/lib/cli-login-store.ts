import { createHash } from "node:crypto";

type ConsumeArgs = {
	token: string;
	expiresAtISO: string;
};

type ConsumeResult =
	| { ok: true }
	| { ok: false; reason: "expired" | "already_used" };

type CliLoginTokenStoreOptions = {
	nowMs?: () => number;
};

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("base64url");
}

export function createCliLoginTokenStore(
	options: CliLoginTokenStoreOptions = {},
) {
	const now = options.nowMs ?? (() => Date.now());
	const usedTokens = new Map<string, number>();

	return {
		async consume(args: ConsumeArgs): Promise<ConsumeResult> {
			const expiresAt = Date.parse(args.expiresAtISO);
			const current = now();
			if (!Number.isFinite(expiresAt) || expiresAt <= current) {
				return { ok: false, reason: "expired" };
			}

			const key = hashToken(args.token.trim());
			const existingExpiry = usedTokens.get(key);
			if (typeof existingExpiry === "number" && existingExpiry > current) {
				return { ok: false, reason: "already_used" };
			}

			usedTokens.set(key, expiresAt);
			return { ok: true };
		},
		reset(): void {
			usedTokens.clear();
		},
	};
}
