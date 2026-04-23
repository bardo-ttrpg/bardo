const TOKEN_VERSION = 1;

type BaseBridgeTokenPayload = {
	sessionId: string;
	userId: string;
	plan: "free" | "pro";
	accountLabel: string;
	issuedAtISO: string;
	expiresAtISO: string;
};

export type BridgeAccessTokenPayload = BaseBridgeTokenPayload & {
	tokenType: "access";
};

export type BridgeRefreshTokenPayload = BaseBridgeTokenPayload & {
	tokenType: "refresh";
};

type BridgeTokenPayload = BridgeAccessTokenPayload | BridgeRefreshTokenPayload;

type EncodedPayload = BridgeTokenPayload & {
	v: number;
};

type DecodeOptions = {
	now?: Date;
};

type DecodedPlan = BaseBridgeTokenPayload["plan"] | "solo";

function toBase64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes)
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
	const padded = value.replaceAll("-", "+").replaceAll("_", "/");
	const padding =
		padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
	return Uint8Array.from(Buffer.from(`${padded}${padding}`, "base64"));
}

function toCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	const arrayBuffer = new ArrayBuffer(bytes.byteLength);
	const clone = new Uint8Array(arrayBuffer);
	clone.set(bytes);
	return clone;
}

async function deriveEncryptionKey(secret: string): Promise<CryptoKey> {
	const material = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(secret),
	);
	return crypto.subtle.importKey("raw", material, "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);
}

function ensureSecret(secret: string): string {
	const trimmed = secret.trim();
	if (trimmed.length < 16) {
		throw new Error("Bridge session secret must be at least 16 characters.");
	}
	return trimmed;
}

function isValidPlan(value: unknown): value is DecodedPlan {
	return value === "free" || value === "pro" || value === "solo";
}

function parseTokenPayload(
	raw: Partial<EncodedPayload>,
	options: DecodeOptions,
): BridgeTokenPayload {
	if (
		raw.v !== TOKEN_VERSION ||
		(raw.tokenType !== "access" && raw.tokenType !== "refresh") ||
		typeof raw.sessionId !== "string" ||
		typeof raw.userId !== "string" ||
		!isValidPlan(raw.plan) ||
		typeof raw.accountLabel !== "string" ||
		typeof raw.issuedAtISO !== "string" ||
		typeof raw.expiresAtISO !== "string"
	) {
		throw new Error("invalid bridge session token payload");
	}

	const now = options.now ?? new Date();
	if (Date.parse(raw.expiresAtISO) <= now.getTime()) {
		throw new Error("bridge session token expired");
	}
	const decodedPlan = raw.plan as DecodedPlan;

	return {
		tokenType: raw.tokenType,
		sessionId: raw.sessionId,
		userId: raw.userId,
		plan: decodedPlan === "solo" ? "pro" : decodedPlan,
		accountLabel: raw.accountLabel,
		issuedAtISO: raw.issuedAtISO,
		expiresAtISO: raw.expiresAtISO,
	};
}

export function createBridgeSessionTokenCodec(secret: string) {
	const normalizedSecret = ensureSecret(secret);

	return {
		async encrypt(payload: BridgeTokenPayload): Promise<string> {
			const key = await deriveEncryptionKey(normalizedSecret);
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const encoded = new TextEncoder().encode(
				JSON.stringify({
					v: TOKEN_VERSION,
					...payload,
				} satisfies EncodedPayload),
			);
			const ciphertext = await crypto.subtle.encrypt(
				{ name: "AES-GCM", iv },
				key,
				encoded,
			);
			return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
		},
		async decrypt(token: string, options: DecodeOptions = {}) {
			const [ivPart, payloadPart] = token.split(".");
			if (!ivPart || !payloadPart) {
				throw new Error("invalid token format");
			}

			const key = await deriveEncryptionKey(normalizedSecret);
			const iv = toCryptoBytes(fromBase64Url(ivPart));
			const payload = toCryptoBytes(fromBase64Url(payloadPart));
			const plaintext = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv },
				key,
				payload,
			);
			const parsed = JSON.parse(
				new TextDecoder().decode(plaintext),
			) as Partial<EncodedPayload>;
			return parseTokenPayload(parsed, options);
		},
		async decryptAccess(token: string, options: DecodeOptions = {}) {
			const payload = await this.decrypt(token, options);
			if (payload.tokenType !== "access") {
				throw new Error("invalid bridge session token payload");
			}
			return payload;
		},
		async decryptRefresh(token: string, options: DecodeOptions = {}) {
			const payload = await this.decrypt(token, options);
			if (payload.tokenType !== "refresh") {
				throw new Error("invalid bridge session token payload");
			}
			return payload;
		},
	};
}
