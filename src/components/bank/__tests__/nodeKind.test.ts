import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTOMATED_NODES, HUMAN_NODES, isAutomatedNode, machineWorkerName, NODE_FAMILY, type NodeFamily } from '../../../sim/nodeKind';
import { STATION_IDS, type StationId } from '../../../sim/topology';
import { hasVietnamese, setActiveLocale } from '../../../utils/i18nHelper';
import { tipMessages } from '../inspectorTips.messages';
import { useNodeCopy } from '../useNodeCopy';

afterEach(() => setActiveLocale('en'));

describe('24-node classification', () => {
  it('splits every station into 16 automated and 8 human, with no overlap', () => {
    expect(AUTOMATED_NODES).toHaveLength(16);
    expect(HUMAN_NODES).toHaveLength(8);
    expect(new Set([...AUTOMATED_NODES, ...HUMAN_NODES])).toEqual(new Set(STATION_IDS));
  });

  it('runs gateways, security, the core ledger and the ATM on servers, and the back office by hand', () => {
    for (const id of ['GATE_VIRTUAL', 'GATE_POS', 'GATE_A2A', 'GATE_ECOM', 'SEC_VAULT', 'SEC_DCVV', 'SEC_3DS', 'LEDGER_DEBIT', 'LEDGER_CREDIT', 'GATE_ATM', 'ATM_CASH'] as StationId[]) expect(isAutomatedNode(id), id).toBe(true);
    for (const id of ['BNPL', 'EOD_BATCH', 'EOD_VISA', 'SUSPENSE', 'RECON'] as StationId[]) expect(isAutomatedNode(id), id).toBe(false);
  });

  it('runs eKYC, VietQR, FacePay, the FDS and SWIFT on servers, and the teller, AML and disputes desks by hand', () => {
    for (const id of ['GATE_EKYC', 'GATE_QR', 'SEC_FACEPAY', 'SEC_FDS', 'GATE_SWIFT'] as StationId[]) expect(isAutomatedNode(id), id).toBe(true);
    for (const id of ['TELLER_CASH', 'AML_DESK', 'DISPUTE_DESK'] as StationId[]) expect(isAutomatedNode(id), id).toBe(false);
  });

  it('names the identity, biometric and fraud engines as AI engines', () => {
    expect(machineWorkerName('GATE_EKYC', 0)).toEqual({ kind: 'engine', engine: 'ekyc', n: '01' });
    expect(machineWorkerName('SEC_FACEPAY', 1)).toEqual({ kind: 'engine', engine: 'facepay', n: '02' });
    expect(machineWorkerName('SEC_FDS', 0)).toEqual({ kind: 'engine', engine: 'fds', n: '01' });
    expect(machineWorkerName('GATE_SWIFT', 0)).toEqual({ kind: 'cluster', letter: 'Alpha' });
  });

  it('names gateway workers as clusters and other machines as threads', () => {
    expect(machineWorkerName('GATE_POS', 0)).toEqual({ kind: 'cluster', letter: 'Alpha' });
    expect(machineWorkerName('GATE_POS', 9)).toEqual({ kind: 'cluster', letter: 'Bravo 2' });
    expect(machineWorkerName('SEC_3DS', 0)).toEqual({ kind: 'thread', n: '01' });
  });

  it('has a desk-specific queue and error example for every family', () => {
    const keys = Object.keys(tipMessages.messages);
    for (const f of new Set<NodeFamily>(Object.values(NODE_FAMILY))) {
      expect(keys, f).toContain(`queue_${f}`);
      expect(keys, f).toContain(`errors_${f}`);
    }
  });
});

function Probe({ id, beginner }: { id: StationId; beginner: boolean }) {
  const c = useNodeCopy(id);
  const q = c.hybrid('queue');
  return createElement('pre', null, [c.workerName({ name: 'Samir Larsen' }, 0), c.scaleLabel(beginner, 12_000), q.text, q.example?.title, q.example?.text, c.automated ? c.n('teamMachine') : c.n('teamHuman')].join('\n'));
}
const render = (id: StationId, beginner = true) => renderToStaticMarkup(createElement(Probe, { id, beginner }));

describe('inspector copy per node', () => {
  it('automated gateway, beginner and advanced', () => {
    const out = render('GATE_POS');
    expect(out).toContain('Gateway Cluster Alpha');
    expect(out).toContain('Spin up Parallel Processing Thread · $120/day');
    expect(out).toContain('System threads &amp; workers');
    expect(out).toContain('API requests');
    expect(render('GATE_POS', false)).toContain('Enable Load Balancing &amp; Auto-scale Instance · $120/day');
    expect(hasVietnamese(out)).toBe(false);
  });

  it('human desk keeps the person and calls temporary staff', () => {
    const out = render('BNPL', false);
    expect(out).toContain('Samir Larsen');
    expect(out).toContain('Call Temporary Support Staff · $120/day');
    expect(out).toContain('Assigned personnel');
    expect(out).toContain('Pay-in-4 applications');
  });

  it('reads in Vietnamese', () => {
    setActiveLocale('vi');
    expect(render('SEC_3DS')).toContain('Luồng máy chủ #01');
    expect(render('SEC_3DS')).toContain('Mở thêm luồng xử lý song song');
    expect(render('SEC_3DS', false)).toContain('Kích hoạt Cân bằng tải (Load Balancer) &amp; Auto-scale Node');
    expect(render('GATE_A2A')).toContain('Cụm Gateway Alpha');
    expect(render('RECON')).toContain('Nhân sự vận hành');
    expect(render('RECON')).toContain('Gọi nhân viên hỗ trợ tạm thời');
  });
});
