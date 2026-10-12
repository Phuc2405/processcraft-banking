/**
 * Condition expressions for XOR gateway edges.
 *
 * Grammar (see ProcessEdge in the metamodel):
 *   expr    := or
 *   or      := and ('||' and)*
 *   and     := cmp ('&&' cmp)*
 *   cmp     := unary (('==' | '!=' | '<' | '<=' | '>' | '>=') unary)?
 *   unary   := '!' unary | primary
 *   primary := number | 'string' | "string" | true | false | identifier | '(' expr ')'
 *
 * Two entry points:
 *   checkExpression()    static: syntax, known variables, hidden variables, types, enum values.
 *                        Used by the grader before simulation and by the future editor for live feedback.
 *   evaluateExpression() dynamic: evaluates a parsed expression against a token's facts.
 *
 * A fact that no node has produced yet is "unset". Unset facts never equal anything, fail every
 * ordering comparison, and count as false in boolean logic. They are reported back so the grader
 * can tell the learner that a decision is reading a fact that does not exist yet on that path.
 */

import type { ConditionVariable } from '../types/processLearning';

export type Scalar = string | number | boolean;
export type BinaryOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||';

export type Ast =
  | { kind: 'literal'; value: Scalar }
  | { kind: 'identifier'; name: string }
  | { kind: 'not'; operand: Ast }
  | { kind: 'binary'; op: BinaryOp; left: Ast; right: Ast };

export class ExpressionError extends Error {
  readonly position: number | null;
  constructor(message: string, position: number | null = null) {
    super(message);
    this.name = 'ExpressionError';
    this.position = position;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokenizer
// ─────────────────────────────────────────────────────────────────────────────

interface Token {
  kind: 'number' | 'string' | 'identifier' | 'operator' | 'end';
  text: string;
  value?: Scalar;
  pos: number;
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
const isIdentStart = (c: string): boolean => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
const isIdentPart = (c: string | undefined): boolean => c !== undefined && (isIdentStart(c) || isDigit(c));
const TWO_CHAR_OPS = ['==', '!=', '<=', '>=', '&&', '||'];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (isDigit(c)) {
      let j = i;
      while (isDigit(src[j])) j++;
      if (src[j] === '.' && isDigit(src[j + 1])) {
        j++;
        while (isDigit(src[j])) j++;
      }
      const text = src.slice(i, j);
      tokens.push({ kind: 'number', text, value: Number(text), pos: i });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end === -1) throw new ExpressionError(`The text starting at position ${i} is missing its closing ${c}`, i);
      tokens.push({ kind: 'string', text: src.slice(i, end + 1), value: src.slice(i + 1, end), pos: i });
      i = end + 1;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (isIdentPart(src[j])) j++;
      tokens.push({ kind: 'identifier', text: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      tokens.push({ kind: 'operator', text: two, pos: i });
      i += 2;
      continue;
    }
    if (c === '<' || c === '>' || c === '!' || c === '(' || c === ')') {
      tokens.push({ kind: 'operator', text: c, pos: i });
      i++;
      continue;
    }
    if (c === '=') throw new ExpressionError("Use '==' (two equals signs) to compare values, not '='", i);
    if (c === '&' || c === '|') throw new ExpressionError("Use '&&' for AND and '||' for OR", i);
    throw new ExpressionError(`Unexpected character '${c}'`, i);
  }
  tokens.push({ kind: 'end', text: '', pos: src.length });
  return tokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

const WORD_OPERATORS: Record<string, string> = { and: '&&', or: '||', not: '!' };

export function parseExpression(src: string): Ast {
  if (src.trim() === '') throw new ExpressionError('The condition is empty');
  const toks = tokenize(src);
  let p = 0;

  const peek = (): Token => toks[p]!;
  const advance = (): Token => toks[p++]!;
  const isOp = (t: Token, ...ops: string[]): boolean => t.kind === 'operator' && ops.includes(t.text);

  const parsePrimary = (): Ast => {
    const t = peek();
    if (t.kind === 'end') throw new ExpressionError('The condition ends too early', t.pos);
    if (isOp(t, '(')) {
      advance();
      const inner = parseOr();
      const close = peek();
      if (!isOp(close, ')')) throw new ExpressionError("Missing a closing ')'", close.pos);
      advance();
      return inner;
    }
    if (t.kind === 'number' || t.kind === 'string') {
      advance();
      return { kind: 'literal', value: t.value as Scalar };
    }
    if (t.kind === 'identifier') {
      const word = WORD_OPERATORS[t.text.toLowerCase()];
      if (word) throw new ExpressionError(`Use '${word}' instead of the word '${t.text}'`, t.pos);
      advance();
      if (t.text === 'true') return { kind: 'literal', value: true };
      if (t.text === 'false') return { kind: 'literal', value: false };
      return { kind: 'identifier', name: t.text };
    }
    throw new ExpressionError(`Unexpected '${t.text}'`, t.pos);
  };

  const parseUnary = (): Ast => {
    if (isOp(peek(), '!')) {
      advance();
      return { kind: 'not', operand: parseUnary() };
    }
    return parsePrimary();
  };

  const parseCmp = (): Ast => {
    const left = parseUnary();
    const t = peek();
    if (isOp(t, '==', '!=', '<', '<=', '>', '>=')) {
      advance();
      return { kind: 'binary', op: t.text as BinaryOp, left, right: parseUnary() };
    }
    return left;
  };

  const parseAnd = (): Ast => {
    let left = parseCmp();
    while (isOp(peek(), '&&')) {
      advance();
      left = { kind: 'binary', op: '&&', left, right: parseCmp() };
    }
    return left;
  };

  function parseOr(): Ast {
    let left = parseAnd();
    while (isOp(peek(), '||')) {
      advance();
      left = { kind: 'binary', op: '||', left, right: parseAnd() };
    }
    return left;
  }

  const ast = parseOr();
  const rest = peek();
  if (rest.kind !== 'end') {
    const word = rest.kind === 'identifier' ? WORD_OPERATORS[rest.text.toLowerCase()] : undefined;
    throw new ExpressionError(
      word ? `Use '${word}' instead of the word '${rest.text}'` : `Unexpected '${rest.text}'`,
      rest.pos,
    );
  }
  return ast;
}

export function collectIdentifiers(ast: Ast, into: string[] = []): string[] {
  switch (ast.kind) {
    case 'identifier':
      if (!into.includes(ast.name)) into.push(ast.name);
      break;
    case 'not':
      collectIdentifiers(ast.operand, into);
      break;
    case 'binary':
      collectIdentifiers(ast.left, into);
      collectIdentifiers(ast.right, into);
      break;
    case 'literal':
      break;
  }
  return into;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static check
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpressionCheck {
  errors: string[];
  identifiers: string[];
}

type StaticType = 'number' | 'string' | 'boolean' | 'unknown';

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j]!;
      prev[j] = Math.min(above + 1, prev[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length]!;
}

function closestName(name: string, candidates: string[]): string | null {
  const lower = name.toLowerCase();
  const exact = candidates.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = editDistance(lower, c.toLowerCase());
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best !== null && bestDistance <= Math.max(2, Math.floor(name.length / 4)) ? best : null;
}

export function checkExpression(src: string, variables: readonly ConditionVariable[]): ExpressionCheck {
  let ast: Ast;
  try {
    ast = parseExpression(src);
  } catch (e) {
    if (e instanceof ExpressionError) return { errors: [e.message], identifiers: [] };
    throw e;
  }

  const byName = new Map(variables.map((v) => [v.name, v]));
  const visibleNames = variables.filter((v) => v.learnerVisible).map((v) => v.name);
  const errors = new Set<string>();

  const needs = (actual: StaticType, expected: StaticType, op: string): void => {
    if (actual !== 'unknown' && actual !== expected) {
      errors.add(`'${op}' needs ${expected} values, but one side is a ${actual}`);
    }
  };

  const infer = (node: Ast): StaticType => {
    switch (node.kind) {
      case 'literal':
        return typeof node.value as StaticType;
      case 'identifier': {
        const v = byName.get(node.name);
        if (!v) {
          const guess = closestName(node.name, visibleNames);
          errors.add(`Unknown variable '${node.name}'.${guess ? ` Did you mean '${guess}'?` : ''}`);
          return 'unknown';
        }
        if (!v.learnerVisible) {
          errors.add(`'${node.name}' cannot be used in conditions. ${v.description}`);
          return 'unknown';
        }
        return v.type;
      }
      case 'not':
        needs(infer(node.operand), 'boolean', '!');
        return 'boolean';
      case 'binary': {
        const l = infer(node.left);
        const r = infer(node.right);
        if (node.op === '&&' || node.op === '||') {
          needs(l, 'boolean', node.op);
          needs(r, 'boolean', node.op);
        } else if (node.op === '==' || node.op === '!=') {
          if (l !== 'unknown' && r !== 'unknown' && l !== r) {
            errors.add(`Cannot compare a ${l} with a ${r} using '${node.op}'`);
          } else {
            checkEnumLiteral(node.left, node.right);
            checkEnumLiteral(node.right, node.left);
          }
        } else {
          needs(l, 'number', node.op);
          needs(r, 'number', node.op);
        }
        return 'boolean';
      }
    }
  };

  const checkEnumLiteral = (idSide: Ast, litSide: Ast): void => {
    if (idSide.kind !== 'identifier' || litSide.kind !== 'literal' || typeof litSide.value !== 'string') return;
    const allowed = byName.get(idSide.name)?.allowedValues;
    if (!allowed || allowed.includes(litSide.value)) return;
    const guess = allowed.find((a) => a.toLowerCase() === String(litSide.value).toLowerCase());
    errors.add(
      `'${idSide.name}' can only be ${allowed.join(', ')}, so '${litSide.value}' will never match.${guess ? ` Did you mean '${guess}'?` : ''}`,
    );
  };

  const resultType = infer(ast);
  if (resultType !== 'boolean' && resultType !== 'unknown') {
    errors.add(`A condition must be true or false, but this evaluates to a ${resultType}. Compare it to something, for example riskScore < 40`);
  }
  return { errors: [...errors], identifiers: collectIdentifiers(ast) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluation
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpressionResult {
  value: boolean;
  /** Variables the expression read that no node has set yet. */
  unset: string[];
}

type Value = Scalar | undefined;

function asBoolean(v: Value, op: string): boolean {
  if (v === undefined) return false;
  if (typeof v === 'boolean') return v;
  throw new ExpressionError(`'${op}' only works on true/false values, not on a ${typeof v}`);
}

function evalNode(node: Ast, scope: Readonly<Record<string, Value>>, unset: Set<string>): Value {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'identifier': {
      const v = scope[node.name];
      if (v === undefined) unset.add(node.name);
      return v;
    }
    case 'not':
      return !asBoolean(evalNode(node.operand, scope, unset), '!');
    case 'binary': {
      if (node.op === '&&') {
        return asBoolean(evalNode(node.left, scope, unset), '&&') && asBoolean(evalNode(node.right, scope, unset), '&&');
      }
      if (node.op === '||') {
        return asBoolean(evalNode(node.left, scope, unset), '||') || asBoolean(evalNode(node.right, scope, unset), '||');
      }
      const l = evalNode(node.left, scope, unset);
      const r = evalNode(node.right, scope, unset);
      if (node.op === '==' || node.op === '!=') {
        if (l === undefined || r === undefined) return node.op === '!=';
        if (typeof l !== typeof r) throw new ExpressionError(`Cannot compare a ${typeof l} with a ${typeof r}`);
        return node.op === '==' ? l === r : l !== r;
      }
      if (l === undefined || r === undefined) return false;
      if (typeof l !== 'number' || typeof r !== 'number') {
        throw new ExpressionError(`'${node.op}' needs numbers, not ${typeof l} and ${typeof r}`);
      }
      switch (node.op) {
        case '<': return l < r;
        case '<=': return l <= r;
        case '>': return l > r;
        default: return l >= r;
      }
    }
  }
}

export function evaluateExpression(ast: Ast, scope: Readonly<Record<string, Value>>): ExpressionResult {
  const unset = new Set<string>();
  const v = evalNode(ast, scope, unset);
  if (v !== undefined && typeof v !== 'boolean') {
    throw new ExpressionError('The condition must evaluate to true or false');
  }
  return { value: v === true, unset: [...unset] };
}
