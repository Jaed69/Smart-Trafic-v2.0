import type { Punto } from "../types";

export function distancia(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distanciaP(a: Punto, b: Punto): number {
  return distancia(a.x, a.y, b.x, b.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function anguloEntre(ax: number, ay: number, bx: number, by: number): number {
  const d = dot(ax, ay, bx, by);
  const la = len(ax, ay);
  const lb = len(bx, by);
  if (la === 0 || lb === 0) return 0;
  return Math.acos(clamp(d / (la * lb), -1, 1));
}

const FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880];

export function calcularBinomial(n: number, k: number): number {
  if (k < 0 || k > n || n < 0 || n > 9) return 0;
  return FACTORIAL[n] / (FACTORIAL[k] * FACTORIAL[n - k]);
}

export function bezierPunto(
  p0: Punto,
  p1: Punto,
  p2: Punto,
  p3: Punto,
  t: number,
): Punto {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

export function bezierTangente(
  p0: Punto,
  p1: Punto,
  p2: Punto,
  p3: Punto,
  t: number,
): Punto {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return {
    x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
  };
}

export function normalizar(x: number, y: number): Punto {
  const l = len(x, y);
  if (l === 0) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

export function aleatorioEntre(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function aleatorioEntero(min: number, max: number): number {
  return Math.floor(aleatorioEntre(min, max + 1));
}
