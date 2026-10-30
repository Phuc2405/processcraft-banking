import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useLocale, type Locale } from '../../i18n/locale';
import { useMessages, type Translate } from '../../utils/i18nHelper';
import { notificationStore } from '../../store/notificationStore';
import { creditsMessages } from './credits.messages';
import { FEEDBACK_ENDPOINT, FEEDBACK_FILE_UPLOADS, feedbackForm, isBot, isEmail, KIND_TAG, refusedFiles, sendRoute, submitFeedback, type FeedbackKind, type SubmitResult } from './feedbackService';
import { Modal } from './Modal';
import { SegmentedToggle } from './SegmentedToggle';

export type { FeedbackKind } from './feedbackService';
export const FEEDBACK_EMAIL = 'pnthienphuc2405@gmail.com';
const KINDS: readonly FeedbackKind[] = ['kindIdea', 'kindBug', 'kindContent'];

/** Screenshot evidence: JPG or PNG, at most ATTACH_MAX of them, ATTACH_MAX_MB each. */
export const ATTACH_TYPES: readonly string[] = ['image/png', 'image/jpeg'];
export const ATTACH_MAX = 5;
export const ATTACH_MAX_MB = 5;

type M = Translate<keyof typeof creditsMessages.messages>;

/** "842 KB", "2.4 MB": a file's size for a thumbnail. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Why a file cannot be attached (its type, its size, or one too many), or null when it can. */
export function attachProblem(file: Pick<File, 'name' | 'type' | 'size'>, already: number): { key: 'errType' | 'errSize' | 'errCount'; name: string } | null {
  if (!ATTACH_TYPES.includes(file.type)) return { key: 'errType', name: file.name };
  if (file.size > ATTACH_MAX_MB * 1024 * 1024) return { key: 'errSize', name: file.name };
  if (already >= ATTACH_MAX) return { key: 'errCount', name: file.name };
  return null;
}

/** The mailto link the form opens: the author's address, a fixed subject, and the message with its type, language and the screenshots to attach. */
export function feedbackMailto(text: string, kind: FeedbackKind, locale: Locale, images: readonly Pick<File, 'name' | 'size'>[] = [], imagesLabel = 'Screenshots to attach:'): string {
  const list = images.length ? `\n\n${imagesLabel}\n${images.map((f, i) => `${i + 1}. ${f.name} (${formatBytes(f.size)})`).join('\n')}` : '';
  const body = `[${KIND_TAG[kind]}]\n\n${text.trim()}${list}\n\n—\nProcessCraft Banking · ${locale.toUpperCase()}`;
  return `mailto:${FEEDBACK_EMAIL}?subject=ProcessCraft%20Banking%20Feedback&body=${encodeURIComponent(body)}`;
}

interface Shot {
  id: number;
  file: File;
  /** An object URL for the thumbnail, revoked when the shot is removed or the form closes. */
  url: string;
}

/** A screenshot as PNG (what the clipboard accepts), converting a JPG through a canvas. */
async function asPng(file: File): Promise<Blob> {
  if (file.type === 'image/png') return file;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}

const download = (s: Shot): void => {
  const a = document.createElement('a');
  a.href = s.url;
  a.download = s.file.name;
  a.click();
};

/** One attached screenshot: its thumbnail, name and size, and (after sending) how to get it into the email. */
function ShotCard({ s, m, sent, onRemove }: { s: Shot; m: M; sent: boolean; onRemove: () => void }) {
  const [copy, setCopy] = useState<'idle' | 'ok' | 'fail'>('idle');
  const copyShot = async (): Promise<void> => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await asPng(s.file) })]);
      setCopy('ok');
    } catch {
      setCopy('fail');
    }
  };
  return (
    <li className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950" data-testid="feedback-shot">
      <img src={s.url} alt={s.file.name} className="h-24 w-full object-cover" loading="lazy" decoding="async" />
      <div className="px-2 py-1.5">
        <div className="truncate text-[12.5px] font-semibold text-slate-200" title={s.file.name}>
          {s.file.name}
        </div>
        <div className="font-mono text-[11.5px] text-slate-400" data-testid="feedback-shot-size">
          {formatBytes(s.file.size)}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {sent ? (
            <>
              <button type="button" onClick={() => download(s)} className="rounded-md bg-sky-500 px-2 py-0.5 text-[12px] font-bold text-sky-950 hover:bg-sky-400">
                {m('download')}
              </button>
              <button type="button" onClick={() => void copyShot()} title={copy === 'fail' ? m('copyFailed') : undefined} className="rounded-md px-2 py-0.5 text-[12px] font-semibold text-slate-200 ring-1 ring-slate-600 hover:bg-slate-800">
                {copy === 'ok' ? m('copied') : copy === 'fail' ? m('copyFailed') : m('copy')}
              </button>
            </>
          ) : (
            <button type="button" onClick={onRemove} className="rounded-md px-2 py-0.5 text-[12px] font-semibold text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-500/10">
              × {m('attachRemove')}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

type Failure = Extract<SubmitResult, { ok: false }>;

/** The feedback form: a type, a message, screenshot evidence and an optional reply address. Send posts it straight to the
 *  feedback service (VITE_FEEDBACK_ENDPOINT), screenshots attached; with no service configured, or if it fails, the
 *  user's email app opens instead. */
export function FeedbackModal({
  onClose,
  endpoint = FEEDBACK_ENDPOINT,
  uploads = FEEDBACK_FILE_UPLOADS,
}: {
  onClose: () => void;
  /** The form service; '' opens the email app. */
  endpoint?: string;
  /** Whether the service takes file attachments; without them, screenshots go by email. */
  uploads?: boolean;
}) {
  const m = useMessages(creditsMessages);
  const locale = useLocale();
  const [kind, setKind] = useState<FeedbackKind>('kindIdea');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [refused, setRefused] = useState(false);
  // The honeypot: hidden from people, so anything in it came from a bot.
  const [gotcha, setGotcha] = useState('');
  const [tried, setTried] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [sent, setSent] = useState(false);
  const nextId = useRef(1);
  const picker = useRef<HTMLInputElement>(null);
  const empty = text.trim().length === 0;
  const badReply = replyTo.trim() !== '' && !isEmail(replyTo);

  // Every thumbnail's object URL is let go when the form closes.
  const live = useRef(shots);
  live.current = shots;
  useEffect(() => () => live.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  const add = (files: Iterable<File>): void => {
    const added: Shot[] = [];
    const problems: string[] = [];
    for (const file of files) {
      const p = attachProblem(file, shots.length + added.length);
      if (p) problems.push(m(p.key, { name: p.name, mb: ATTACH_MAX_MB, max: ATTACH_MAX }));
      else added.push({ id: nextId.current++, file, url: URL.createObjectURL(file) });
    }
    setErrors(problems);
    if (added.length) setShots((cur) => [...cur, ...added]);
  };
  const remove = (id: number): void =>
    setShots((cur) => {
      const s = cur.find((x) => x.id === id);
      if (s) URL.revokeObjectURL(s.url);
      return cur.filter((x) => x.id !== id);
    });
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };
  const onPaste = (e: ClipboardEvent): void => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    add(files);
  };

  const mailto = (): string => feedbackMailto(text, kind, locale, shots.map((s) => s.file), m('mailImages'));
  /** The email route: the app opens, and with screenshots, a step to get them into the email. */
  const sendByEmail = (): void => {
    window.location.href = mailto();
    setFailure(null);
    if (shots.length) setSent(true);
    else onClose();
  };
  // Text alone always goes straight to the service; screenshots too when it takes files, else by email.
  const route = sendRoute(endpoint, uploads, shots.length);
  /** Posted to the service (with the screenshots on the direct-with-images route); on success a toast, the form cleared and closed. */
  const send = async (): Promise<void> => {
    setTried(true);
    if (empty || badReply || sending) return;
    if (isBot({ gotcha })) return onClose();
    if (route === 'email') return sendByEmail();
    setSending(true);
    setFailure(null);
    const result = await submitFeedback(endpoint, feedbackForm({ kind, text, locale, replyTo, files: route === 'directWithImages' ? shots.map((s) => s.file) : [] }));
    setSending(false);
    // The service turned the files down after all: the email route, where the user attaches them.
    if (refusedFiles(result)) {
      setRefused(true);
      return sendByEmail();
    }
    if (!result.ok) return setFailure(result);
    const n = shots.length;
    notificationStore.getState().push({
      tone: 'success',
      icon: '✅',
      title: { en: creditsMessages.messages.sentOk.en, vi: creditsMessages.messages.sentOk.vi },
      ...(n ? { body: { en: creditsMessages.messages.sentOkBody.en.replace('{n}', String(n)), vi: creditsMessages.messages.sentOkBody.vi.replace('{n}', String(n)) } } : {}),
      deferred: false,
      source: 'feedback',
    });
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
    setText('');
    setReplyTo('');
    onClose();
  };

  return (
    <Modal
      title={m('feedbackTitle')}
      subtitle={m('feedbackSubtitle')}
      icon="💬"
      onClose={onClose}
      width="max-w-xl"
      testId="feedback-modal"
      z="z-[92]"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {sent ? (
            <>
              <button type="button" onClick={() => shots.forEach(download)} className="rounded-lg px-3 py-1.5 text-[14px] font-semibold text-slate-200 ring-1 ring-slate-600 hover:bg-slate-800">
                {m('downloadAll')}
              </button>
              <button type="button" onClick={onClose} className="rounded-lg bg-sky-500 px-4 py-1.5 text-[14px] font-bold text-sky-950 hover:bg-sky-400">
                {m('done')}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={sending} className="rounded-lg px-3 py-1.5 text-[14px] font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800 disabled:opacity-40">
                {m('feedbackCancel')}
              </button>
              {failure && (
                <button type="button" onClick={sendByEmail} data-testid="feedback-via-email" className="rounded-lg px-3 py-1.5 text-[14px] font-semibold text-slate-200 ring-1 ring-slate-600 hover:bg-slate-800">
                  {m('viaEmail')}
                </button>
              )}
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending}
                aria-busy={sending}
                data-testid="feedback-send"
                data-state={sending ? 'sending' : failure ? 'failed' : 'idle'}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-1.5 text-[14px] font-bold text-sky-950 hover:bg-sky-400 disabled:cursor-wait disabled:opacity-80"
              >
                {sending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-950 border-t-transparent" aria-hidden="true" />}
                {sending ? m('sending') : failure ? m('retry') : route === 'email' && shots.length > 0 ? m('sendWithImagesEmail') : m('feedbackSend')}
              </button>
            </>
          )}
        </div>
      }
    >
      <fieldset className="space-y-3" disabled={sending} onPaste={sent || sending ? undefined : onPaste}>
        {sent ? (
          <div className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-2" role="status" data-testid="feedback-sent">
            <p className="text-[14px] font-bold text-sky-50">{m('sentTitle')}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-sky-100/90">{refused ? m('filesRefused') : m('sentText')}</p>
          </div>
        ) : (
          <>
            <div>
              <div className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-400">{m('feedbackKind')}</div>
              <div className="mt-1">
                <SegmentedToggle<FeedbackKind> label={m('feedbackKind')} value={kind} options={KINDS.map((k) => ({ value: k, label: m(k) }))} onChange={setKind} testId="feedback-kind" stateKey="kind" />
              </div>
            </div>
            <label className="block">
              <span className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-400">{m('feedbackLabel')}</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                autoFocus
                placeholder={m('feedbackPlaceholder')}
                data-testid="feedback-text"
                className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[14px] text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </label>
            {tried && empty && <p className="text-[13px] text-rose-300">{m('feedbackEmpty')}</p>}
            <input type="text" name="_gotcha" value={gotcha} onChange={(e) => setGotcha(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" data-testid="feedback-gotcha" />
            <label className="block">
              <span className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-400">{m('replyLabel')}</span>
              <input
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                data-testid="feedback-reply"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-[14px] text-slate-100 placeholder:text-slate-600 focus:border-sky-400 focus:outline-none"
              />
              {tried && badReply && <span className="mt-0.5 block text-[12.5px] text-rose-300">{m('replyInvalid')}</span>}
            </label>
            <div>
              <div className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-400">{m('attachTitle')}</div>
              <button
                type="button"
                onClick={() => picker.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
                data-testid="feedback-dropzone"
                data-over={over}
                disabled={shots.length >= ATTACH_MAX}
                className={`mt-1 flex w-full flex-col items-center gap-0.5 rounded-lg border-2 border-dashed px-3 py-3 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${over ? 'border-sky-300 bg-sky-500/10' : 'border-slate-600 hover:border-slate-400 hover:bg-slate-800/40'}`}
              >
                <span className="text-[20px]" aria-hidden="true">
                  🖼️
                </span>
                <span className="text-[13.5px] font-semibold text-slate-200">{m('attachDrop')}</span>
                <span className="text-[12px] text-slate-500">{m('attachLimits', { max: ATTACH_MAX, mb: ATTACH_MAX_MB })}</span>
              </button>
              <input
                ref={picker}
                type="file"
                accept={ATTACH_TYPES.join(',')}
                multiple
                hidden
                data-testid="feedback-file"
                onChange={(e) => {
                  if (e.target.files) add(e.target.files);
                  e.target.value = '';
                }}
              />
              {errors.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[12.5px] text-rose-300" data-testid="feedback-errors">
                  {errors.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        {failure && (
          <div className="rounded-lg border border-rose-400/50 bg-rose-950/40 px-3 py-2 text-[13px] text-rose-100" role="alert" data-testid="feedback-failure" data-reason={failure.reason}>
            <p className="font-bold">{m('failTitle')}</p>
            <p className="mt-0.5">{m(`fail_${failure.reason}`, { detail: failure.detail ?? '—' })}</p>
          </div>
        )}
        {!sent && route === 'email' && endpoint && shots.length > 0 && (
          <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[12.5px] leading-snug text-amber-100" data-testid="feedback-images-by-email">
            {m('imagesByEmail')}
          </p>
        )}
        {!sent && route !== 'email' && <p className="text-[12px] text-slate-500" data-testid="feedback-direct">{m('directNote')}</p>}
        {shots.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="feedback-shots">
            {shots.map((s) => (
              <ShotCard key={s.id} s={s} m={m} sent={sent} onRemove={() => remove(s.id)} />
            ))}
          </ul>
        )}
      </fieldset>
    </Modal>
  );
}

/** The header's "💬 Feedback" button, and its form. */
export function FeedbackButton() {
  const m = useMessages(creditsMessages);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={m('feedbackHint')} data-testid="feedback-open" className="whitespace-nowrap rounded-lg border border-slate-600 px-2.5 py-1 text-[13px] font-semibold text-slate-100 transition hover:bg-slate-800">
        {m('feedbackButton')}
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}
