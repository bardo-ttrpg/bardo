import { describe, expect, test } from "bun:test";
import {
	type BridgeAccessTokenPayload,
	type BridgeRefreshTokenPayload,
	createBridgeSessionTokenCodec,
} from "./bridge-session-token";

const SECRET = "bridge-session-secret-1234567890";

describe("bridge session token codec", () => {
	test("round-trips access and refresh tokens", async () => {
		const codec = createBridgeSessionTokenCodec(SECRET);
		const accessPayload: BridgeAccessTokenPayload = {
			tokenType: "access",
			sessionId: "bridge_session_123",
			userId: "user_123",
			plan: "solo",
			accountLabel: "Armando",
			issuedAtISO: "2099-03-03T00:00:00.000Z",
			expiresAtISO: "2099-03-03T00:10:00.000Z",
		};
		const refreshPayload: BridgeRefreshTokenPayload = {
			tokenType: "refresh",
			sessionId: "bridge_session_123",
			userId: "user_123",
			plan: "solo",
			accountLabel: "Armando",
			issuedAtISO: "2099-03-03T00:00:00.000Z",
			expiresAtISO: "2099-03-10T00:00:00.000Z",
		};

		const accessToken = await codec.encrypt(accessPayload);
		const refreshToken = await codec.encrypt(refreshPayload);

		await expect(codec.decryptAccess(accessToken)).resolves.toEqual(
			accessPayload,
		);
		await expect(codec.decryptRefresh(refreshToken)).resolves.toEqual(
			refreshPayload,
		);
	});

	test("rejects expired bridge tokens", async () => {
		const codec = createBridgeSessionTokenCodec(SECRET);
		const token = await codec.encrypt({
			tokenType: "access",
			sessionId: "bridge_session_123",
			userId: "user_123",
			plan: "solo",
			accountLabel: "Armando",
			issuedAtISO: "2099-03-03T00:00:00.000Z",
			expiresAtISO: "2099-03-03T00:10:00.000Z",
		});

		await expect(
			codec.decryptAccess(token, {
				now: new Date("2099-03-03T00:10:01.000Z"),
			}),
		).rejects.toThrow("bridge session token expired");
	});

	test("rejects token-type mismatches", async () => {
		const codec = createBridgeSessionTokenCodec(SECRET);
		const refreshToken = await codec.encrypt({
			tokenType: "refresh",
			sessionId: "bridge_session_123",
			userId: "user_123",
			plan: "solo",
			accountLabel: "Armando",
			issuedAtISO: "2099-03-03T00:00:00.000Z",
			expiresAtISO: "2099-03-10T00:00:00.000Z",
		});

		await expect(codec.decryptAccess(refreshToken)).rejects.toThrow(
			"invalid bridge session token payload",
		);
	});
});
