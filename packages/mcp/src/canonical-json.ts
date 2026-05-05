type CanonicalJsonValue =
	| null
	| boolean
	| number
	| string
	| CanonicalJsonValue[]
	| { [key: string]: CanonicalJsonValue };

function canonicalize(value: unknown): CanonicalJsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((item) => canonicalize(item));
	}

	if (typeof value === "object" && value !== null) {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.sort(([a], [b]) => {
				if (a < b) return -1;
				if (a > b) return 1;
				return 0;
			})
			.map(([key, entry]) => [key, canonicalize(entry)] as const);
		return Object.fromEntries(entries) as CanonicalJsonValue;
	}

	return null;
}

export function canonicalJsonStringify(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}
