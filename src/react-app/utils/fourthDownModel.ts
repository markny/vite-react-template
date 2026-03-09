export type SimulatorInput = {
	yardLine: number;
	yardsToGo: number;
	quarter: number;
	timeRemaining: string;
	scoreDifferential: number;
};

export const defaultSimulatorInput: SimulatorInput = {
	yardLine: 58,
	yardsToGo: 4,
	quarter: 4,
	timeRemaining: "08:42",
	scoreDifferential: -3,
};

type DecisionOption = {
	expectedValue: number;
};

type GoForItOption = DecisionOption & {
	conversionRate: number;
};

type FieldGoalOption = DecisionOption & {
	distance: number;
	isAvailable: boolean;
	successRate: number;
};

export type SimulatorSummary = {
	context: SimulatorInput;
	recommendation: "Go for It" | "Punt" | "Field Goal";
	explanation: string;
	bestExpectedValue: number;
	goForIt: GoForItOption;
	punt: DecisionOption;
	fieldGoal: FieldGoalOption;
};

const conversionProbabilityTable: Record<number, number> = {
	1: 0.72,
	2: 0.63,
	3: 0.57,
	4: 0.51,
	5: 0.45,
	6: 0.4,
	7: 0.36,
	8: 0.32,
	9: 0.29,
	10: 0.26,
};

// Offensive expected points by field position from the offense's own goal line.
// We use 10-yard anchors and linearly interpolate between them for a smoother curve.
const expectedPointsAnchors = [
	{ yardLine: 1, points: -0.5 },
	{ yardLine: 10, points: -0.5 },
	{ yardLine: 20, points: 0.1 },
	{ yardLine: 30, points: 0.6 },
	{ yardLine: 40, points: 1.0 },
	{ yardLine: 50, points: 1.5 },
	{ yardLine: 60, points: 2.0 },
	{ yardLine: 70, points: 2.6 },
	{ yardLine: 80, points: 3.2 },
	{ yardLine: 90, points: 4.2 },
	{ yardLine: 99, points: 5.2 },
] as const;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function parseClock(timeRemaining: string) {
	const match = /^(\d{1,2}):(\d{2})$/.exec(timeRemaining.trim());

	if (!match) {
		return 15 * 60;
	}

	const minutes = Number(match[1]);
	const seconds = Number(match[2]);

	return clamp(minutes * 60 + seconds, 0, 15 * 60);
}

function normalizeInput(input: SimulatorInput): SimulatorInput {
	return {
		yardLine: clamp(Math.round(input.yardLine || 1), 1, 99),
		yardsToGo: clamp(Math.round(input.yardsToGo || 1), 1, 25),
		quarter: clamp(Math.round(input.quarter || 1), 1, 4),
		timeRemaining: input.timeRemaining,
		scoreDifferential: clamp(Math.round(input.scoreDifferential || 0), -30, 30),
	};
}

function interpolateExpectedPoints(yardLine: number) {
	const normalizedYardLine = clamp(yardLine, 1, 99);

	for (let index = 1; index < expectedPointsAnchors.length; index += 1) {
		const previous = expectedPointsAnchors[index - 1];
		const current = expectedPointsAnchors[index];

		if (normalizedYardLine <= current.yardLine) {
			const span = current.yardLine - previous.yardLine;
			const progress = span === 0 ? 0 : (normalizedYardLine - previous.yardLine) / span;

			return previous.points + (current.points - previous.points) * progress;
		}
	}

	return expectedPointsAnchors[expectedPointsAnchors.length - 1]?.points ?? 0;
}

function getConversionProbability(yardsToGo: number) {
	const normalizedYardsToGo = clamp(Math.round(yardsToGo), 1, 25);

	if (normalizedYardsToGo <= 10) {
		return conversionProbabilityTable[normalizedYardsToGo];
	}

	return clamp(0.26 - (normalizedYardsToGo - 10) * 0.015, 0.12, 0.26);
}

function getFieldGoalSuccessRate(distance: number) {
	if (distance <= 27) {
		return 0.99;
	}

	if (distance <= 32) {
		return 0.97;
	}

	if (distance <= 37) {
		return 0.94;
	}

	if (distance <= 42) {
		return 0.88;
	}

	if (distance <= 47) {
		return 0.79;
	}

	if (distance <= 52) {
		return 0.66;
	}

	if (distance <= 57) {
		return 0.45;
	}

	return 0.2;
}

function getNetPuntDistance(yardLine: number) {
	if (yardLine < 40) {
		return 38;
	}

	if (yardLine <= 59) {
		return 34;
	}

	if (yardLine <= 74) {
		return 28;
	}

	if (yardLine <= 84) {
		return 20;
	}

	return 12;
}

function getLateGameAdjustments(input: SimulatorInput) {
	if (input.quarter !== 4) {
		return { go: 0, fieldGoal: 0, punt: 0 };
	}

	// These are intentionally small nudges rather than a separate win-probability model.
	const secondsRemaining = parseClock(input.timeRemaining);
	const lateWeight = clamp((480 - secondsRemaining) / 480, 0, 1);
	const scoreWeight = clamp(Math.abs(input.scoreDifferential) / 14, 0, 1);

	if (input.scoreDifferential < 0) {
		return {
			go: 0.18 * lateWeight * Math.max(scoreWeight, 0.35),
			fieldGoal: input.scoreDifferential >= -3
				? 0.04 * lateWeight * Math.max(scoreWeight, 0.35)
				: -0.03 * lateWeight * scoreWeight,
			punt: -0.16 * lateWeight * Math.max(scoreWeight, 0.5),
		};
	}

	if (input.scoreDifferential > 0) {
		return {
			go: -0.08 * lateWeight * Math.max(scoreWeight, 0.25),
			fieldGoal: 0.08 * lateWeight * Math.max(scoreWeight, 0.25),
			punt: 0.12 * lateWeight * Math.max(scoreWeight, 0.25),
		};
	}

	return { go: 0, fieldGoal: 0, punt: 0 };
}

function buildExplanation(
	input: SimulatorInput,
	recommendation: SimulatorSummary["recommendation"],
	conversionProbability: number,
	adjustments: ReturnType<typeof getLateGameAdjustments>,
	fieldGoalDistance: number,
) {
	const fieldPositionNote =
		input.yardLine >= 60
			? "Field position already favors aggression because a turnover gives the opponent a short field."
			: "The baseline tradeoff is driven mostly by conversion odds versus surrendering field position.";

	if (recommendation === "Go for It") {
		const urgencyNote =
			adjustments.go > 0.02
				? "Trailing late slightly increases the value of keeping the ball."
				: "The expected-points math still leans toward offense here.";

		return `${fieldPositionNote} A ${Math.round(conversionProbability * 100)}% conversion estimate keeps going-for-it competitive. ${urgencyNote}`;
	}

	if (recommendation === "Field Goal") {
		const leverageNote =
			adjustments.fieldGoal > 0.02
				? "Late-game context modestly supports taking near-certain points."
				: "The kick produces the cleanest expected-points result in this range.";

		return `${fieldPositionNote} From roughly ${fieldGoalDistance} yards, the field goal remains credible enough to beat the alternatives. ${leverageNote}`;
	}

	const puntNote =
		adjustments.punt > 0.02
			? "Protecting field position matters a bit more when leading late."
			: "The field-position swing from the punt outweighs the offensive upside.";

	return `${fieldPositionNote} ${puntNote}`;
}

export function evaluateFourthDownDecision(
	rawInput: SimulatorInput,
): SimulatorSummary {
	const input = normalizeInput(rawInput);

	const conversionRate = getConversionProbability(input.yardsToGo);
	const successfulConversionYardLine = clamp(
		input.yardLine + input.yardsToGo,
		1,
		99,
	);
	const goSuccessValue = interpolateExpectedPoints(successfulConversionYardLine);
	const goFailureValue = -interpolateExpectedPoints(100 - input.yardLine);
	const baseGoExpectedValue =
		conversionRate * goSuccessValue + (1 - conversionRate) * goFailureValue;

	const fieldGoalDistance = 117 - input.yardLine;
	const fieldGoalSuccessRate = getFieldGoalSuccessRate(fieldGoalDistance);
	const fieldGoalMissValue = -interpolateExpectedPoints(100 - input.yardLine);
	const baseFieldGoalExpectedValue =
		fieldGoalSuccessRate * 3 + (1 - fieldGoalSuccessRate) * fieldGoalMissValue;

	const netPuntDistance = getNetPuntDistance(input.yardLine);
	const grossFieldPositionAfterPunt = input.yardLine + netPuntDistance;
	const opponentStartAfterPunt =
		grossFieldPositionAfterPunt >= 100
			? 20
			: clamp(100 - grossFieldPositionAfterPunt, 1, 99);
	const basePuntExpectedValue = -interpolateExpectedPoints(opponentStartAfterPunt);

	const adjustments = getLateGameAdjustments(input);
	const goExpectedValue = baseGoExpectedValue + adjustments.go;
	const puntExpectedValue = basePuntExpectedValue + adjustments.punt;
	const fieldGoalExpectedValue =
		baseFieldGoalExpectedValue + adjustments.fieldGoal;

	const options = [
		{ label: "Go for It" as const, expectedValue: goExpectedValue },
		{ label: "Punt" as const, expectedValue: puntExpectedValue },
		{
			label: "Field Goal" as const,
			expectedValue: fieldGoalExpectedValue,
		},
	];

	const bestOption = options.reduce((best, option) =>
		option.expectedValue > best.expectedValue ? option : best,
	);

	return {
		context: input,
		recommendation: bestOption.label,
		explanation: buildExplanation(
			input,
			bestOption.label,
			conversionRate,
			adjustments,
			fieldGoalDistance,
		),
		bestExpectedValue: bestOption.expectedValue,
		goForIt: {
			expectedValue: goExpectedValue,
			conversionRate,
		},
		punt: {
			expectedValue: puntExpectedValue,
		},
		fieldGoal: {
			expectedValue: fieldGoalExpectedValue,
			distance: fieldGoalDistance,
			isAvailable: true,
			successRate: fieldGoalSuccessRate,
		},
	};
}

export function formatFieldPosition(yardLine: number) {
	if (yardLine === 50) {
		return "Midfield";
	}

	if (yardLine < 50) {
		return `Own ${yardLine}`;
	}

	return `Opp ${100 - yardLine}`;
}

export function formatScoreDifferential(scoreDifferential: number) {
	if (scoreDifferential > 0) {
		return `Leading by ${scoreDifferential}`;
	}

	if (scoreDifferential < 0) {
		return `Trailing by ${Math.abs(scoreDifferential)}`;
	}

	return "Tied game";
}
