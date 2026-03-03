const TOKEN_VERSION = 1;

export type CliLoginExchangePayload = {
	apiKey: string;
	mcpUrl: string;
	statusUrl: string;
	serverName: string;
	issuedAtISO: string;
	expiresAtISO: string;
};

type EncodedPayload = CliLoginExchangePayload & {
	v: number;
};

type DecodeOptions = {
	now?: Date;
};

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
		throw new Error("CLI login secret must be at least 16 characters.");
	}
	return trimmed;
}

export function createCliLoginTokenCodec(secret: string) {
	const normalizedSecret = ensureSecret(secret);

	return {
		async encrypt(payload: CliLoginExchangePayload): Promise<string> {
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

			if (parsed.v !== TOKEN_VERSION) {
				throw new Error("unsupported token version");
			}
			if (
				typeof parsed.apiKey !== "string" ||
				typeof parsed.mcpUrl !== "string" ||
				typeof parsed.statusUrl !== "string" ||
				typeof parsed.serverName !== "string" ||
				typeof parsed.issuedAtISO !== "string" ||
				typeof parsed.expiresAtISO !== "string"
			) {
				throw new Error("invalid token payload");
			}

			const now = options.now ?? new Date();
			if (Date.parse(parsed.expiresAtISO) <= now.getTime()) {
				throw new Error("login token expired");
			}

			return {
				apiKey: parsed.apiKey,
				mcpUrl: parsed.mcpUrl,
				statusUrl: parsed.statusUrl,
				serverName: parsed.serverName,
				issuedAtISO: parsed.issuedAtISO,
				expiresAtISO: parsed.expiresAtISO,
			} satisfies CliLoginExchangePayload;
		},
	};
}
