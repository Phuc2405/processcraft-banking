import { createContext, useContext } from 'react';

/**
 * How much the map stage is scaled to fit the screen. Overlays that are positioned in screen pixels (the walkthrough's
 * explanation card) need it to turn a position on the stage into a position in the panel.
 */
export const StageScaleContext = createContext<number>(1);

export const useStageScale = (): number => useContext(StageScaleContext);
