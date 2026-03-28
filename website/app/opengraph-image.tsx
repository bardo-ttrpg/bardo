import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
	"Asset - The intelligent platform for investing and financial analysis";
export const size = {
	width: 1200,
	height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
	return new ImageResponse(
		<div
			style={{
				display: "flex",
				height: "100%",
				width: "100%",
				flexDirection: "column",
				justifyContent: "space-between",
				background:
					"radial-gradient(circle at top, rgba(243,255,201,0.16), transparent 30%), linear-gradient(135deg, #080a09 0%, #121517 52%, #171b1d 100%)",
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
				<span>INVESTING • INTELLIGENCE</span>
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
					The intelligent platform for investing and financial analysis
				</div>
				<div
					style={{
						maxWidth: 860,
						fontSize: 28,
						lineHeight: 1.35,
						color: "rgba(255,255,255,0.76)",
					}}
				>
					Build investing workflows, create intelligent agents, and automate
					financial operations with secure infrastructure designed for modern
					finance teams.
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
				<span>Financial Agents</span>
				<span>Trusted Data</span>
				<span>Secure Ecosystem</span>
			</div>
		</div>,
		size,
	);
}
