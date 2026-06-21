import type { OBB, Punto } from "../types";
import { dot } from "./math";

function verticesOBB(o: OBB): [Punto, Punto, Punto, Punto] {
  const c = Math.cos(o.angulo);
  const s = Math.sin(o.angulo);
  const ux = c;
  const uy = s;
  const vx = -s;
  const vy = c;
  const cx = o.cx;
  const cy = o.cy;
  const ex = o.hx;
  const ey = o.hy;
  return [
    { x: cx + ux * ex + vx * ey, y: cy + uy * ex + vy * ey },
    { x: cx - ux * ex + vx * ey, y: cy - uy * ex + vy * ey },
    { x: cx - ux * ex - vx * ey, y: cy - uy * ex - vy * ey },
    { x: cx + ux * ex - vx * ey, y: cy + uy * ex - vy * ey },
  ];
}

function proyectar(verts: readonly Punto[], ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of verts) {
    const p = dot(v.x, v.y, ax, ay);
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

function solapado(
  a: readonly Punto[],
  b: readonly Punto[],
  ax: number,
  ay: number,
  margen: number,
): boolean {
  const [aMin, aMax] = proyectar(a, ax, ay);
  const [bMin, bMax] = proyectar(b, ax, ay);
  return aMax >= bMin - margen && bMax >= aMin - margen;
}

export function sat(a: OBB, b: OBB, margen: number = 2): boolean {
  const va = verticesOBB(a);
  const vb = verticesOBB(b);
  const ejes: Array<[number, number]> = [
    [Math.cos(a.angulo), Math.sin(a.angulo)],
    [-Math.sin(a.angulo), Math.cos(a.angulo)],
    [Math.cos(b.angulo), Math.sin(b.angulo)],
    [-Math.sin(b.angulo), Math.cos(b.angulo)],
  ];
  for (const [ax, ay] of ejes) {
    if (!solapado(va, vb, ax, ay, margen)) return false;
  }
  return true;
}

export function satDistancia(a: OBB, b: OBB): number {
  const va = verticesOBB(a);
  const vb = verticesOBB(b);
  const ejes: Array<[number, number]> = [
    [Math.cos(a.angulo), Math.sin(a.angulo)],
    [-Math.sin(a.angulo), Math.cos(a.angulo)],
    [Math.cos(b.angulo), Math.sin(b.angulo)],
    [-Math.sin(b.angulo), Math.cos(b.angulo)],
  ];
  let minPen = Infinity;
  for (const [ax, ay] of ejes) {
    const [aMin, aMax] = proyectar(va, ax, ay);
    const [bMin, bMax] = proyectar(vb, ax, ay);
    const pen = Math.min(aMax - bMin, bMax - aMin);
    if (pen < minPen) minPen = pen;
  }
  return minPen;
}
