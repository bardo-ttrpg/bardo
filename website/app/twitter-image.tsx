import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
	"Bardo - paid remote MCP for tabletop campaigns with a local workspace bridge";
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
					"linear-gradient(135deg, #050505 0%, #101010 45%, #171717 100%)",
				padding: "56px",
				color: "#f7f7f4",
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
					color: "#9ca3af",
				}}
			>
				<span>BARDO</span>
				<span>MCP • TTRPG • CANON</span>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
				<div
					style={{
						maxWidth: 920,
						fontSize: 72,
						lineHeight: 1.04,
						fontWeight: 700,
						letterSpacing: "-0.04em",
						textWrap: "balance",
					}}
				>
					Paid Remote MCP for Tabletop Campaign Continuity
				</div>
				<div
					style={{
						maxWidth: 840,
						fontSize: 28,
						lineHeight: 1.35,
						color: "#d1d5db",
					}}
				>
					Keep campaign files local, approve bridge sessions in the browser, and
					give AI clients a guarded AI GM and world-simulation layer for serious
					TTRPG play.
				</div>
			</div>

			<div
				style={{
					display: "flex",
					gap: 16,
					fontSize: 22,
					color: "#a3a3a3",
					textTransform: "uppercase",
					letterSpacing: "0.18em",
				}}
			>
				<span>Remote MCP</span>
				<span>Readable Workspace</span>
				<span>Campaign Truth</span>
			</div>
		</div>,
		size,
	);
}
