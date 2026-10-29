import { WIRES, type PlaceId } from '../../sim/topology';

/** A desk's routing rules, read from its own wires: the conditions that send a case on (pass) and the ones that send it to Declined. */
export function routingRules(place: PlaceId): { pass: string[]; decline: string[] } {
  const out = WIRES.filter(([from, , label]) => from === place && label);
  return {
    pass: out.filter(([, to]) => to !== 'OUT_DECLINED').map(([, , label]) => label!),
    decline: out.filter(([, to]) => to === 'OUT_DECLINED').map(([, , label]) => label!),
  };
}
