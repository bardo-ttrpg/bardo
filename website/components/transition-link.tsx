import Link from "next/link";
import type { ComponentProps } from "react";

type TransitionLinkProps = ComponentProps<typeof Link>;

export function TransitionLink({
	transitionTypes = ["bardo-route"],
	...props
}: TransitionLinkProps) {
	return <Link transitionTypes={transitionTypes} {...props} />;
}

