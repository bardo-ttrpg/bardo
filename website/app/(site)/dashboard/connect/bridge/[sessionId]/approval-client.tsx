"use client";

import { useEffect, useState } from "react";
import { approveBridgeSession } from "./approval-controller";

export function BridgeApprovalClient({ sessionId }: { sessionId: string }) {
	const [state, setState] = useState<{
		status: "pending" | "approved" | "error";
		message: string;
	}>({
		status: "pending",
		message: "Approving bridge session...",
	});

	useEffect(() => {
		let active = true;
		void approveBridgeSession({ sessionId }).then((result) => {
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
		<div className="mx-auto max-w-2xl border border-border bg-card p-8">
			<p className="ui-label mb-3 text-muted-foreground">Bridge approval</p>
			<h1 className="mb-3 font-reading-heading text-4xl text-foreground">
				{state.status === "approved"
					? "Bridge access approved"
					: state.status === "error"
						? "Approval failed"
						: "Waiting for approval"}
			</h1>
			<p className="font-reading-body text-muted-foreground">{state.message}</p>
			{state.status === "approved" ? (
				<p className="technical-meta mt-4 text-muted-foreground">
					You can close this tab and return to your AI client.
				</p>
			) : null}
		</div>
	);
}
