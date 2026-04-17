import * as React from "react";
import type { ReactNode } from "react";

export function BardoViewTransition({
	children,
	name,
	variant,
}: {
	children: ReactNode;
	name?: string;
	variant?: "fade";
}) {
	const ViewTransition =
		"ViewTransition" in React
			? (React.ViewTransition as
					| ((props: {
							children: ReactNode;
							name?: string;
							variant?: "fade";
					  }) => React.ReactNode)
					| undefined)
			: undefined;

	if (!ViewTransition) {
		return <>{children}</>;
	}

	return (
		<ViewTransition name={name} variant={variant}>
			{children}
		</ViewTransition>
	);
}
