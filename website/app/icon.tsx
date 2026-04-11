import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = {
	width: 64,
	height: 64,
};
export const contentType = "image/png";

export default function Icon() {
	return new ImageResponse(
		<div
			style={{
				alignItems: "center",
				background: "#101010",
				borderRadius: 14,
				color: "#f5f1e8",
				display: "flex",
				fontSize: 38,
				fontWeight: 800,
				height: "100%",
				justifyContent: "center",
				letterSpacing: "-0.08em",
				width: "100%",
			}}
		>
			B
		</div>,
		size,
	);
}
