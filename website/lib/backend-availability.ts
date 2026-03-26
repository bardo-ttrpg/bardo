export type BackendFailureCode =
	| "clerk_unavailable"
	| "billing_unavailable"
	| "website_backend_unavailable";

export class BackendAvailabilityError extends Error {
	code: BackendFailureCode;
	retryable: boolean;

	constructor(args: {
		message: string;
		code: BackendFailureCode;
		retryable?: boolean;
	}) {
		super(args.message);
		this.name = "BackendAvailabilityError";
		this.code = args.code;
		this.retryable = args.retryable ?? true;
	}
}

export function isBackendAvailabilityError(
	error: unknown,
): error is BackendAvailabilityError {
	return error instanceof BackendAvailabilityError;
}

export function backendAvailabilityPayload(error: BackendAvailabilityError) {
	return {
		error: error.message,
		code: error.code,
		retryable: error.retryable,
	};
}
