import { ImageResponse } from "next/og";

export const alt =
	"Bardo - solo tabletop RPG play with AI and local campaign files";
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

export default function OpenGraphImage() {
	return new ImageResponse(
		<div style={frameStyle}>
			<div style={topLineStyle}>
				<span>BARDO</span>
				<span>SOLO RPG / AI / LOCAL FILES</span>
			</div>

			<div style={bodyStackStyle}>
				<div style={headlineStyle}>
					Play solo tabletop RPGs with an AI game master and your own local
					campaign files.
				</div>
				<div style={subheadStyle}>
					Bardo grounds your AI client in the real state of your campaign so you
					can play without a human GM at the table.
				</div>
			</div>

			<div style={footerStyle}>
				<span>Solo Play</span>
				<span>AI GM</span>
				<span>Local Truth</span>
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
