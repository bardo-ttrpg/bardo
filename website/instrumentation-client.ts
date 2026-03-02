import * as Sentry from "@sentry/nextjs";
import {
	createBrowserSentryOptions,
	getBrowserSentryConfigWarning,
} from "./lib/sentry-browser-config";

const browserSentryWarning = getBrowserSentryConfigWarning();
if (browserSentryWarning) {
	console.warn(browserSentryWarning);
}

Sentry.init(createBrowserSentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
