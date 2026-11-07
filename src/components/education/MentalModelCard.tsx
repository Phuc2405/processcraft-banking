import { t } from '../../i18n/t';
import { modelCopy, type MentalModel } from '../../data/mentalModels';
import type { PlacePicture } from '../../data/stationKnowledge';
import { useMessages } from '../../utils/i18nHelper';
import { placeKnowledgeMessages } from './placeKnowledge.messages';

/** One everyday picture for one idea ("A wallet with a temporary-lock pocket"): the same card for a mental model and a desk's own picture. */
export function PictureCard({ picture, compact = false, testId }: { picture: PlacePicture; compact?: boolean; testId?: string }) {
  const m = useMessages(placeKnowledgeMessages);
  return (
    <section className="rounded-xl border bg-slate-900/60 p-3" style={{ borderColor: `${picture.accent}66` }} data-testid={testId} data-section="think-of-it-like" aria-label={picture.title}>
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[19px]" style={{ background: `${picture.accent}22` }} aria-hidden="true">
          {picture.glyph}
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: picture.accent }}>
            {m('thinkOfItLike')}
          </div>
          <h4 className="text-[13.5px] font-bold leading-snug text-slate-50">{picture.title}</h4>
          {picture.topic && <div className="text-[11px] text-slate-500">{picture.topic}</div>}
        </div>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-slate-200">{picture.hook}</p>
      {!compact && picture.parts && (
        <dl className="mt-2.5 space-y-1.5">
          {picture.parts.map((p) => (
            <div key={p.real} className="rounded-lg bg-slate-950/60 px-2.5 py-1.5">
              <dt className="flex flex-wrap items-center gap-x-1.5 text-[11.5px]">
                <span className="font-semibold text-slate-100">{p.picture}</span>
                <span className="text-slate-500">=</span>
                <span className="text-slate-400">{p.real}</span>
              </dt>
              <dd className="mt-0.5 text-[12px] leading-snug text-slate-300">{p.explain}</dd>
            </div>
          ))}
        </dl>
      )}
      {!compact && picture.watchOut && (
        <p className="mt-2 border-l-2 pl-2.5 text-[12px] leading-snug text-slate-300" style={{ borderColor: picture.accent }}>
          <span className="font-semibold text-slate-100">{t('Where it goes wrong: ')}</span>
          {picture.watchOut}
        </p>
      )}
    </section>
  );
}

/** A mental model as a picture card (the Learning Hub lists them by process). */
export function MentalModelCard({ model, compact = false }: { model: MentalModel; compact?: boolean }) {
  const c = modelCopy(model.id);
  return <PictureCard picture={{ glyph: model.glyph, accent: model.accent, title: c.title, hook: c.hook, topic: c.topic, parts: c.parts, watchOut: c.watchOut }} compact={compact} testId={`mental-model-${model.id}`} />;
}
