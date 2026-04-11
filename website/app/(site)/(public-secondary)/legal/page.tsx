import { permanentRedirect } from "next/navigation";
import { createPrivateMetadata } from "@/lib/site-metadata";

export const metadata = createPrivateMetadata("Legal");

export default function LegalIndexPage() {
	permanentRedirect("/legal/terms");
}
