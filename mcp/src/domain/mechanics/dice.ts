import { randomInt } from "node:crypto";

export type DiceRng = (maxInclusive: number) => number;

export type AdvantageMode = "none" | "advantage" | "disadvantage";

export type ParsedDiceExpression = {
	normalizedExpression: string;
	diceCount: number;
	diceSides: number;
	modifier: number;
};

export type DiceRollResult = ParsedDiceExpression & {
	rolls: number[];
	subtotal: number;
	total: number;
	minPossible: number;
	maxPossible: number;
};

function defaultRng(maxInclusive: number): number {
	return randomInt(1, maxInclusive + 1);
}

export function parseDiceExpression(expression: string): ParsedDiceExpression {
	const normalizedInput = expression.trim();
	const match = normalizedInput.match(
		/^(\d{1,3})d(\d{1,4})(?:\s*([+-])\s*(\d{1,4}))?$/i,
	);
	if (!match) {
		throw new Error("Dice expression must match NdM or NdM+K format.");
	}

	const diceCount = Number.parseInt(match[1] ?? "", 10);
	const diceSides = Number.parseInt(match[2] ?? "", 10);
	const sign = match[3];
	const modifierMagnitude = match[4] ? Number.parseInt(match[4], 10) : 0;
	const modifier = sign === "-" ? -modifierMagnitude : modifierMagnitude;

	if (diceCount < 1 || diceCount > 100) {
		throw new Error("Dice count must be between 1 and 100.");
	}
	if (diceSides < 2 || diceSides > 1000) {
		throw new Error("Dice sides must be between 2 and 1000.");
	}
	if (Math.abs(modifier) > 1000) {
		throw new Error("Dice modifier must be between -1000 and 1000.");
	}

	let normalizedExpression = `${diceCount}d${diceSides}`;
	if (modifier > 0) {
		normalizedExpression += `+${modifier}`;
	}
	if (modifier < 0) {
		normalizedExpression += `${modifier}`;
	}

	return {
		normalizedExpression,
		diceCount,
		diceSides,
		modifier,
	};
}

export function rollDiceExpression(args: {
	expression: string;
	rng?: DiceRng;
}): DiceRollResult {
	const parsed = parseDiceExpression(args.expression);
	const rng = args.rng ?? defaultRng;
	const rolls: number[] = [];
	for (let i = 0; i < parsed.diceCount; i += 1) {
		const next = rng(parsed.diceSides);
		if (!Number.isInteger(next) || next < 1 || next > parsed.diceSides) {
			throw new Error(
				`Random generator produced invalid die value ${String(next)}.`,
			);
		}
		rolls.push(next);
	}

	const subtotal = rolls.reduce((sum, roll) => sum + roll, 0);
	return {
		...parsed,
		rolls,
		subtotal,
		total: subtotal + parsed.modifier,
		minPossible: parsed.diceCount + parsed.modifier,
		maxPossible: parsed.diceCount * parsed.diceSides + parsed.modifier,
	};
}

export function rollD20Check(args: {
	modifier: number;
	advantage: AdvantageMode;
	rng?: DiceRng;
}): {
	rolls: number[];
	selectedRoll: number;
	total: number;
} {
	const rng = args.rng ?? defaultRng;
	const first = rng(20);
	if (!Number.isInteger(first) || first < 1 || first > 20) {
		throw new Error(
			`Random generator produced invalid d20 roll ${String(first)}.`,
		);
	}

	if (args.advantage === "none") {
		return {
			rolls: [first],
			selectedRoll: first,
			total: first + args.modifier,
		};
	}

	const second = rng(20);
	if (!Number.isInteger(second) || second < 1 || second > 20) {
		throw new Error(
			`Random generator produced invalid d20 roll ${String(second)}.`,
		);
	}

	const selectedRoll =
		args.advantage === "advantage"
			? Math.max(first, second)
			: Math.min(first, second);

	return {
		rolls: [first, second],
		selectedRoll,
		total: selectedRoll + args.modifier,
	};
}
