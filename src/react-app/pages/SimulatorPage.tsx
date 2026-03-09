import { useMemo, useState } from "react";
import {
	defaultSimulatorInput,
	evaluateFourthDownDecision,
	formatFieldPosition,
	formatScoreDifferential,
	type SimulatorInput,
} from "../utils/fourthDownModel";

export function SimulatorPage() {
	const [input, setInput] = useState<SimulatorInput>(defaultSimulatorInput);

	const summary = useMemo(() => evaluateFourthDownDecision(input), [input]);

	return (
		<section className="section page-intro">
			<div className="container simulator-layout">
				<div className="section-heading simulator-heading">
					<p className="eyebrow">4th Down Simulator</p>
					<h1>Test the decision, not the convention.</h1>
					<p>
						This first-pass model uses transparent assumptions to show why teams
						are often more conservative than the underlying decision math
						suggests.
					</p>
				</div>

				<div className="simulator-grid">
					<form className="simulator-card simulator-form">
						<div className="field-grid">
							<label>
								<span>Yard line</span>
								<input
									type="number"
									min="1"
									max="99"
									value={input.yardLine}
									onChange={(event) =>
										setInput((current) => ({
											...current,
											yardLine: Number(event.target.value),
										}))
									}
								/>
								<small>1 = own goal line, 99 = opponent 1</small>
							</label>
							<label>
								<span>Yards to go</span>
								<input
									type="number"
									min="1"
									max="25"
									value={input.yardsToGo}
									onChange={(event) =>
										setInput((current) => ({
											...current,
											yardsToGo: Number(event.target.value),
										}))
									}
								/>
							</label>
							<label>
								<span>Quarter</span>
								<select
									value={input.quarter}
									onChange={(event) =>
										setInput((current) => ({
											...current,
											quarter: Number(event.target.value),
										}))
									}
								>
									<option value="1">1st</option>
									<option value="2">2nd</option>
									<option value="3">3rd</option>
									<option value="4">4th</option>
								</select>
							</label>
							<label>
								<span>Time remaining</span>
								<input
									type="text"
									inputMode="numeric"
									pattern="[0-9]{1,2}:[0-9]{2}"
									value={input.timeRemaining}
									onChange={(event) =>
										setInput((current) => ({
											...current,
											timeRemaining: event.target.value,
										}))
									}
								/>
								<small>Format: MM:SS</small>
							</label>
							<label className="field-grid__full">
								<span>Score differential</span>
								<input
									type="number"
									min="-30"
									max="30"
									value={input.scoreDifferential}
									onChange={(event) =>
										setInput((current) => ({
											...current,
											scoreDifferential: Number(event.target.value),
										}))
									}
								/>
								<small>Positive if your team is leading</small>
							</label>
						</div>
					</form>

					<div className="simulator-card simulator-results">
						<div className="recommendation">
							<p className="eyebrow">Recommendation</p>
							<h2>{summary.recommendation}</h2>
							<p>{summary.explanation}</p>
						</div>
						<div className="decision-summary">
							<div>
								<span>Situation</span>
								<strong>
									{formatFieldPosition(summary.context.yardLine)}, 4th-and-
									{summary.context.yardsToGo}
								</strong>
							</div>
							<div>
								<span>Game state</span>
								<strong>
									Q{summary.context.quarter}, {summary.context.timeRemaining},{" "}
									{formatScoreDifferential(summary.context.scoreDifferential)}
								</strong>
							</div>
							<div>
								<span>Best expected value</span>
								<strong>{summary.bestExpectedValue.toFixed(2)} points</strong>
							</div>
							<div>
								<span>Estimated conversion rate</span>
								<strong>{Math.round(summary.goForIt.conversionRate * 100)}%</strong>
							</div>
						</div>
						<div className="option-table" aria-label="Decision summary">
							<div>
								<span>Go for it</span>
								<strong>{summary.goForIt.expectedValue.toFixed(2)}</strong>
							</div>
							<div>
								<span>Punt</span>
								<strong>{summary.punt.expectedValue.toFixed(2)}</strong>
							</div>
							<div>
								<span>Field goal</span>
								<strong>{summary.fieldGoal.expectedValue.toFixed(2)}</strong>
							</div>
						</div>
						<p className="simulator-note">
							The model uses transparent expected-points assumptions, distance
							lookups, and only light late-game adjustments so the recommendation
							stays easy to inspect.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
