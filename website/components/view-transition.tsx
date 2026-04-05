import * as React from "react";
import type { ReactNode } from "react";

export function BardoViewTransition({
	children,
	name,
}: {
	children: ReactNode;
	name?: string;
}) {
	const ViewTransition =
		"ViewTransition" in React
			? (React.ViewTransition as
					| ((props: { children: ReactNode; name?: string }) => React.ReactNode)
					| undefined)
			: undefined;

	if (!ViewTransition) {
		return <>{children}</>;
	}

	return <ViewTransition name={name}>{children}</ViewTransition>;
}
