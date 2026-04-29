import { ImageResponse } from "next/og";

export const alt =
	"Bardo - tabletop RPG MCP for AI clients and local campaign files";
export const size = {
	width: 1200,
	height: 630,
};
export const contentType = "image/png";

const frameStyle = {
	display: "flex",
	height: "100%",
	width: "100%",
	flexDirection: "column",
	justifyContent: "space-between",
	background: "#0a0a0f",
	padding: "56px",
	border: "1px solid #FFFFFF",
	color: "#ffffff",
} as const;

const topLineStyle = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	fontSize: 22,
	letterSpacing: "0.18em",
	textTransform: "uppercase",
	color: "rgba(255,255,255,0.7)",
} as const;

const bodyStackStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 24,
} as const;

const headlineStyle = {
	maxWidth: 920,
	fontSize: 78,
	lineHeight: 1.04,
	fontWeight: 400,
} as const;

const subheadStyle = {
	maxWidth: 860,
	fontSize: 28,
	lineHeight: 1.35,
	color: "rgba(255,255,255,0.78)",
} as const;

const footerStyle = {
	display: "flex",
	gap: 16,
	fontSize: 22,
	color: "#ffffff",
	textTransform: "uppercase",
	letterSpacing: "0.12em",
} as const;

export default function TwitterImage() {
	return new ImageResponse(
		<div style={frameStyle}>
			<div style={topLineStyle}>
				<span>BARDO</span>
				<span>LOCAL FILES / GROUNDED PLAY</span>
			</div>

			<div style={bodyStackStyle}>
				<div style={headlineStyle}>
					The MCP for playing any tabletop role-playing game with modern AI
					clients.
				</div>
				<div style={subheadStyle}>
					Keep campaign files local and ground the model in your real workspace
					so it stays far more accurate.
				</div>
			</div>

			<div style={footerStyle}>
				<span>Any TTRPG</span>
				<span>AI Clients</span>
				<span>Local Files</span>
			</div>
		</div>,
		{
			...size,
			headers: {
				"Cross-Origin-Resource-Policy": "cross-origin",
			},
		},
	);
}
