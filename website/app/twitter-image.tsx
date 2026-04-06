import { ImageResponse } from "next/og";

export const alt =
	"Bardo - solo tabletop RPG play with AI and local campaign files";
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
				<span>NO GM REQUIRED</span>
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
					Solo tabletop role-playing with an AI guide grounded in your local
					campaign files.
				</div>
				<div
					style={{
						maxWidth: 860,
						fontSize: 28,
						lineHeight: 1.35,
						color: "rgba(255,255,255,0.78)",
					}}
				>
					Bring your own AI client, keep your world on your machine, and let
					Bardo handle the tabletop context bridge.
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
				<span>Solo RPG</span>
				<span>AI Assist</span>
				<span>Local Files</span>
			</div>
		</div>,
		size,
	);
}
