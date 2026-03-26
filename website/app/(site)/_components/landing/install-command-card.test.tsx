import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import InstallCommandCard from "./install-command-card";

describe("InstallCommandCard", () => {
	test("renders install tabs for macos/linux and windows", () => {
		const markup = renderToStaticMarkup(<InstallCommandCard />);

		expect(markup).toContain("Install the local bridge");
		expect(markup).toContain("macOS / Linux");
		expect(markup).toContain("Windows");
		expect(markup).toContain("curl -fsSL https://www.bardo.gg/install | sh");
		expect(markup).not.toContain("Detected OS:");
	});
});
