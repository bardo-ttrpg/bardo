export const PORT = Number(Bun.env.PORT ?? 3000);
export const AUTH_HEADER = "x-api-key";
export const AUTH_BEARER_PREFIX = "Bearer ";

export const BARDO_SUBDIRECTORIES = [
	"_settings",
	"rules",
	"party",
	"entities",
	"items",
	"world",
	"quests",
	"state",
] as const;
