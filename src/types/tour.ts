/** What the guided tours of both halves share: the Living Bank's walkthrough and the Build Lab's tour. */

/** The learner's answer to a step's quiz: the option picked, and whether it was right. */
export interface QuizAnswer {
  picked: number;
  correct: boolean;
}

/** How a step of a tour reads: plain, a good outcome, a bad one, or a warning. */
export type StepTone = 'neutral' | 'good' | 'bad' | 'warn';
