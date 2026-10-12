/**
 * The little things that sit on a desk and say what the desk is for: a card terminal at the POS gate, gold bars in the
 * vault, a ledger book at the Core Ledger. Each is a handful of coloured boxes, in its own corner of a 0.4-unit square
 * with its feet on y = 0. `solid` is lit; `glow` is unlit and bright (screens, coins' shine, LEDs).
 */

import type { StationId } from '../../../sim/topology';
import { ball, box, cyl, ring, shade, tint, type Part } from './kit';
import { SET } from './palette';

export interface PropParts {
  solid: Part[];
  glow: Part[];
}

const GOLD = '#e0b13c';
const PAPER = SET.paper;

const coins = (x: number, z: number, n: number, color = GOLD): Part[] => Array.from({ length: n }, (_, i) => cyl([x, 0.02 + i * 0.04, z], 0.065, 0.065, 0.035, i % 2 ? shade(color, 0.12) : color, 10));

function terminal(): PropParts {
  const keys: Part[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) keys.push(box([-0.05 + c * 0.05, 0.145, 0.05 - r * 0.045 + 0.02], [0.038, 0.012, 0.034], '#e5e7eb'));
  return {
    solid: [box([0, 0.06, 0], [0.26, 0.12, 0.22], '#374151'), box([0, 0.2, -0.07], [0.24, 0.15, 0.025], '#111827', [-0.35, 0, 0]), ...keys, box([0.2, 0.05, 0.03], [0.1, 0.1, 0.12], '#e5e7eb'), box([0.2, 0.12, 0.03], [0.08, 0.05, 0.1], PAPER)],
    glow: [box([0, 0.2, -0.053], [0.2, 0.11, 0.006], '#7dd3fc', [-0.35, 0, 0])],
  };
}

function virtualCard(): PropParts {
  return {
    solid: [cyl([0, 0.025, 0], 0.11, 0.13, 0.05, SET.steelDark, 10), box([0, 0.2, 0], [0.03, 0.34, 0.03], SET.steel)],
    glow: [box([0, 0.42, 0.02], [0.4, 0.25, 0.02], '#a78bfa', [0, -0.4, 0]), box([0, 0.46, 0.035], [0.34, 0.06, 0.005], '#ddd6fe', [0, -0.4, 0]), box([-0.1, 0.4, 0.045], [0.07, 0.055, 0.005], GOLD, [0, -0.4, 0])],
  };
}

function ecommerce(): PropParts {
  return {
    solid: [
      box([0, 0.012, 0.02], [0.36, 0.024, 0.26], '#cbd5e1'),
      box([0, 0.14, -0.1], [0.36, 0.24, 0.022], '#e2e8f0', [-0.22, 0, 0]),
      box([0.33, 0.09, 0.0], [0.2, 0.18, 0.18], '#c8a06a'),
      box([0.33, 0.185, 0.0], [0.2, 0.012, 0.04], '#a67c4d'),
      box([0.36, 0.3, 0.02], [0.14, 0.12, 0.12], '#d3ac77'),
      ball([-0.28, 0.14, 0.05], 0.09, '#38bdf8'),
      ring([-0.28, 0.14, 0.05], 0.12, 0.012, '#0369a1', [Math.PI / 2.4, 0.3, 0]),
    ],
    glow: [box([0, 0.14, -0.088], [0.3, 0.19, 0.004], '#bae6fd', [-0.22, 0, 0])],
  };
}

function vault(): PropParts {
  return {
    solid: [box([0, 0.03, 0], [0.24, 0.06, 0.12], GOLD), box([0.02, 0.09, 0.0], [0.24, 0.06, 0.12], tint(GOLD, 0.2)), box([-0.01, 0.15, 0.0], [0.2, 0.06, 0.1], GOLD), box([0.3, 0.07, 0], [0.13, 0.12, 0.06], SET.steelDark), ring([0.3, 0.15, 0], 0.045, 0.014, SET.steel, [0, 0, 0], 10)],
    glow: [],
  };
}

function dcvv(): PropParts {
  const keys: Part[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) keys.push(box([-0.055 + c * 0.055, 0.1 + r * 0.01, 0.07 - r * 0.045], [0.04, 0.012, 0.034], '#e5e7eb', [-0.0, 0, 0]));
  return {
    solid: [box([0, 0.05, 0.0], [0.22, 0.1, 0.3], '#1f2937'), ...keys],
    glow: [box([0, 0.103, -0.15 + 0.03], [0.16, 0.012, 0.05], '#a7f3d0')],
  };
}

function shield(): PropParts {
  return {
    solid: [cyl([0, 0.025, 0], 0.12, 0.14, 0.05, SET.steelDark, 10), box([0, 0.2, 0], [0.24, 0.2, 0.04], '#8b5cf6', [0, -0.35, 0]), box([0, 0.08, 0], [0.14, 0.1, 0.04], '#7c3aed', [0, -0.35, 0])],
    glow: [box([0, 0.2, 0.025], [0.1, 0.04, 0.006], '#ede9fe', [0, -0.35, 0.0]), box([0.0, 0.2, 0.025], [0.04, 0.12, 0.006], '#ede9fe', [0, -0.35, 0])],
  };
}

function ledgerBook(color: string): PropParts {
  const lines: Part[] = [];
  for (let i = 0; i < 5; i++) lines.push(box([0, 0.062, -0.07 + i * 0.035], [0.26, 0.004, 0.006], '#94a3b8'));
  return {
    solid: [box([0, 0.025, 0], [0.34, 0.05, 0.25], color), box([0, 0.056, 0], [0.3, 0.014, 0.21], PAPER), ...lines, box([0.28, 0.03, 0.02], [0.12, 0.06, 0.18], '#374151'), ...coins(-0.3, 0.05, 3)],
    glow: [box([0.28, 0.062, -0.03], [0.09, 0.012, 0.04], '#86efac')],
  };
}

function cards(): PropParts {
  return {
    solid: [
      box([-0.02, 0.012, 0.0], [0.26, 0.012, 0.17], '#7c3aed', [0, 0.35, 0]),
      box([0.0, 0.026, 0.0], [0.26, 0.012, 0.17], '#38bdf8', [0, 0.0, 0]),
      box([0.02, 0.04, 0.0], [0.26, 0.012, 0.17], GOLD, [0, -0.35, 0]),
      box([0.0, 0.054, 0.0], [0.26, 0.012, 0.17], '#f472b6', [0, -0.7, 0]),
      ...coins(0.3, 0.02, 4, '#f59e0b'),
    ],
    glow: [],
  };
}

function payInFour(): PropParts {
  return {
    solid: [0, 1, 2, 3].flatMap((i) => Array.from({ length: i + 1 }, (_, k) => cyl([-0.18 + i * 0.12, 0.02 + k * 0.04, 0], 0.052, 0.052, 0.035, k % 2 ? '#db2777' : '#f472b6', 10))),
    glow: [box([0.3, 0.13, 0], [0.1, 0.2, 0.01], '#fbcfe8')],
  };
}

function batch(): PropParts {
  return {
    solid: [box([-0.1, 0.07, 0], [0.26, 0.14, 0.2], '#d6c3a0'), box([-0.1, 0.17, 0], [0.26, 0.06, 0.2], '#e6d7b8'), box([-0.1, 0.12, 0.101], [0.16, 0.05, 0.004], '#fbbf24'), box([0.18, 0.05, 0.03], [0.22, 0.1, 0.16], '#c9b48c'), box([0.18, 0.11, 0.03], [0.22, 0.025, 0.16], '#fcd34d')],
    glow: [],
  };
}

function network(): PropParts {
  return {
    solid: [cyl([0, 0.025, 0], 0.1, 0.12, 0.05, SET.steelDark, 10), ball([0, 0.2, 0], 0.13, '#38bdf8'), ring([0, 0.2, 0], 0.18, 0.015, '#0ea5e9', [Math.PI / 2.3, 0, 0.3]), ring([0, 0.2, 0], 0.18, 0.015, '#0284c7', [0.4, 0, Math.PI / 2.5])],
    glow: [],
  };
}

function recon(): PropParts {
  return {
    solid: [-1, 0, 1].flatMap((i) => [box([i * 0.13, 0.008, 0], [0.11, 0.012, 0.16], PAPER, [0, i * 0.12, 0])]).concat([ring([0.32, 0.1, 0.0], 0.07, 0.015, SET.steelDark, [Math.PI / 2.4, 0, 0], 12), box([0.38, 0.05, 0.04], [0.02, 0.1, 0.02], SET.steelDark, [0, 0, -0.5])]),
    glow: [-1, 0, 1].map((i) => box([i * 0.13, 0.018, 0], [0.07, 0.006, 0.02], '#22c55e', [0, i * 0.12, 0])),
  };
}

function strongbox(): PropParts {
  return {
    solid: [box([0, 0.09, 0], [0.34, 0.18, 0.24], '#475569'), box([0, 0.19, 0], [0.36, 0.03, 0.26], '#334155'), box([0, 0.13, 0.125], [0.08, 0.1, 0.02], GOLD), ring([0, 0.19, 0.13], 0.04, 0.01, GOLD, [0, 0, 0], 8)],
    glow: [box([0.12, 0.1, 0.125], [0.05, 0.05, 0.006], '#fbbf24')],
  };
}

/** An instant-transfer gate: a phone showing a QR code, on a little stand, and a teal bolt over it. */
function transfer(): PropParts {
  const qr: Part[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((r * 3 + c * 5 + r * c) % 3 !== 0) qr.push(box([-0.045 + c * 0.03, 0.2 - r * 0.03, 0.026], [0.022, 0.022, 0.004], '#0f172a', [-0.18, 0, 0]));
  return {
    solid: [cyl([0, 0.025, 0], 0.1, 0.12, 0.05, SET.steelDark, 10), box([0, 0.14, -0.01], [0.2, 0.25, 0.03], '#1e293b', [-0.18, 0, 0]), ...qr],
    glow: [box([0, 0.14, 0.012], [0.17, 0.21, 0.004], '#ccfbf1', [-0.18, 0, 0]), box([0.2, 0.2, 0], [0.05, 0.16, 0.02], '#14b8a6', [0, 0, 0.5]), box([0.2, 0.12, 0], [0.05, 0.12, 0.02], '#14b8a6', [0, 0, -0.5])],
  };
}

export function stationProp(id: StationId): PropParts {
  switch (id) {
    case 'GATE_VIRTUAL':
      return virtualCard();
    case 'GATE_POS':
      return terminal();
    case 'GATE_ECOM':
      return ecommerce();
    case 'SEC_VAULT':
      return vault();
    case 'SEC_DCVV':
      return dcvv();
    case 'SEC_3DS':
      return shield();
    case 'LEDGER_DEBIT':
      return ledgerBook('#9a3412');
    case 'LEDGER_CREDIT':
      return cards();
    case 'BNPL':
      return payInFour();
    case 'EOD_BATCH':
      return batch();
    case 'EOD_VISA':
      return network();
    case 'RECON':
      return recon();
    case 'SUSPENSE':
      return strongbox();
    case 'GATE_A2A':
      return transfer();
    // The ATMs are machines on the pavement with their own body (see Dressing.tsx); they have no desk to put a prop on.
    case 'GATE_ATM':
    case 'ATM_CASH':
      return { solid: [], glow: [] };
  }
}
