import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = {
	width: 180,
	height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
	return new ImageResponse(
		(
			<div
				style={{
					alignItems: "center",
					background:
						"linear-gradient(135deg, #111111 0%, #1d1d1d 60%, #2b2b2b 100%)",
					borderRadius: 42,
					color: "#f5f1e8",
					display: "flex",
					fontSize: 108,
					fontWeight: 800,
					height: "100%",
					justifyContent: "center",
					letterSpacing: "-0.1em",
					width: "100%",
				}}
			>
				B
			</div>
		),
		size,
	);
}
