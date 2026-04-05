import type { ReactNode } from "react";
import { ViewTransition } from "react";

export function BardoViewTransition({
	children,
	name,
}: {
	children: ReactNode;
	name?: string;
}) {
	return <ViewTransition name={name}>{children}</ViewTransition>;
}
