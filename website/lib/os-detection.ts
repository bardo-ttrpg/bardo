export type InstallOs = "macos" | "linux" | "windows";

export const INSTALL_COMMANDS: Record<
	InstallOs,
	{ label: string; command: string }
> = {
	macos: {
		label: "macOS",
		command: "curl -fsSL https://bardo.gg | sh",
	},
	linux: {
		label: "Linux",
		command: "curl -fsSL https://bardo.gg | sh",
	},
	windows: {
		label: "Windows",
		command: "irm https://bardo.gg/install.ps1 | iex",
	},
};

export function detectInstallOs(args: {
	platform?: string | null;
	userAgent?: string | null;
}): InstallOs {
	const value = `${args.platform ?? ""} ${args.userAgent ?? ""}`.toLowerCase();

	if (value.includes("win")) {
		return "windows";
	}
	if (
		value.includes("mac") ||
		value.includes("darwin") ||
		value.includes("iphone") ||
		value.includes("ipad")
	) {
		return "macos";
	}
	if (
		value.includes("linux") ||
		value.includes("x11") ||
		value.includes("ubuntu") ||
		value.includes("cros")
	) {
		return "linux";
	}

	return "macos";
}
