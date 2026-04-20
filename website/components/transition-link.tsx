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
	return (
		<Link
			{...props}
			prefetch={prefetch}
			transitionTypes={
				transitionTypes.length > 0 ? transitionTypes : undefined
			}
		/>
	);
}
