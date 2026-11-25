'use strict';

export const REPORTER_DEFS = [
  // Math Category (คณิตศาสตร์)
  {
    op: 'MATH_ADD',
    cat: 'math',
    title: '+',
    sig: 'a + b',
    desc: 'บวกค่า (+)',
    slots: [
      { key: 'a', label: '', default: 10 },
      { key: 'b', label: '+', default: 10 }
    ],
    precedence: 4
  },
  {
    op: 'MATH_SUB',
    cat: 'math',
    title: '-',
    sig: 'a - b',
    desc: 'ลบค่า (-)',
    slots: [
      { key: 'a', label: '', default: 50 },
      { key: 'b', label: '-', default: 10 }
    ],
    precedence: 4
  },
  {
    op: 'MATH_MUL',
    cat: 'math',
    title: '*',
    sig: 'a * b',
    desc: 'คูณค่า (*)',
    slots: [
      { key: 'a', label: '', default: 30 },
      { key: 'b', label: '*', default: 2 }
    ],
    precedence: 5
  },
  {
    op: 'MATH_DIV',
    cat: 'math',
    title: '/',
    sig: 'a / b',
    desc: 'หารค่า (/)',
    slots: [
      { key: 'a', label: '', default: 60 },
      { key: 'b', label: '/', default: 2 }
    ],
    precedence: 5
  },
  {
    op: 'MATH_MOD',
    cat: 'math',
    title: '%',
    sig: 'a % b',
    desc: 'หารเอาเศษ (%)',
    slots: [
      { key: 'a', label: '', default: 10 },
      { key: 'b', label: '%', default: 3 }
    ],
    precedence: 5
  },
  {
    op: 'MATH_NEG',
    cat: 'math',
    title: '-x',
    sig: '-a',
    desc: 'กลับเครื่องหมายเป็นลบ (-x)',
    slots: [{ key: 'a', label: '-', default: 90 }],
    precedence: 6
  },
  {
    op: 'MATH_ABS',
    cat: 'math',
    title: 'abs',
    sig: 'abs(x)',
    desc: 'ค่าสัมบูรณ์ (ไม่ติดลบ)',
    slots: [{ key: 'x', label: 'abs(', default: -90, suffix: ')' }],
    precedence: 7
  },
  {
    op: 'MATH_MIN',
    cat: 'math',
    title: 'min',
    sig: 'min(a, b)',
    desc: 'เลือกค่าน้อยกว่าระหว่าง 2 ค่า',
    slots: [
      { key: 'a', label: 'min(', default: 60 },
      { key: 'b', label: ',', default: 80, suffix: ')' }
    ],
    precedence: 7
  },
  {
    op: 'MATH_MAX',
    cat: 'math',
    title: 'max',
    sig: 'max(a, b)',
    desc: 'เลือกค่ามากกว่าระหว่าง 2 ค่า',
    slots: [
      { key: 'a', label: 'max(', default: 40 },
      { key: 'b', label: ',', default: 70, suffix: ')' }
    ],
    precedence: 7
  },
  {
    op: 'MATH_CONSTRAIN',
    cat: 'math',
    title: 'constrain',
    sig: 'constrain(x, min, max)',
    desc: 'จำกัดค่าให้อยู่ในช่วง min - max',
    slots: [
      { key: 'x', label: 'constrain(', default: 60 },
      { key: 'low', label: ',', default: 20 },
      { key: 'high', label: ',', default: 100, suffix: ')' }
    ],
    precedence: 7
  },
  {
    op: 'MATH_RANDOM',
    cat: 'math',
    title: 'random',
    sig: 'random(min, max)',
    desc: 'สุ่มค่าจำนวนเต็มในช่วง',
    slots: [
      { key: 'min', label: 'random(', default: 40 },
      { key: 'max', label: ',', default: 80, suffix: ')' }
    ],
    precedence: 7
  },
  {
    op: 'MATH_BOX',
    cat: 'math',
    title: 'BOX',
    sig: 'BOX(n)',
    desc: 'แปลงจำนวนช่อง (1-8) เป็นระยะสนามจริง (cm)',
    slots: [{ key: 'n', label: 'BOX(', default: 1, suffix: ')' }],
    precedence: 7
  },

  // Logic Category (ตรรกศาสตร์)
  {
    op: 'LOGIC_EQ',
    cat: 'logic',
    title: '==',
    sig: 'a == b',
    desc: 'เปรียบเทียบเท่ากับ (==)',
    slots: [
      { key: 'a', label: '', default: 1 },
      { key: 'b', label: '==', default: 1 }
    ],
    precedence: 2
  },
  {
    op: 'LOGIC_NEQ',
    cat: 'logic',
    title: '!=',
    sig: 'a != b',
    desc: 'เปรียบเทียบไม่เท่ากับ (!=)',
    slots: [
      { key: 'a', label: '', default: 1 },
      { key: 'b', label: '!=', default: 0 }
    ],
    precedence: 2
  },
  {
    op: 'LOGIC_LT',
    cat: 'logic',
    title: '<',
    sig: 'a < b',
    desc: 'น้อยกว่า (<)',
    slots: [
      { key: 'a', label: '', default: 50 },
      { key: 'b', label: '<', default: 80 }
    ],
    precedence: 3
  },
  {
    op: 'LOGIC_LTE',
    cat: 'logic',
    title: '<=',
    sig: 'a <= b',
    desc: 'น้อยกว่าหรือเท่ากับ (<=)',
    slots: [
      { key: 'a', label: '', default: 50 },
      { key: 'b', label: '<=', default: 80 }
    ],
    precedence: 3
  },
  {
    op: 'LOGIC_GT',
    cat: 'logic',
    title: '>',
    sig: 'a > b',
    desc: 'มากกว่า (>)',
    slots: [
      { key: 'a', label: '', default: 80 },
      { key: 'b', label: '>', default: 50 }
    ],
    precedence: 3
  },
  {
    op: 'LOGIC_GTE',
    cat: 'logic',
    title: '>=',
    sig: 'a >= b',
    desc: 'มากกว่าหรือเท่ากับ (>=)',
    slots: [
      { key: 'a', label: '', default: 80 },
      { key: 'b', label: '>=', default: 50 }
    ],
    precedence: 3
  },
  {
    op: 'LOGIC_AND',
    cat: 'logic',
    title: '&&',
    sig: 'a && b',
    desc: 'จริงทั้งสองเงื่อนไข (AND)',
    slots: [
      { key: 'a', label: '', default: true },
      { key: 'b', label: '&&', default: true }
    ],
    precedence: 1
  },
  {
    op: 'LOGIC_OR',
    cat: 'logic',
    title: '||',
    sig: 'a || b',
    desc: 'จริงอย่างน้อยหนึ่งเงื่อนไข (OR)',
    slots: [
      { key: 'a', label: '', default: true },
      { key: 'b', label: '||', default: false }
    ],
    precedence: 0
  },
  {
    op: 'LOGIC_NOT',
    cat: 'logic',
    title: '!',
    sig: '!a',
    desc: 'กลับค่าตรรกะ จริง<->เท็จ (NOT)',
    slots: [{ key: 'a', label: '!', default: false }],
    precedence: 6
  },
  {
    op: 'LOGIC_TERNARY',
    cat: 'logic',
    title: '?:',
    sig: 'cond ? a : b',
    desc: 'เลือกค่าตามเงื่อนไข (ถ้าจริงใช้ a ไม่งั้นใช้ b)',
    slots: [
      { key: 'cond', label: '', default: true },
      { key: 'a', label: '?', default: 80 },
      { key: 'b', label: ':', default: 50 }
    ],
    precedence: 0
  },
  {
    op: 'LOGIC_BOOL',
    cat: 'logic',
    title: 'bool',
    sig: 'true / false',
    desc: 'ค่าความจริง true หรือ false',
    slots: [{ key: 'val', label: '', type: 'bool_lit', default: true }],
    precedence: 8
  }
];

export const REPORTER_MAP = Object.fromEntries(REPORTER_DEFS.map((r) => [r.op, r]));

export function isPlainNumber(val) {
  if (typeof val === 'number') return Number.isFinite(val);
  if (val && typeof val === 'object') return false;
  const s = String(val ?? '').trim();
  return /^[-+]?(?:\d+\.?\d*|\.\d+)f?$/i.test(s);
}

export function isReporterNode(val) {
  return Boolean(val && typeof val === 'object' && (val.kind === 'var' || val.kind === 'expr'));
}

export function createDefaultReporterNode(op, varName = '') {
  if (op === 'VAR') {
    return { kind: 'var', name: varName || 'spdNorm' };
  }
  const def = REPORTER_MAP[op];
  if (!def) return 0;
  const args = {};
  for (const s of def.slots) {
    args[s.key] = s.default;
  }
  return { kind: 'expr', op, args };
}

export function intLit(n) {
  if (isReporterNode(n)) return exprToCode(n, 'raw');
  const num = parseFloat(String(n).replace(/f$/i, ''));
  return Number.isFinite(num) ? String(Math.round(num)) : String(n ?? '0').trim() || '0';
}

export function floatLit(n) {
  if (isReporterNode(n)) return exprToCode(n, 'raw');
  const sRaw = String(n ?? '').trim();
  if (!isPlainNumber(sRaw)) return sRaw || '0.0f';
  const num = parseFloat(sRaw.replace(/f$/i, ''));
  if (!Number.isFinite(num)) return '0.0f';
  const s = String(num);
  return `${s.includes('.') ? s : `${s}.0`}f`;
}

export function charLit(v) {
  if (isReporterNode(v)) return exprToCode(v, 'raw');
  const s = String(v ?? 'R').trim();
  if (/^[A-Za-z]$/.test(s)) return `'${s}'`;
  if (/^'[A-Za-z]'$/.test(s)) return s;
  return s || "'R'";
}

export function boolLit(v) {
  if (isReporterNode(v)) return exprToCode(v, 'raw');
  if (v === true || v === 'true') return 'true';
  if (v === false || v === 'false') return 'false';
  return String(v ?? 'true').trim() || 'true';
}

function wrapIfLowerPrec(node, parentPrec, rightChild = false) {
  const code = exprToCode(node, 'raw');
  if (!node || typeof node !== 'object' || node.kind !== 'expr') return code;
  const def = REPORTER_MAP[node.op];
  if (!def) return code;
  const needs = rightChild ? def.precedence <= parentPrec : def.precedence < parentPrec;
  return needs ? `(${code})` : code;
}

export function exprToCode(val, expectedType = 'raw') {
  if (val === null || val === undefined) return '0';
  if (typeof val === 'object') {
    if (val.kind === 'var') return String(val.name || 'spdNorm').trim();
    if (val.kind === 'expr') {
      const a = val.args || {};
      const prec = REPORTER_MAP[val.op]?.precedence ?? 4;
      switch (val.op) {
        case 'MATH_ADD': return `${wrapIfLowerPrec(a.a, prec, false)} + ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'MATH_SUB': return `${wrapIfLowerPrec(a.a, prec, false)} - ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'MATH_MUL': return `${wrapIfLowerPrec(a.a, prec, false)} * ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'MATH_DIV': return `${wrapIfLowerPrec(a.a, prec, false)} / ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'MATH_MOD': return `${wrapIfLowerPrec(a.a, prec, false)} % ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'MATH_NEG': return `-${wrapIfLowerPrec(a.a, prec, true)}`;
        case 'MATH_ABS': return `abs(${exprToCode(a.x, 'raw')})`;
        case 'MATH_MIN': return `min(${exprToCode(a.a, 'raw')}, ${exprToCode(a.b, 'raw')})`;
        case 'MATH_MAX': return `max(${exprToCode(a.a, 'raw')}, ${exprToCode(a.b, 'raw')})`;
        case 'MATH_CONSTRAIN': return `constrain(${exprToCode(a.x, 'raw')}, ${exprToCode(a.low, 'raw')}, ${exprToCode(a.high, 'raw')})`;
        case 'MATH_RANDOM': return `random(${exprToCode(a.min, 'raw')}, ${exprToCode(a.max, 'raw')})`;
        case 'MATH_BOX': return `BOX(${exprToCode(a.n, 'raw')})`;
        case 'LOGIC_EQ': return `${wrapIfLowerPrec(a.a, prec, false)} == ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'LOGIC_NEQ': return `${wrapIfLowerPrec(a.a, prec, false)} != ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'LOGIC_LT': return `${wrapIfLowerPrec(a.a, prec, false)} < ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'LOGIC_LTE': return `${wrapIfLowerPrec(a.a, prec, false)} <= ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'LOGIC_GT': return `${wrapIfLowerPrec(a.a, prec, false)} > ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'LOGIC_GTE': return `${wrapIfLowerPrec(a.a, prec, false)} >= ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'LOGIC_AND': return `${wrapIfLowerPrec(a.a, prec, false)} && ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'LOGIC_OR': return `${wrapIfLowerPrec(a.a, prec, false)} || ${wrapIfLowerPrec(a.b, prec, true)}`;
        case 'LOGIC_NOT': return `!${wrapIfLowerPrec(a.a, prec, true)}`;
        case 'LOGIC_TERNARY': return `(${exprToCode(a.cond, 'raw')} ? ${exprToCode(a.a, 'raw')} : ${exprToCode(a.b, 'raw')})`;
        case 'LOGIC_BOOL': return boolLit(a.val);
        default: return '0';
      }
    }
  }

  if (expectedType === 'float') return floatLit(val);
  if (expectedType === 'int') return intLit(val);
  if (expectedType === 'char') return charLit(val);
  if (expectedType === 'bool') return boolLit(val);

  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
  const s = String(val).trim();
  if (!s) return '0';
  return s.replace(/(\d+(?:\.\d+)?)f\b/g, '$1');
}

// ============================================================================
// Safe Recursive C++ Argument -> Block AST Parser
// ============================================================================
function stripOuterParens(s) {
  let text = s.trim();
  while (text.startsWith('(') && text.endsWith(')')) {
    let depth = 0;
    let inQuote = null;
    let matchedEnd = true;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuote) {
        if (ch === inQuote && text[i - 1] !== '\\') inQuote = null;
        continue;
      }
      if (ch === '\'' || ch === '"') { inQuote = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0 && i < text.length - 1) {
          matchedEnd = false;
          break;
        }
      }
    }
    if (!matchedEnd || depth !== 0) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

export function splitTopLevelArgs(argStr) {
  const out = [];
  let cur = '';
  let depth = 0;
  let inQuote = null;
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    if (inQuote) {
      cur += ch;
      if (ch === inQuote && argStr[i - 1] !== '\\') inQuote = null;
      continue;
    }
    if (ch === '\'' || ch === '"') {
      inQuote = ch;
      cur += ch;
    } else if (ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ')') {
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function findTopLevelBinaryOp(text, ops) {
  let depth = 0;
  let inQuote = null;
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (inQuote) {
      if (ch === inQuote && text[i - 1] !== '\\') inQuote = null;
      continue;
    }
    if (ch === '\'' || ch === '"') { inQuote = ch; continue; }
    if (ch === ')') { depth++; continue; }
    if (ch === '(') { depth--; continue; }
    if (depth !== 0) continue;

    for (const op of ops) {
      const start = i - op.sym.length + 1;
      if (start <= 0) continue;
      if (text.slice(start, i + 1) === op.sym) {
        // Ignore unary + or - at start or after another operator
        if (op.sym === '+' || op.sym === '-') {
          const leftTrim = text.slice(0, start).trimEnd();
          if (!leftTrim || /[+\-*/%(<>=!&|,?:]$/.test(leftTrim)) continue;
        }
        return { op: op.type, left: text.slice(0, start).trim(), right: text.slice(i + 1).trim() };
      }
    }
  }
  return null;
}

function findTopLevelTernary(text) {
  let depth = 0;
  let inQuote = null;
  let qPos = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === inQuote && text[i - 1] !== '\\') inQuote = null;
      continue;
    }
    if (ch === '\'' || ch === '"') { inQuote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && ch === '?' && qPos === -1) qPos = i;
    else if (depth === 0 && ch === ':' && qPos !== -1) {
      return {
        cond: text.slice(0, qPos).trim(),
        a: text.slice(qPos + 1, i).trim(),
        b: text.slice(i + 1).trim()
      };
    }
  }
  return null;
}

export function parseCodeArgToAst(rawStr, varNames = []) {
  const text = stripOuterParens(String(rawStr ?? '').trim());
  if (!text) return 0;
  if (text === 'true') return true;
  if (text === 'false') return false;

  const charM = text.match(/^'([A-Za-z])'$/);
  if (charM) return charM[1];

  if (isPlainNumber(text)) {
    const n = parseFloat(text.replace(/f$/i, ''));
    return Number.isFinite(n) ? n : 0;
  }

  if (/^[A-Za-z_]\w*$/.test(text)) {
    return { kind: 'var', name: text };
  }

  // Ternary ?:
  const tern = findTopLevelTernary(text);
  if (tern && tern.cond && tern.a && tern.b) {
    return {
      kind: 'expr',
      op: 'LOGIC_TERNARY',
      args: {
        cond: parseCodeArgToAst(tern.cond, varNames),
        a: parseCodeArgToAst(tern.a, varNames),
        b: parseCodeArgToAst(tern.b, varNames)
      }
    };
  }

  // Binary precedence groups (lowest to highest)
  const precLevels = [
    [{ sym: '||', type: 'LOGIC_OR' }],
    [{ sym: '&&', type: 'LOGIC_AND' }],
    [{ sym: '==', type: 'LOGIC_EQ' }, { sym: '!=', type: 'LOGIC_NEQ' }],
    [{ sym: '<=', type: 'LOGIC_LTE' }, { sym: '>=', type: 'LOGIC_GTE' }, { sym: '<', type: 'LOGIC_LT' }, { sym: '>', type: 'LOGIC_GT' }],
    [{ sym: '+', type: 'MATH_ADD' }, { sym: '-', type: 'MATH_SUB' }],
    [{ sym: '*', type: 'MATH_MUL' }, { sym: '/', type: 'MATH_DIV' }, { sym: '%', type: 'MATH_MOD' }]
  ];

  for (const ops of precLevels) {
    const split = findTopLevelBinaryOp(text, ops);
    if (split && split.left && split.right) {
      return {
        kind: 'expr',
        op: split.op,
        args: {
          a: parseCodeArgToAst(split.left, varNames),
          b: parseCodeArgToAst(split.right, varNames)
        }
      };
    }
  }

  if (text.startsWith('!') && text.length > 1) {
    return { kind: 'expr', op: 'LOGIC_NOT', args: { a: parseCodeArgToAst(text.slice(1), varNames) } };
  }
  if (text.startsWith('-') && text.length > 1) {
    return { kind: 'expr', op: 'MATH_NEG', args: { a: parseCodeArgToAst(text.slice(1), varNames) } };
  }

  const fnMatch = text.match(/^(abs|min|max|constrain|random|BOX)\s*\(([\s\S]*)\)$/);
  if (fnMatch) {
    const fn = fnMatch[1];
    const args = splitTopLevelArgs(fnMatch[2]);
    if (fn === 'abs' && args.length === 1) {
      return { kind: 'expr', op: 'MATH_ABS', args: { x: parseCodeArgToAst(args[0], varNames) } };
    }
    if (fn === 'min' && args.length === 2) {
      return { kind: 'expr', op: 'MATH_MIN', args: { a: parseCodeArgToAst(args[0], varNames), b: parseCodeArgToAst(args[1], varNames) } };
    }
    if (fn === 'max' && args.length === 2) {
      return { kind: 'expr', op: 'MATH_MAX', args: { a: parseCodeArgToAst(args[0], varNames), b: parseCodeArgToAst(args[1], varNames) } };
    }
    if (fn === 'constrain' && args.length === 3) {
      return { kind: 'expr', op: 'MATH_CONSTRAIN', args: { x: parseCodeArgToAst(args[0], varNames), low: parseCodeArgToAst(args[1], varNames), high: parseCodeArgToAst(args[2], varNames) } };
    }
    if (fn === 'random' && args.length === 2) {
      return { kind: 'expr', op: 'MATH_RANDOM', args: { min: parseCodeArgToAst(args[0], varNames), max: parseCodeArgToAst(args[1], varNames) } };
    }
    if (fn === 'BOX' && args.length === 1) {
      return { kind: 'expr', op: 'MATH_BOX', args: { n: parseCodeArgToAst(args[0], varNames) } };
    }
  }

  return text;
}

// ============================================================================
// Safe Recursive Runtime Evaluator (Simulator Engine)
// ============================================================================
export function evalExpression(node, variables = [], fallback = 0, ctx = null) {
  if (node === null || node === undefined) return fallback;
  if (typeof node === 'number') return Number.isFinite(node) ? node : fallback;
  if (typeof node === 'boolean') return node ? 1 : 0;

  if (typeof node === 'object') {
    if (node.kind === 'var') {
      const found = variables.find((v) => v.name === node.name);
      if (!found) return fallback;
      if (found.type === 'bool') return found.value === true || found.value === 'true' ? 1 : 0;
      const n = parseFloat(String(found.value).replace(/f$/i, ''));
      return Number.isFinite(n) ? n : fallback;
    }
    if (node.kind === 'expr') {
      const a = node.args || {};
      const valA = evalExpression(a.a, variables, 0, ctx);
      const valB = evalExpression(a.b, variables, 0, ctx);
      switch (node.op) {
        case 'MATH_ADD': return valA + valB;
        case 'MATH_SUB': return valA - valB;
        case 'MATH_MUL': return valA * valB;
        case 'MATH_DIV': return valB === 0 ? 0 : valA / valB;
        case 'MATH_MOD': return valB === 0 ? 0 : valA % valB;
        case 'MATH_NEG': return -valA;
        case 'MATH_ABS': return Math.abs(evalExpression(a.x, variables, 0, ctx));
        case 'MATH_MIN': return Math.min(valA, valB);
        case 'MATH_MAX': return Math.max(valA, valB);
        case 'MATH_CONSTRAIN': {
          const x = evalExpression(a.x, variables, 0, ctx);
          const low = evalExpression(a.low, variables, 0, ctx);
          const high = evalExpression(a.high, variables, 100, ctx);
          return Math.max(low, Math.min(high, x));
        }
        case 'MATH_RANDOM': {
          const lo = evalExpression(a.min, variables, 0, ctx);
          const hi = evalExpression(a.max, variables, 100, ctx);
          return (lo + hi) * 0.5; // deterministic midpoint for path simulation
        }
        case 'MATH_BOX': {
          const nBoxes = evalExpression(a.n, variables, 0, ctx);
          const tileCm = Math.max(5, Number(ctx?.boxTileCm) || 30);
          return nBoxes > 0 ? nBoxes * tileCm : 0;
        }
        case 'LOGIC_EQ': return valA === valB ? 1 : 0;
        case 'LOGIC_NEQ': return valA !== valB ? 1 : 0;
        case 'LOGIC_LT': return valA < valB ? 1 : 0;
        case 'LOGIC_LTE': return valA <= valB ? 1 : 0;
        case 'LOGIC_GT': return valA > valB ? 1 : 0;
        case 'LOGIC_GTE': return valA >= valB ? 1 : 0;
        case 'LOGIC_AND': return valA && valB ? 1 : 0;
        case 'LOGIC_OR': return valA || valB ? 1 : 0;
        case 'LOGIC_NOT': return valA ? 0 : 1;
        case 'LOGIC_TERNARY': return evalExpression(a.cond, variables, 0, ctx) ? valA : valB;
        case 'LOGIC_BOOL': return evalExpression(a.val, variables, 0, ctx);
        default: return fallback;
      }
    }
  }

  const s = String(node).trim();
  if (!s) return fallback;
  if (s === 'true') return 1;
  if (s === 'false') return 0;
  if (isPlainNumber(s)) {
    const n = parseFloat(s.replace(/f$/i, ''));
    return Number.isFinite(n) ? n : fallback;
  }
  const reparsed = parseCodeArgToAst(s, variables.map((v) => v.name));
  if (reparsed && typeof reparsed === 'object') {
    return evalExpression(reparsed, variables, fallback, ctx);
  }
  return fallback;
}

export function resolveDirValue(node, variables = []) {
  if (node && typeof node === 'object' && node.kind === 'var') {
    const found = variables.find((v) => v.name === node.name);
    if (found) return String(found.value).replace(/'/g, '').trim() || 'R';
    return 'R';
  }
  const s = String(node ?? 'R').trim();
  const v = variables.find((item) => item.name === s);
  if (v) return String(v.value).replace(/'/g, '').trim() || 'R';
  return s.replace(/'/g, '') || 'R';
}
