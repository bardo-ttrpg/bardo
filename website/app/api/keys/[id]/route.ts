import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ─── DELETE /api/keys/[id] ────────────────────────────────────────────────────
// Revokes a Clerk API key.

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id: clerkKeyId } = await params;
	if (!clerkKeyId) {
		return NextResponse.json({ error: "Missing key ID" }, { status: 400 });
	}

	const clerk = await clerkClient();

	// Verify the key belongs to this user before revoking.
	let clerkKey: Awaited<ReturnType<(typeof clerk)["apiKeys"]["get"]>>;
	try {
		clerkKey = await clerk.apiKeys.get(clerkKeyId);
	} catch {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	if (clerkKey.subject !== userId) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	try {
		await clerk.apiKeys.delete(clerkKeyId);
	} catch (err) {
		console.error("[api/keys/[id]] clerk.apiKeys.delete failed:", err);
		return NextResponse.json(
			{ error: "Failed to delete key" },
			{ status: 500 },
		);
	}

	return NextResponse.json({ deleted: true });
}
