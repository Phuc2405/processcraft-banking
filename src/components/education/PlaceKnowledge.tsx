import { DEEP_DIVE_ASPECTS, deepDive, deepDiveText, placePicture, type KnowledgePlace } from '../../data/stationKnowledge';
import { useLocale } from '../../i18n/locale';
import { STATIONS } from '../../sim/topology';
import { useMessages } from '../../utils/i18nHelper';
import { AcronymNotes } from '../bank/AcronymNotes';
import { SectionTitle } from '../bank/ui';
import { PictureCard } from './MentalModelCard';
import { placeKnowledgeMessages } from './placeKnowledge.messages';

const ASPECT_ICON = { message: '📨', ledger: '🔒', compliance: '⚖️' } as const;

/** The Expert view's third tier: how the place works under the hood (message fields, ledger and locking, the rule behind it). */
export function DeepDive({ place }: { place: KnowledgePlace }) {
  const m = useMessages(placeKnowledgeMessages);
  const locale = useLocale();
  return (
    <section data-testid="deep-dive" data-section="deep-dive">
      <SectionTitle>{m('deepDive')}</SectionTitle>
      <dl className="space-y-1.5">
        {DEEP_DIVE_ASPECTS.map((a) => (
          <div key={a} className="rounded-lg border border-violet-400/25 bg-violet-500/[0.06] px-2.5 py-1.5 text-[12px] leading-snug" data-aspect={a}>
            <dt className="font-semibold text-violet-200">
              <span aria-hidden="true">{ASPECT_ICON[a]}</span> {m(`aspect_${a}`)}
            </dt>
            <dd className="mt-0.5 text-slate-300">{deepDive(place, a, locale)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * What the Inspector teaches about a place, in both vocabularies: 1. Think of it like, 2. the acronyms explained. The Expert view adds
 * 3. the technical deep-dive, and never drops the first two. `text` is what the panel already shows (name, caption, tip); the acronym
 * notes also read the place's professional description and, in the Expert view, the deep-dive, so its codes are expanded too.
 */
export function PlaceKnowledge({ place, text, expert }: { place: KnowledgePlace; text: string; expert: boolean }) {
  const locale = useLocale();
  const picture = placePicture(place, locale);
  const pro = place === 'BAY' ? '' : `${STATIONS[place].name} ${STATIONS[place].blurb}`;
  const notes = `${text} ${pro} ${expert ? deepDiveText(place, locale) : ''}`;
  return (
    <div className="space-y-5" data-testid="place-knowledge" data-expert={expert}>
      {picture && <PictureCard picture={picture} testId={`think-${place}`} />}
      <AcronymNotes text={notes} />
      {expert && <DeepDive place={place} />}
    </div>
  );
}
