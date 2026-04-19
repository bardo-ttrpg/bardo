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
		return (
			<Link
				{...props}
				prefetch={true}
				transitionTypes={transitionTypes}
			/>
		);
	}

	return (
		<Link
			{...props}
			prefetch={false}
			transitionTypes={transitionTypes}
		/>
	);
}
