import * as Sentry from "@sentry/nextjs";
import { createServerSentryOptions } from "./lib/sentry-server-config";

Sentry.init(createServerSentryOptions());
