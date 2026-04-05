import { ViewTransition } from "react";
import type { ReactNode } from "react";

export function BardoViewTransition({
	children,
	name,
}: {
	children: ReactNode;
	name?: string;
}) {
	return <ViewTransition name={name}>{children}</ViewTransition>;
}
