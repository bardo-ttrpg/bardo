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
		<div className="px-4 py-12 sm:px-6">
			<BridgeApprovalClient sessionId={sessionId} />
		</div>
	);
}
