import { createPrivateMetadata } from "@/lib/site-metadata";
import { permanentRedirect } from "next/navigation";

export const metadata = createPrivateMetadata("AI Policy");

export default function AiPolicyPage() {
	permanentRedirect("/legal/terms");
}
