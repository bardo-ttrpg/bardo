import { permanentRedirect } from "next/navigation";

export default function LegalIndexPage() {
	permanentRedirect("/legal/terms");
}
