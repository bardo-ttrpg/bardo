import Link from "next/link";
import type { ComponentProps } from "react";

type TransitionLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
	prefetch?: boolean;
};

export function TransitionLink({
	prefetch = false,
	transitionTypes = ["bardo-route"],
	...props
}: TransitionLinkProps) {
	if (prefetch) {
		return <Link prefetch={true} transitionTypes={transitionTypes} {...props} />;
	}

	return <Link prefetch={false} transitionTypes={transitionTypes} {...props} />;
}
