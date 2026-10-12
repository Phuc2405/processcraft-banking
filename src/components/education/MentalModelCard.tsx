import { modelCopy, type MentalModel } from '../../data/mentalModels';

/**
 * One everyday picture for one hard idea: "A wallet with a temporary-lock pocket". Shown in Beginner mode, in the inspector
 * beside the desk it explains and in the Learning Hub beside the process.
 */
export function MentalModelCard({ model, compact = false }: { model: MentalModel; compact?: boolean }) {
  const copy = modelCopy(model.id);
  return (
    <section className="rounded-xl border bg-slate-900/60 p-3" style={{ borderColor: `${model.accent}66` }} data-testid={`mental-model-${model.id}`} aria-label={copy.title}>
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[19px]" style={{ background: `${model.accent}22` }} aria-hidden="true">
          {model.glyph}
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: model.accent }}>
            Think of it like
          </div>
          <h4 className="text-[13.5px] font-bold leading-snug text-slate-50">{copy.title}</h4>
          <div className="text-[11px] text-slate-500">{copy.topic}</div>
        </div>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-slate-200">{copy.hook}</p>
      {!compact && (
        <>
          <dl className="mt-2.5 space-y-1.5">
            {copy.parts.map((p) => (
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
          <p className="mt-2 border-l-2 pl-2.5 text-[12px] leading-snug text-slate-300" style={{ borderColor: model.accent }}>
            <span className="font-semibold text-slate-100">Where it goes wrong: </span>
            {copy.watchOut}
          </p>
        </>
      )}
    </section>
  );
}
