export function shouldEnableAmbientEffects({
	prefersReducedMotion,
	saveData,
	viewportWidth,
}: {
	prefersReducedMotion: boolean;
	saveData: boolean;
	viewportWidth: number;
}): boolean {
	if (prefersReducedMotion) return false;
	if (saveData) return false;
	return viewportWidth >= 768;
}
