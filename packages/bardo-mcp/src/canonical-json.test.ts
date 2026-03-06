import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "./canonical-json";

describe("canonicalJsonStringify", () => {
	test("sorts object keys recursively and preserves array order", () => {
		const value = {
			z: 1,
			a: {
				y: true,
				x: "ok",
			},
			items: [
				{ b: 2, a: 1 },
				{ d: 4, c: 3 },
			],
		};

		expect(canonicalJsonStringify(value)).toBe(
			'{"a":{"x":"ok","y":true},"items":[{"a":1,"b":2},{"c":3,"d":4}],"z":1}',
		);
	});
});
