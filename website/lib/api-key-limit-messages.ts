export const API_KEY_LIMIT_REACHED_MESSAGE =
	"API key limit reached for your plan";

export const CLI_LOGIN_KEY_SLOT_REQUIRED_MESSAGE =
	"CLI login needs a free API key slot on your current plan. Rotate or delete an existing key, then retry.";

export function isApiKeyLimitReachedMessage(
	message: string | null | undefined,
) {
	return message?.includes(API_KEY_LIMIT_REACHED_MESSAGE) === true;
}
