export function shouldEnableAmbientEffects({
	prefersReducedMotion,
	saveData,
	viewportWidth,
	hardwareConcurrency,
	deviceMemory,
	isHeadlessBrowser,
}: {
	prefersReducedMotion: boolean;
	saveData: boolean;
	viewportWidth: number;
	hardwareConcurrency: number | null;
	deviceMemory: number | null;
	isHeadlessBrowser: boolean;
}): boolean {
	if (prefersReducedMotion) return false;
	if (saveData) return false;
	if (isHeadlessBrowser) return false;
	if (hardwareConcurrency !== null && hardwareConcurrency <= 4) return false;
	if (deviceMemory !== null && deviceMemory <= 4) return false;
	return viewportWidth >= 768;
}
