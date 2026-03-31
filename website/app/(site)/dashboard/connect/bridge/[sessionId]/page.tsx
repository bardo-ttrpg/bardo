import { createPrivateMetadata } from "@/lib/site-metadata";
import { BridgeApprovalClient } from "./approval-client";

export const metadata = createPrivateMetadata("Approve Bridge Session");

export default async function BridgeApprovalPage({
	params,
}: {
	params: Promise<{ sessionId: string }>;
}) {
	const { sessionId } = await params;

	return (
		<div className="px-6 py-16 sm:py-24">
			<BridgeApprovalClient sessionId={sessionId} />
		</div>
	);
}
