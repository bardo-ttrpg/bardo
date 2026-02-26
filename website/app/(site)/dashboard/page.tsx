import { auth } from "@clerk/nextjs/server";
import { DashboardClient } from "./dashboard-client";

export const metadata = {
	title: "Dashboard",
};

export default async function DashboardPage() {
	const { userId: _userId, redirectToSignIn } = await auth();

	if (!_userId) {
		return redirectToSignIn();
	}

	return <DashboardClient />;
}
