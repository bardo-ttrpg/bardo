import {
	isLocalhostHostname,
	shouldRedirectToCanonicalLocalhost,
} from "./local-domain";

type ResolveProxyLocalhostRedirectTargetArgs = {
	forwardedHostHeader: string | null;
	hostHeader: string | null;
	requestUrl: string;
	nextUrlHost: string | null;
	appUrl: string | null | undefined;
};

function normalizeHost(host: string | null): string | null {
	const value = host?.split(",")[0]?.trim();
	return value ? value : null;
}

function normalizeHostname(host: string | null): string | null {
	const value = normalizeHost(host);
	if (!value) {
		return null;
	}

	if (value.startsWith("[")) {
		const closingBracketIndex = value.indexOf("]");
		return closingBracketIndex >= 0
			? value.slice(1, closingBracketIndex)
			: value;
	}

	return value.split(":")[0]?.trim() || null;
}

export function resolveProxyLocalhostRedirectTarget(
	args: ResolveProxyLocalhostRedirectTargetArgs,
): string | null {
	const requestUrl = new URL(args.requestUrl);
	const requestUrlHostname = requestUrl.hostname;
	const requestHostname = isLocalhostHostname(requestUrlHostname)
		? requestUrlHostname
		: (normalizeHostname(args.forwardedHostHeader) ??
			normalizeHostname(args.hostHeader) ??
			requestUrlHostname ??
			normalizeHostname(args.nextUrlHost));

	if (!requestHostname) {
		return null;
	}

	return shouldRedirectToCanonicalLocalhost({
		requestHostname,
		requestUrlHostname,
		appUrl: args.appUrl,
	});
}
