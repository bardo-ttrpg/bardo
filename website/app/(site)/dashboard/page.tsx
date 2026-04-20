import { createPrivateMetadata } from "@/lib/site-metadata";
import { DashboardClient } from "./dashboard-client";

export const metadata = createPrivateMetadata("Dashboard");

export default function DashboardPage() {
	return <DashboardClient />;
}
