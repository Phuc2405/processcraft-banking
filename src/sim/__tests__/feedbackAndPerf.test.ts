import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ATTACH_MAX, ATTACH_MAX_MB, attachProblem, feedbackMailto, FeedbackModal, formatBytes } from '../../components/shell/FeedbackModal';
import { creditsMessages } from '../../components/shell/credits.messages';
import { sceneCovered } from '../../components/bank/office/sceneCover';
import { DEFAULT_FEEDBACK_ENDPOINT, FEEDBACK_ENDPOINT, FEEDBACK_FILE_UPLOADS, feedbackForm, isBot, isEmail, refusedFiles, sendRoute, submitFeedback } from '../../components/shell/feedbackService';
import { bundleProblems } from '../../utils/i18nHelper';

const file = (name: string, type: string, size: number) => ({ name, type, size });

describe('screenshot evidence on the feedback form', () => {
  it('accepts JPG and PNG up to the size and count limits, and says why it refuses the rest', () => {
    expect(attachProblem(file('a.png', 'image/png', 1000), 0)).toBeNull();
    expect(attachProblem(file('b.jpg', 'image/jpeg', ATTACH_MAX_MB * 1024 * 1024), 0)).toBeNull();
    expect(attachProblem(file('c.gif', 'image/gif', 10), 0)).toEqual({ key: 'errType', name: 'c.gif' });
    expect(attachProblem(file('d.pdf', 'application/pdf', 10), 0)?.key).toBe('errType');
    expect(attachProblem(file('e.png', 'image/png', ATTACH_MAX_MB * 1024 * 1024 + 1), 0)?.key).toBe('errSize');
    expect(attachProblem(file('f.png', 'image/png', 10), ATTACH_MAX)?.key).toBe('errCount');
  });

  it('shows each file’s size readably', () => {
    expect([formatBytes(512), formatBytes(2048), formatBytes(842 * 1024), formatBytes(2.4 * 1024 * 1024)]).toEqual(['512 B', '2 KB', '842 KB', '2.4 MB']);
  });

  it('lists the screenshots to attach in the email body (a mailto link cannot carry files)', () => {
    const url = feedbackMailto('Lỗi hiển thị', 'kindBug', 'vi', [file('man-hinh.png', 'image/png', 300 * 1024)], creditsMessages.messages.mailImages.vi);
    const body = decodeURIComponent(url.split('&body=')[1]!);
    expect(body).toContain('Ảnh minh chứng cần đính kèm:');
    expect(body).toContain('1. man-hinh.png (300 KB)');
    expect(decodeURIComponent(feedbackMailto('x', 'kindIdea', 'en').split('&body=')[1]!)).not.toContain('Screenshots');
  });

  it('draws the dropzone with its limits, JPG/PNG only', () => {
    const html = renderToStaticMarkup(createElement(FeedbackModal, { onClose: () => undefined }));
    expect(html).toContain('data-testid="feedback-dropzone"');
    expect(html).toContain('accept="image/png,image/jpeg"');
    expect(html).toContain(`Up to ${ATTACH_MAX} images, ${ATTACH_MAX_MB} MB each`);
    expect(bundleProblems(creditsMessages)).toEqual([]);
  });
});

describe('the 3D office rests behind a full-screen window', () => {
  const open = { overlay: 'none' as const, welcomeOpen: false, staffDesk: null, reportOpen: false };
  it('stops drawing under the Knowledge Base, the AML desk, the workspace, the report or the welcome; draws otherwise', () => {
    expect(sceneCovered(open)).toBe(false);
    for (const overlay of ['knowledge', 'aml', 'benchmark', 'chaos'] as const) expect(sceneCovered({ ...open, overlay }), overlay).toBe(true);
    expect(sceneCovered({ ...open, staffDesk: 'GATE_SWIFT' })).toBe(true);
    expect(sceneCovered({ ...open, reportOpen: true })).toBe(true);
    expect(sceneCovered({ ...open, welcomeOpen: true })).toBe(true);
    // The audit report is a print view of its own, not a veil over the map.
    expect(sceneCovered({ ...open, overlay: 'audit' })).toBe(false);
  });
});

describe('the feedback form sent straight from the page', () => {
  const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'loi.png', { type: 'image/png' });
  const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

  it('builds a multipart form: subject, type, message, language, reply-to and each screenshot as a file', () => {
    const form = feedbackForm({ kind: 'kindBug', text: '  Màn hình trống  ', locale: 'vi', replyTo: 'ban@example.com', files: [png(), png()] });
    expect(form.get('_subject')).toBe('ProcessCraft Banking Feedback · Bug');
    expect(form.get('type')).toBe('Bug');
    expect(form.get('message')).toBe('Màn hình trống');
    expect(form.get('language')).toBe('VI');
    expect(form.get('email')).toBe('ban@example.com');
    const files = form.getAll('attachment');
    expect(files).toHaveLength(2);
    expect((files[0] as File).name).toBe('loi.png');
    // No reply address, or a malformed one: no email field.
    expect(feedbackForm({ kind: 'kindIdea', text: 'x', locale: 'en', replyTo: 'not-an-email', files: [] }).get('email')).toBeNull();
    expect([isEmail('a@b.co'), isEmail('a@b'), isEmail('')]).toEqual([true, false, false]);
    expect([isBot({ gotcha: '' }), isBot({}), isBot({ gotcha: 'http://spam' })]).toEqual([false, false, true]);
  });

  it('posts it as JSON-accepting multipart, and reports success, a refusal with its reason, a network failure or a timeout', async () => {
    let seen: RequestInit | undefined;
    const ok = (async (_u: string, init: RequestInit) => {
      seen = init;
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const form = feedbackForm({ kind: 'kindIdea', text: 'hi', locale: 'en', files: [png()] });
    expect(await submitFeedback('https://formspree.io/f/test', form, ok)).toEqual({ ok: true });
    expect(seen?.method).toBe('POST');
    expect(seen?.body).toBe(form);
    expect((seen?.headers as Record<string, string>).Accept).toBe('application/json');
    // The origin always goes with it, and the empty honeypot; no page URL (a localhost address looks like spam).
    expect(seen?.referrerPolicy).toBe('strict-origin-when-cross-origin');
    expect(form.get('_gotcha')).toBe('');
    expect(form.get('page')).toBeNull();
    expect(await submitFeedback('x', form, answer(422, { errors: [{ message: 'File uploads not permitted' }] }))).toEqual({ ok: false, reason: 'rejected', detail: 'File uploads not permitted' });
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await submitFeedback('x', form, down)).toMatchObject({ ok: false, reason: 'network' });
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    expect(await submitFeedback('x', form, hang, 20)).toMatchObject({ ok: false, reason: 'timeout' });
  });

  it('says it sends directly when a service is configured, and keeps the email route without one', () => {
    const direct = renderToStaticMarkup(createElement(FeedbackModal, { onClose: () => undefined, endpoint: 'https://formspree.io/f/test' }));
    expect(direct).toContain('data-testid="feedback-direct"');
    expect(direct).toContain('data-testid="feedback-reply"');
    expect(direct).toContain('data-state="idle"');
    expect(renderToStaticMarkup(createElement(FeedbackModal, { onClose: () => undefined, endpoint: '' }))).not.toContain('feedback-direct');
    expect(creditsMessages.messages.sending.vi).toBe('Đang gửi...');
    expect(creditsMessages.messages.sentOk.vi).toBe('Gửi góp ý thành công! Cảm ơn bạn đã hỗ trợ tác giả');
  });
});

describe('the free plan: text straight to the form, screenshots by email', () => {
  it('uses the author’s form, text-only by default', () => {
    expect(DEFAULT_FEEDBACK_ENDPOINT).toBe('https://formspree.io/f/xoeenavz');
    expect(FEEDBACK_ENDPOINT).toBe(DEFAULT_FEEDBACK_ENDPOINT);
    expect(FEEDBACK_FILE_UPLOADS).toBe(false);
  });

  it('picks the route: text alone direct; with screenshots direct only when the form takes files, else by email', () => {
    const ep = DEFAULT_FEEDBACK_ENDPOINT;
    expect(sendRoute(ep, false, 0)).toBe('direct');
    expect(sendRoute(ep, false, 2)).toBe('email');
    expect(sendRoute(ep, true, 2)).toBe('directWithImages');
    expect(sendRoute('', true, 0)).toBe('email');
  });

  it('falls back to email when the service turns the files down, but not for other refusals', () => {
    expect(refusedFiles({ ok: false, reason: 'rejected', detail: 'File uploads not permitted on this plan' })).toBe(true);
    expect(refusedFiles({ ok: false, reason: 'rejected', detail: 'Form not confirmed' })).toBe(false);
    expect(refusedFiles({ ok: false, reason: 'network' })).toBe(false);
    expect(refusedFiles({ ok: true })).toBe(false);
  });

  it('tells the user up front when their screenshots will go by email', () => {
    const html = renderToStaticMarkup(createElement(FeedbackModal, { onClose: () => undefined }));
    // Nothing attached yet: the direct route.
    expect(html).toContain('data-testid="feedback-direct"');
    expect(creditsMessages.messages.imagesByEmail.vi).toBe('Vì gửi email với ảnh, bạn cần copy hoặc download ảnh để gửi kèm. Khi bấm nút gửi, hãy sử dụng nút copy/download bên dưới ảnh.');
    expect(creditsMessages.messages.imagesByEmail.en).toBe('As screenshots go by email, you need to copy or download them to attach. When you click send, please use the copy/download buttons below each image.');
    expect(html).not.toContain('feedback-share');
    expect('share' in creditsMessages.messages).toBe(false);
    expect(html).toContain('data-testid="feedback-gotcha"');
    expect(creditsMessages.messages.sendWithImagesEmail.vi).toBe('📧 Gửi qua email (kèm ảnh)');
    expect(bundleProblems(creditsMessages)).toEqual([]);
  });
});
