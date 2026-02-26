import { describe, expect, test } from "bun:test";
import { parseDiceExpression, rollDiceExpression } from "./dice";

describe("dice mechanics", () => {
	test("parses standard NdM+K expressions", () => {
		const parsed = parseDiceExpression("2d6 + 3");
		expect(parsed.diceCount).toBe(2);
		expect(parsed.diceSides).toBe(6);
		expect(parsed.modifier).toBe(3);
		expect(parsed.normalizedExpression).toBe("2d6+3");
	});

	test("rolls dice with deterministic rng callback", () => {
		const rngValues = [4, 1];
		const result = rollDiceExpression({
			expression: "2d6+3",
			rng: () => rngValues.shift() ?? 1,
		});
		expect(result.rolls).toEqual([4, 1]);
		expect(result.subtotal).toBe(5);
		expect(result.total).toBe(8);
		expect(result.minPossible).toBe(5);
		expect(result.maxPossible).toBe(15);
	});
});
