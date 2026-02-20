export default function CrosshairMarker({
	className = "",
}: {
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={`pointer-events-none absolute select-none font-mono text-base leading-none text-foreground/20 ${className}`}
		>
			+
		</span>
	);
}
