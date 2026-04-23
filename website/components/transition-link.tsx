import Link from "next/link";
import type { ComponentProps } from "react";
import { externalLinkRel, isExternalHref } from "@/lib/link-target";

type TransitionLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
	prefetch?: boolean;
};

export function TransitionLink({
	href,
	prefetch = false,
	transitionTypes = ["bardo-route"],
	target,
	rel,
	...props
}: TransitionLinkProps) {
	if (typeof href === "string" && isExternalHref(href)) {
		return (
			<a
				{...props}
				href={href}
				target={target ?? "_blank"}
				rel={externalLinkRel(rel)}
			/>
		);
	}

	return (
		<Link
			{...props}
			href={href}
			target={target}
			rel={rel}
			prefetch={prefetch}
			transitionTypes={transitionTypes.length > 0 ? transitionTypes : undefined}
		/>
	);
}
