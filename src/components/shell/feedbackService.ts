/**
 * Sends the feedback form straight from the page to a form-forwarding service (Formspree, or any endpoint that takes a
 * multipart POST and answers JSON), which emails it to the author: the type, the message, an optional reply address, and
 * the screenshots as real file attachments. The endpoint is public by design (it only accepts submissions), so it is a
 * VITE_ variable: VITE_FEEDBACK_ENDPOINT overrides the author's form below (set it to an empty string to use email only).
 *
 * File uploads are a paid feature of most form services, so screenshots go one of two ways (sendRoute): straight to the
 * service when it takes files (VITE_FEEDBACK_FILE_UPLOADS=true), or else by email, where the user attaches them.
 */

import type { Locale } from '../../i18n/locale';

export type FeedbackKind = 'kindIdea' | 'kindBug' | 'kindContent';
export const KIND_TAG: Readonly<Record<FeedbackKind, string>> = { kindIdea: 'Suggestion', kindBug: 'Bug', kindContent: 'Content' };

/** The author's Formspree form (public: it only accepts submissions). */
export const DEFAULT_FEEDBACK_ENDPOINT = 'https://formspree.io/f/xoeenavz';
/** The endpoint in use, or '' for email only. */
export const FEEDBACK_ENDPOINT: string = (import.meta.env.VITE_FEEDBACK_ENDPOINT ?? DEFAULT_FEEDBACK_ENDPOINT).trim();
/** Whether the service accepts file attachments (a paid Formspree plan). Off by default: the free plan takes text only. */
export const FEEDBACK_FILE_UPLOADS: boolean = import.meta.env.VITE_FEEDBACK_FILE_UPLOADS === 'true';

/** How a submission travels: straight to the service (text only, or with the screenshots when it takes files), or by email. */
export type SendRoute = 'direct' | 'directWithImages' | 'email';
export const sendRoute = (endpoint: string, uploads: boolean, images: number): SendRoute => (!endpoint ? 'email' : images === 0 ? 'direct' : uploads ? 'directWithImages' : 'email');

/** How long a submission may take before it is abandoned (large screenshots on a slow line). */
export const SUBMIT_TIMEOUT_MS = 45_000;

export interface FeedbackPayload {
  kind: FeedbackKind;
  text: string;
  locale: Locale;
  /** Where the author can answer (optional). */
  replyTo?: string;
  files: readonly File[];
  /** The honeypot: a field people never see, so only a bot fills it in. */
  gotcha?: string;
}

/** A bot filled in the honeypot: the submission is dropped quietly (Formspree would discard it anyway). */
export const isBot = (p: Pick<FeedbackPayload, 'gotcha'>): boolean => (p.gotcha ?? '').trim() !== '';

/** A plausible email address (the service checks it again). */
export const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** The multipart form the service receives: a subject line, the fields, and each screenshot as an `attachment` file. */
export function feedbackForm(p: FeedbackPayload): FormData {
  const form = new FormData();
  form.append('_subject', `ProcessCraft Banking Feedback · ${KIND_TAG[p.kind]}`);
  form.append('type', KIND_TAG[p.kind]);
  form.append('message', p.text.trim());
  form.append('language', p.locale.toUpperCase());
  // Formspree's honeypot field, sent empty: a real person never fills it, and its presence is what the spam filter expects.
  form.append('_gotcha', '');
  if (p.replyTo && isEmail(p.replyTo)) {
    // Formspree answers to `email` (the reply-to of the message it forwards).
    form.append('email', p.replyTo.trim());
  }
  p.files.forEach((f) => form.append('attachment', f, f.name));
  return form;
}

export type SubmitResult = { ok: true } | { ok: false; reason: 'network' | 'timeout' | 'rejected'; detail?: string };

/** The service turned the screenshots down (a plan without file uploads): the images must go by email instead. */
export const refusedFiles = (r: SubmitResult): boolean => !r.ok && r.reason === 'rejected' && /file|upload|attach/i.test(r.detail ?? '');

/** Posts the form and reads the service's JSON answer. Never throws: a failure says why, so the form can offer a retry or email. */
export async function submitFeedback(endpoint: string, form: FormData, fetchImpl: typeof fetch = fetch, timeoutMs = SUBMIT_TIMEOUT_MS): Promise<SubmitResult> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    // The site's origin goes with it (never a blank referrer, which Formspree's spam filter treats as suspicious).
    const res = await fetchImpl(endpoint, { method: 'POST', body: form, headers: { Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin', mode: 'cors', signal: abort.signal });
    if (res.ok) return { ok: true };
    // Formspree explains a refusal as { errors: [{ message }] } (a plan without file uploads, a form not yet confirmed...).
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; errors?: { message?: string }[] };
      detail = body.errors?.map((e) => e.message).filter(Boolean).join('; ') || body.error;
    } catch {
      detail = `HTTP ${res.status}`;
    }
    return { ok: false, reason: 'rejected', ...(detail ? { detail } : {}) };
  } catch (e) {
    return { ok: false, reason: abort.signal.aborted ? 'timeout' : 'network', detail: e instanceof Error ? e.message : undefined };
  } finally {
    clearTimeout(timer);
  }
}
