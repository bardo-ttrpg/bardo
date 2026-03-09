"use client";

import { useState, useSyncExternalStore } from "react";
import {
	detectInstallOs,
	INSTALL_COMMANDS,
	type InstallOs,
} from "@/lib/os-detection";

type InstallTab = "unix" | "windows";

const INSTALL_TAB_OPTIONS: readonly { id: InstallTab; label: string }[] = [
	{ id: "unix", label: "macOS / Linux" },
	{ id: "windows", label: "Windows" },
] as const;

type NavigatorWithUserAgentData = Navigator & {
	userAgentData?: {
		platform?: string;
	};
};

function detectBrowserOs(): InstallOs {
	if (typeof navigator === "undefined") {
		return "macos";
	}

	const browser = navigator as NavigatorWithUserAgentData;
	return detectInstallOs({
		platform: browser.userAgentData?.platform ?? browser.platform,
		userAgent: browser.userAgent,
	});
}

export default function InstallCommandCard() {
	const detectedInstallTab = useSyncExternalStore(
		() => () => undefined,
		() => (detectBrowserOs() === "windows" ? "windows" : "unix"),
		() => "unix",
	);
	const [manualInstallTab, setManualInstallTab] = useState<InstallTab | null>(
		null,
	);
	const installTab = manualInstallTab ?? detectedInstallTab;

	const command =
		installTab === "windows"
			? INSTALL_COMMANDS.windows.command
			: INSTALL_COMMANDS.macos.command;

	return (
		<div className="mb-8 border border-border bg-background/50 p-4">
			<p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				/ Install Bardo CLI
			</p>
			<div className="mb-3 flex flex-wrap gap-2">
				{INSTALL_TAB_OPTIONS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setManualInstallTab(tab.id)}
						aria-pressed={installTab === tab.id}
						className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
							installTab === tab.id
								? "border-foreground text-foreground"
								: "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
						}`}
					>
						{tab.label}
					</button>
				))}
			</div>
			<pre className="overflow-x-auto border border-border bg-muted/20 p-3 font-mono text-xs text-foreground">
				{command}
			</pre>
			<p className="mt-2 text-xs text-muted-foreground">
				After install, run `bardo login` from Dashboard, then `bardo connect`.
			</p>
		</div>
	);
}
