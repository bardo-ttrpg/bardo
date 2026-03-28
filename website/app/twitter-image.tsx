import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
	"Asset - The intelligent platform for investing and financial analysis";
export const size = {
	width: 1200,
	height: 630,
};
export const contentType = "image/png";

export default function TwitterImage() {
	return new ImageResponse(
		<div
			style={{
				display: "flex",
				height: "100%",
				width: "100%",
				flexDirection: "column",
				justifyContent: "space-between",
				background:
					"radial-gradient(circle at top, rgba(241,148,71,0.18), transparent 28%), linear-gradient(135deg, #080a09 0%, #131517 48%, #191d1f 100%)",
				padding: "56px",
				color: "#ffffff",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					fontSize: 24,
					letterSpacing: "0.35em",
					textTransform: "uppercase",
					color: "rgba(255,255,255,0.6)",
				}}
			>
				<span>ASSET</span>
				<span>WORKFLOWS • RESEARCH</span>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
				<div
					style={{
						maxWidth: 920,
						fontSize: 74,
						lineHeight: 1.02,
						fontWeight: 700,
						letterSpacing: "-0.06em",
					}}
				>
					Move investing forward with intelligence
				</div>
				<div
					style={{
						maxWidth: 860,
						fontSize: 28,
						lineHeight: 1.35,
						color: "rgba(255,255,255,0.76)",
					}}
				>
					Research faster, automate modern finance workflows, and keep decisions
					visible across secure teams and systems.
				</div>
			</div>

			<div
				style={{
					display: "flex",
					gap: 16,
					fontSize: 22,
					color: "#f3ffc9",
					textTransform: "uppercase",
					letterSpacing: "0.18em",
				}}
			>
				<span>Workflow Automation</span>
				<span>Custom Models</span>
				<span>Governance</span>
			</div>
		</div>,
		size,
	);
}
