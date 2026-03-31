import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Bardo - minimal docs, dashboard, and auth surface";
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
				background: "#000000",
				padding: "56px",
				border: "1px solid #FFFFFF",
				color: "#ffffff",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					fontSize: 22,
					letterSpacing: "0.18em",
					textTransform: "uppercase",
					color: "rgba(255,255,255,0.7)",
				}}
			>
				<span>BARDO</span>
				<span>MINIMAL SURFACE</span>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
				<div
					style={{
						maxWidth: 920,
						fontSize: 78,
						lineHeight: 1.04,
						fontWeight: 400,
					}}
				>
					Static content where possible. Dynamic flows only where necessary.
				</div>
				<div
					style={{
						maxWidth: 860,
						fontSize: 28,
						lineHeight: 1.35,
						color: "rgba(255,255,255,0.78)",
					}}
				>
					Docs and blog are MDX-backed. Account access and bridge approval stay
					server-backed.
				</div>
			</div>

			<div
				style={{
					display: "flex",
					gap: 16,
					fontSize: 22,
					color: "#ffffff",
					textTransform: "uppercase",
					letterSpacing: "0.12em",
				}}
			>
				<span>MDX</span>
				<span>CLERK</span>
				<span>TURBOPACK</span>
			</div>
		</div>,
		size,
	);
}
