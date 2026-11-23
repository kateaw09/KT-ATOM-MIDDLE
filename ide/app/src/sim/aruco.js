'use strict';

export const MARKER_IDS = [
  ...Array.from({ length: 34 }, (_, i) => i + 1),
  101, 102, 103, 104
];

function rotateBitsCW90(bits) {
  let out = '';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      out += bits[(4 - c) * 5 + r];
    }
  }
  return out;
}

export function getMarkerRotations(bits0) {
  const r0 = bits0;
  const r90 = rotateBitsCW90(r0);
  const r180 = rotateBitsCW90(r90);
  const r270 = rotateBitsCW90(r180);
  return [r0, r90, r180, r270];
}

export function hammingDistance(a, b) {
  let dist = 0;
  for (let i = 0; i < 25; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) dist++;
  }
  return dist;
}

function countOnes(bits) {
  let ones = 0;
  for (let i = 0; i < 25; i++) {
    if (bits.charCodeAt(i) === 49) ones++;
  }
  return ones;
}

function createMulberry32(seed) {
  let a = seed >>> 0;
  return function nextRand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { MARKER_BITS, MARKER_LOOKUP, ALL_ROTATED_ENTRIES, DICT_STATS } = (function initMarkerDictionary() {
  const rng = createMulberry32(0x4b543334);
  const bitsById = Object.create(null);
  const lookup = Object.create(null);
  const allEntries = [];
  const acceptedRotSets = [];

  let minSelfDist = 25;
  let minCrossDist = 25;

  for (const id of MARKER_IDS) {
    let found = null;
    for (let attempt = 0; attempt < 250000; attempt++) {
      let cand = '';
      let ones = 0;
      for (let i = 0; i < 25; i++) {
        const bit = rng() < 0.5 ? '1' : '0';
        if (bit === '1') ones++;
        cand += bit;
      }
      if (ones < 8 || ones > 17) continue;

      const rots = getMarkerRotations(cand);

      let selfMin = 25;
      let selfValid = true;
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const d = hammingDistance(rots[i], rots[j]);
          if (d < selfMin) selfMin = d;
          if (d < 6) {
            selfValid = false;
            break;
          }
        }
        if (!selfValid) break;
      }
      if (!selfValid) continue;

      let crossMin = 25;
      let crossValid = true;
      for (let k = 0; k < acceptedRotSets.length; k++) {
        const prevRots = acceptedRotSets[k];
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            const d = hammingDistance(rots[i], prevRots[j]);
            if (d < crossMin) crossMin = d;
            if (d < 7) {
              crossValid = false;
              break;
            }
          }
          if (!crossValid) break;
        }
        if (!crossValid) break;
      }
      if (!crossValid) continue;

      found = { rots, selfMin, crossMin };
      break;
    }

    if (!found) {
      throw new Error(`initMarkerDictionary: failed to generate valid ArUco code for ID ${id}`);
    }

    if (found.selfMin < minSelfDist) minSelfDist = found.selfMin;
    if (acceptedRotSets.length > 0 && found.crossMin < minCrossDist) minCrossDist = found.crossMin;

    bitsById[id] = found.rots[0];
    acceptedRotSets.push(found.rots);

    const rotAngles = [0, 90, 180, 270];
    for (let i = 0; i < 4; i++) {
      const code = found.rots[i];
      const entry = { id, rot: rotAngles[i], bits: code };
      lookup[code] = { id, rot: rotAngles[i] };
      allEntries.push(entry);
    }
  }

  return {
    MARKER_BITS: bitsById,
    MARKER_LOOKUP: lookup,
    ALL_ROTATED_ENTRIES: allEntries,
    DICT_STATS: {
      count: MARKER_IDS.length,
      minSelfDist,
      minCrossDist,
      lookupCount: Object.keys(lookup).length
    }
  };
})();

export { MARKER_BITS, MARKER_LOOKUP, DICT_STATS };

export function decodeMarkerBits(bitString, maxHammingErr = 1) {
  if (!bitString || bitString.length !== 25) return null;
  const exact = MARKER_LOOKUP[bitString];
  if (exact) return { id: exact.id, rot: exact.rot, dist: 0 };
  if (maxHammingErr <= 0) return null;

  let best = null;
  let bestDist = 26;
  let secondBestDist = 26;

  for (let i = 0; i < ALL_ROTATED_ENTRIES.length; i++) {
    const entry = ALL_ROTATED_ENTRIES[i];
    const d = hammingDistance(bitString, entry.bits);
    if (d < bestDist) {
      secondBestDist = bestDist;
      bestDist = d;
      best = entry;
    } else if (d < secondBestDist) {
      secondBestDist = d;
    }
  }

  if (best && bestDist <= maxHammingErr && secondBestDist - bestDist >= 3) {
    return { id: best.id, rot: best.rot, dist: bestDist };
  }
  return null;
}

export function drawArUcoMarker(ctx, id, x, y, size) {
  const bits = MARKER_BITS[Number(id)];
  if (!bits || size <= 0) return;

  ctx.save();
  // Quiet Zone (10% white border around 7x7 marker)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);

  const qz = size * 0.1;
  const innerSize = size - qz * 2;
  const cell = innerSize / 7;
  const ix = x + qz;
  const iy = y + qz;

  ctx.fillStyle = '#000000';
  ctx.fillRect(ix, iy, innerSize, innerSize);

  ctx.fillStyle = '#ffffff';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (bits.charCodeAt(r * 5 + c) === 49) {
        const cx = ix + (c + 1) * cell;
        const cy = iy + (r + 1) * cell;
        ctx.fillRect(cx - 0.15, cy - 0.15, cell + 0.3, cell + 0.3);
      }
    }
  }
  ctx.restore();
}

export function validateMarkerDictionary() {
  for (const id of MARKER_IDS) {
    const b = MARKER_BITS[id];
    if (!b || b.length !== 25) return false;
    const ones = countOnes(b);
    if (ones < 8 || ones > 17) return false;
  }
  return DICT_STATS.minSelfDist >= 6 && DICT_STATS.minCrossDist >= 7 && DICT_STATS.lookupCount === MARKER_IDS.length * 4;
}
