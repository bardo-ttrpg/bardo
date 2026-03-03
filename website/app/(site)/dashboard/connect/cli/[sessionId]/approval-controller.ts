type ApproveCliSessionArgs = {
	sessionId: string;
	fetchImpl?: typeof fetch;
};

export async function approveCliSession(args: ApproveCliSessionArgs): Promise<{
	ok: boolean;
	message: string;
}> {
	const response = await (args.fetchImpl ?? fetch)(
		"/api/connect/cli-session/approve",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ sessionId: args.sessionId }),
		},
	);
	const payload = (await response.json().catch(() => ({}))) as Partial<{
		error: string;
		ok: boolean;
	}>;

	if (!response.ok || payload.ok !== true) {
		return {
			ok: false,
			message: payload.error ?? "Failed to approve CLI access.",
		};
	}

	return {
		ok: true,
		message: "CLI access approved. Return to your terminal.",
	};
}
