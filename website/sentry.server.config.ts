import * as Sentry from "@sentry/nextjs";
import { createServerSentryOptions } from "./lib/sentry-config";

Sentry.init(createServerSentryOptions());
