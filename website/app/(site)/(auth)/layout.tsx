import type { ReactNode } from "react";
import { PublicPageShell } from "../_components/site-shells";

export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<PublicPageShell className="justify-center">
			<div className="w-full max-w-xl">{children}</div>
		</PublicPageShell>
	);
}
