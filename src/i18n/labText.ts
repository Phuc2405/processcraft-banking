/**
 * The label of a box on a Build Lab canvas in the active language: a starter box ("Payment Request", "Settled") or a node
 * type's default name ("Core Ledger Check"). A label the learner typed is shown as typed.
 */

import { nodeLabelText } from './catalogVi';
import { canvasLabel } from './challengeVi';

export const labLabel = (label: string): string => {
  const starter = canvasLabel(label);
  return starter !== label ? starter : nodeLabelText(label);
};
