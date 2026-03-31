import { createPrivateMetadata } from "@/lib/site-metadata";
import { Minimal404Page } from "../_components/site-shells";

export const metadata = createPrivateMetadata("404");

export default function Explicit404Page() {
	return <Minimal404Page />;
}
