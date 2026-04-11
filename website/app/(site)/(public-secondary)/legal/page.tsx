import { createPrivateMetadata } from "@/lib/site-metadata";
import { permanentRedirect } from "next/navigation";

export const metadata = createPrivateMetadata("Legal");

export default function LegalIndexPage() {
	permanentRedirect("/legal/terms");
}
