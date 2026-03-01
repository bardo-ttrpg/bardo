import * as Sentry from "@sentry/nextjs";
import { createBrowserSentryOptions } from "./lib/sentry-config";

Sentry.init(createBrowserSentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
