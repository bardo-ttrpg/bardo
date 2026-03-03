"use client";

import { useEffect, useState } from "react";
import { approveCliSession } from "./approval-controller";

export function CliApprovalClient({ sessionId }: { sessionId: string }) {
	const [state, setState] = useState<{
		status: "pending" | "approved" | "error";
		message: string;
	}>({
		status: "pending",
		message: "Approving CLI access...",
	});

	useEffect(() => {
		let active = true;
		void approveCliSession({ sessionId }).then((result) => {
			if (!active) return;
			setState({
				status: result.ok ? "approved" : "error",
				message: result.message,
			});
		});
		return () => {
			active = false;
		};
	}, [sessionId]);

	return (
		<div className="mx-auto max-w-2xl border border-border p-8">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				/ CLI login
			</p>
			<h1 className="mb-3 text-xl font-semibold text-foreground">
				{state.status === "approved"
					? "CLI access approved"
					: state.status === "error"
						? "Approval failed"
						: "Waiting for approval"}
			</h1>
			<p className="text-sm text-muted-foreground">{state.message}</p>
			{state.status === "approved" ? (
				<p className="mt-4 text-xs text-muted-foreground">
					You can close this tab and return to your terminal.
				</p>
			) : null}
		</div>
	);
}
