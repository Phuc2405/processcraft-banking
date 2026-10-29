import { createContext, useContext } from 'react';

/** How much the map stage is scaled to fit the screen. */
export const StageScaleContext = createContext<number>(1);

export const useStageScale = (): number => useContext(StageScaleContext);
