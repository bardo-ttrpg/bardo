const keyedLocks = new Map<string, Promise<void>>();

export async function withKeyedLock<T>(
	key: string,
	fn: () => Promise<T>,
): Promise<T> {
	const previous = keyedLocks.get(key) ?? Promise.resolve();
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	const current = previous.catch(() => undefined).then(() => pending);
	keyedLocks.set(key, current);

	await previous.catch(() => undefined);
	try {
		return await fn();
	} finally {
		release();
		if (keyedLocks.get(key) === current) {
			keyedLocks.delete(key);
		}
	}
}
