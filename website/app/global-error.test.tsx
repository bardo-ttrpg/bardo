import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import GlobalError from "./global-error";

describe("GlobalError", () => {
	test("renders a root-level fallback document", () => {
		const markup = renderToStaticMarkup(
			<GlobalError error={new Error("boom")} reset={() => {}} />,
		);

		expect(markup).toContain("<html");
		expect(markup).toContain("<body");
		expect(markup).toContain("Something went wrong");
		expect(markup).toContain("Try again");
	});
});
