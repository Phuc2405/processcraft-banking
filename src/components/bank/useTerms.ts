import { useMemo } from 'react';
import {
  departmentName,
  departmentTip,
  departmentTitle,
  externalLabel,
  externalSub,
  externalTip,
  placeTip,
  placeTitle,
  stationCaption,
  stationName,
  stationTip,
  stationTitle,
  termText,
  type TermMode,
} from '../../sim/terms';
import type { DepartmentId, ExternalId, PlaceId, StationId } from '../../sim/topology';
import { useBankStore } from '../../store/bankStore';

export interface Terms {
  mode: TermMode;
  beginner: boolean;
  /** Free text, with jargon swapped for plain words in Beginner mode. */
  t(text: string): string;
  /** The name on a desk card. */
  station(id: StationId): string;
  /** The full name of a desk, for headings and tooltips. */
  stationTitle(id: StationId): string;
  /** One sentence about what a desk is. */
  tip(id: StationId): string;
  /** The brand caption of a market-branded desk, or null. */
  caption(id: StationId): string | null;
  department(id: DepartmentId): string;
  departmentTitle(id: DepartmentId): string;
  departmentTip(id: DepartmentId): string;
  external(id: ExternalId): string;
  externalSub(id: ExternalId): string;
  externalTip(id: ExternalId): string;
  place(id: PlaceId): string;
  placeTip(id: PlaceId): string;
}

/** Builds the vocabulary for a mode. Exported so tests and non-React code can use the same object. */
export function termsFor(mode: TermMode): Terms {
  return {
    mode,
    beginner: mode === 'beginner',
    t: (text) => termText(text, mode),
    station: (id) => stationName(id, mode),
    stationTitle: (id) => stationTitle(id, mode),
    tip: (id) => stationTip(id, mode),
    caption: (id) => stationCaption(id),
    department: (id) => departmentName(id, mode),
    departmentTitle: (id) => departmentTitle(id, mode),
    departmentTip: (id) => departmentTip(id, mode),
    external: (id) => externalLabel(id, mode),
    externalSub: (id) => externalSub(id, mode),
    externalTip: (id) => externalTip(id, mode),
    place: (id) => placeTitle(id, mode),
    placeTip: (id) => placeTip(id, mode),
  };
}

/** What to call things on screen: follows the Fintech Expert / Beginner switch in the header. */
export function useTerms(): Terms {
  const mode = useBankStore((s) => s.termMode);
  return useMemo(() => termsFor(mode), [mode]);
}
