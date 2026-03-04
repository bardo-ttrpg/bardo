"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavPathCurrent } from "@/lib/nav-paths";

type SiteNavLinkProps = {
	href: string;
	label: string;
	className: string;
};

export default function SiteNavLink({
	href,
	label,
	className,
}: SiteNavLinkProps) {
	const pathname = usePathname();
	const isCurrent = isNavPathCurrent(pathname, href);

	return (
		<Link
			href={href}
			prefetch={false}
			className={className}
			aria-current={isCurrent ? "page" : undefined}
		>
			{label}
		</Link>
	);
}
