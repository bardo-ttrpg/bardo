import { permanentRedirect } from "next/navigation";
import { createPrivateMetadata } from "@/lib/site-metadata";

export const metadata = createPrivateMetadata("AI Policy");

export default function AiPolicyPage() {
	permanentRedirect("/legal/terms");
}
