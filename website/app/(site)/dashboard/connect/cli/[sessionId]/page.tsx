import { CliApprovalClient } from "./approval-client";

export default async function CliApprovalPage({
	params,
}: {
	params: Promise<{ sessionId: string }>;
}) {
	const { sessionId } = await params;

	return (
		<div className="px-4 py-12 sm:px-6">
			<CliApprovalClient sessionId={sessionId} />
		</div>
	);
}
