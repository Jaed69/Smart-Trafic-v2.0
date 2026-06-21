import {
  type Direccion,
  type TipoGiro,
  type EstadoCarro,
  type CubicBezier,
  type OBB,
  type Punto,
  type Path,
  ANCHO_CARRIL,
  CAJA_MIN,
  CAJA_MAX,
  CANVAS_W,
  CANVAS_H,
  CENTRO,
  LARGO_AUTO,
  ANCHO_AUTO,
} from "../types";
import { bezierPunto, bezierTangente, distancia } from "../utils/math";

export const R_LEFT = 65;
export const R_RIGHT = 14;
export const STOP_POS = CAJA_MIN;
export const BOX_EXIT_POS = CAJA_MAX;

export function laneY(direccion: Direccion, carril: 0 | 1): number {
  if (direccion === "E") return carril === 0 ? CENTRO.y + ANCHO_CARRIL / 2 : CENTRO.y + ANCHO_CARRIL * 1.5;
  if (direccion === "W") return carril === 0 ? CENTRO.y - ANCHO_CARRIL / 2 : CENTRO.y - ANCHO_CARRIL * 1.5;
  return CENTRO.y;
}

export function laneX(direccion: Direccion, carril: 0 | 1): number {
  if (direccion === "N") return carril === 0 ? CENTRO.x + ANCHO_CARRIL / 2 : CENTRO.x + ANCHO_CARRIL * 1.5;
  if (direccion === "S") return carril === 0 ? CENTRO.x - ANCHO_CARRIL / 2 : CENTRO.x - ANCHO_CARRIL * 1.5;
  return CENTRO.x;
}

export function vectorDir(direccion: Direccion): Punto {
  switch (direccion) {
    case "E": return { x: 1, y: 0 };
    case "W": return { x: -1, y: 0 };
    case "N": return { x: 0, y: -1 };
    case "S": return { x: 0, y: 1 };
  }
}

export function spawnPoint(direccion: Direccion, carril: 0 | 1): Punto {
  switch (direccion) {
    case "E": return { x: -LARGO_AUTO, y: laneY("E", carril) };
    case "W": return { x: CANVAS_W + LARGO_AUTO, y: laneY("W", carril) };
    case "N": return { x: laneX("N", carril), y: CANVAS_H + LARGO_AUTO };
    case "S": return { x: laneX("S", carril), y: -LARGO_AUTO };
  }
}

export function stopLinePos(direccion: Direccion): number {
  return STOP_POS;
}

export type CurveIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function curveIndex(direccion: Direccion, giro: TipoGiro): CurveIndex | -1 {
  if (giro === "recto") return -1;
  const left = giro === "izquierda";
  switch (direccion) {
    case "E": return left ? 0 : 1;
    case "W": return left ? 2 : 3;
    case "N": return left ? 4 : 5;
    case "S": return left ? 6 : 7;
  }
}

export function exitDireccion(direccion: Direccion, giro: TipoGiro): Direccion {
  if (giro === "recto") return direccion;
  const left = giro === "izquierda";
  switch (direccion) {
    case "E": return left ? "N" : "S";
    case "W": return left ? "S" : "N";
    case "N": return left ? "W" : "E";
    case "S": return left ? "E" : "W";
  }
}

function buildCurve(
  start: Punto,
  t0: Punto,
  end: Punto,
  t3: Punto,
  r: number,
): CubicBezier {
  return {
    p0: start,
    p1: { x: start.x + t0.x * r, y: start.y + t0.y * r },
    p2: { x: end.x - t3.x * r, y: end.y - t3.y * r },
    p3: end,
  };
}

function curveEntry(direccion: Direccion, carril: 0 | 1): { start: Punto; t0: Punto } {
  const t0 = vectorDir(direccion);
  switch (direccion) {
    case "E": return { start: { x: CAJA_MIN, y: laneY("E", carril) }, t0 };
    case "W": return { start: { x: CAJA_MAX, y: laneY("W", carril) }, t0 };
    case "N": return { start: { x: laneX("N", carril), y: CAJA_MAX }, t0 };
    case "S": return { start: { x: laneX("S", carril), y: CAJA_MIN }, t0 };
  }
}

function curveExitLane0(direccion: Direccion, giro: TipoGiro): { end: Punto; t3: Punto } {
  const exit = exitDireccion(direccion, giro);
  const t3 = vectorDir(exit);
  switch (exit) {
    case "E": return { end: { x: CAJA_MAX, y: laneY("E", 0) }, t3 };
    case "W": return { end: { x: CAJA_MIN, y: laneY("W", 0) }, t3 };
    case "N": return { end: { x: laneX("N", 0), y: CAJA_MIN }, t3 };
    case "S": return { end: { x: laneX("S", 0), y: CAJA_MAX }, t3 };
  }
}

function curveExitLane1(direccion: Direccion, giro: TipoGiro): { end: Punto; t3: Punto } {
  const exit = exitDireccion(direccion, giro);
  const t3 = vectorDir(exit);
  switch (exit) {
    case "E": return { end: { x: CAJA_MAX, y: laneY("E", 1) }, t3 };
    case "W": return { end: { x: CAJA_MIN, y: laneY("W", 1) }, t3 };
    case "N": return { end: { x: laneX("N", 1), y: CAJA_MIN }, t3 };
    case "S": return { end: { x: laneX("S", 1), y: CAJA_MAX }, t3 };
  }
}

function buildCurvas(): CubicBezier[] {
  const curvas: CubicBezier[] = [];
  const defs: Array<{ dir: Direccion; giro: TipoGiro; r: number; lane1: boolean }> = [
    { dir: "E", giro: "izquierda", r: R_LEFT, lane1: false },
    { dir: "E", giro: "derecha", r: R_RIGHT, lane1: true },
    { dir: "W", giro: "izquierda", r: R_LEFT, lane1: false },
    { dir: "W", giro: "derecha", r: R_RIGHT, lane1: true },
    { dir: "N", giro: "izquierda", r: R_LEFT, lane1: false },
    { dir: "N", giro: "derecha", r: R_RIGHT, lane1: true },
    { dir: "S", giro: "izquierda", r: R_LEFT, lane1: false },
    { dir: "S", giro: "derecha", r: R_RIGHT, lane1: true },
  ];
  for (const d of defs) {
    const carril: 0 | 1 = d.lane1 ? 1 : 0;
    const { start, t0 } = curveEntry(d.dir, carril);
    const { end, t3 } = d.lane1 ? curveExitLane1(d.dir, d.giro) : curveExitLane0(d.dir, d.giro);
    curvas.push(buildCurve(start, t0, end, t3, d.r));
  }
  return curvas;
}

export const CURVAS_BEZIER: CubicBezier[] = buildCurvas();

function computeLargo(c: CubicBezier, n: number = 100): number {
  let total = 0;
  let prev = bezierPunto(c.p0, c.p1, c.p2, c.p3, 0);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = bezierPunto(c.p0, c.p1, c.p2, c.p3, t);
    total += distancia(prev.x, prev.y, p.x, p.y);
    prev = p;
  }
  return total;
}

export const LARGO_CURVAS: number[] = CURVAS_BEZIER.map((c) => computeLargo(c));

export function curveEntryPoint(idx: CurveIndex): Punto {
  return CURVAS_BEZIER[idx].p0;
}

export function curveExitPoint(idx: CurveIndex): Punto {
  return CURVAS_BEZIER[idx].p3;
}

export function curveExitDireccion(idx: CurveIndex): Direccion {
  const def = [
    { dir: "E", giro: "izquierda" },
    { dir: "E", giro: "derecha" },
    { dir: "W", giro: "izquierda" },
    { dir: "W", giro: "derecha" },
    { dir: "N", giro: "izquierda" },
    { dir: "N", giro: "derecha" },
    { dir: "S", giro: "izquierda" },
    { dir: "S", giro: "derecha" },
  ] as const;
  const d = def[idx];
  return exitDireccion(d.dir, d.giro);
}

export function curveExitLane(idx: CurveIndex): 0 | 1 {
  return idx % 2 === 0 ? 0 : 1;
}

export function straightExitPoint(direccion: Direccion, carril: 0 | 1): Punto {
  switch (direccion) {
    case "E": return { x: CAJA_MAX, y: laneY("E", carril) };
    case "W": return { x: CAJA_MIN, y: laneY("W", carril) };
    case "N": return { x: laneX("N", carril), y: CAJA_MIN };
    case "S": return { x: laneX("S", carril), y: CAJA_MAX };
  }
}

export function distanceToEdge(p: Punto, dir: Direccion): number {
  switch (dir) {
    case "E": return CANVAS_W - p.x;
    case "W": return p.x;
    case "N": return p.y;
    case "S": return CANVAS_H - p.y;
  }
}

const PALETA = [0x4c9aff, 0x3fb950, 0xf0883e, 0xd2a8ff, 0xff7b72, 0x79c0ff, 0xe3b341, 0x56d364];

export class Carro {
  id: number;
  direccion: Direccion;
  carril: 0 | 1;
  giro: TipoGiro;
  pathId: CurveIndex | -1;
  estado: EstadoCarro = "approaching";
  pos: number;
  velocidad: number = 0;
  x: number;
  y: number;
  angulo: number;
  ultimoAngulo: number;
  accidentado: boolean = false;
  color: number;
  timerReaccion: number = 0;
  latenciaReaccion: number;
  distraido: number = 0;
  gapPercibidoMult: number = 1;
  correLuzDecidido: boolean = false;
  prioridadGiro: boolean = false;
  liderId: number | null = null;
  gap: number = Infinity;
  gapCruzado: number = Infinity;
  tiempoEspera: number = 0;
  path: Path;
  exitDir: Direccion;
  exitLane: 0 | 1;
  exitPoint: Punto;
  leaveStartPos: number;
  exitVec: Punto;
  velocidadMaximaIndividual: number;

  constructor(
    id: number,
    direccion: Direccion,
    carril: 0 | 1,
    giro: TipoGiro,
    promReaccion: number,
    maxVel: number,
  ) {
    this.id = id;
    this.direccion = direccion;
    this.carril = carril;
    this.giro = giro;
    this.pathId = curveIndex(direccion, giro);
    this.path = { direccion, carril, giro };
    this.exitDir = exitDireccion(direccion, giro);
    this.exitLane = giro === "recto" ? carril : curveExitLaneSafe(this.pathId);
    const spawn = spawnPoint(direccion, carril);
    this.x = spawn.x;
    this.y = spawn.y;
    const v = vectorDir(direccion);
    this.angulo = Math.atan2(v.y, v.x);
    this.ultimoAngulo = this.angulo;
    this.pos = 0;
    this.color = PALETA[Math.floor(Math.random() * PALETA.length)];
    this.latenciaReaccion = Math.max(1, Math.round(promReaccion * 60 + (Math.random() - 0.5) * 24));
    this.velocidadMaximaIndividual = maxVel * (0.9 + Math.random() * 0.2);
    if (giro === "recto") {
      this.exitPoint = straightExitPoint(direccion, carril);
      this.leaveStartPos = BOX_EXIT_POS;
    } else {
      const idx = this.pathId as CurveIndex;
      this.exitPoint = curveExitPoint(idx);
      this.leaveStartPos = BOX_EXIT_POS;
    }
    this.exitVec = vectorDir(this.exitDir);
  }

  get hx(): number { return LARGO_AUTO / 2; }
  get hy(): number { return ANCHO_AUTO / 2; }

  obb(): OBB {
    return {
      cx: this.x,
      cy: this.y,
      angulo: this.ultimoAngulo,
      hx: this.hx,
      hy: this.hy,
    };
  }

  sampleCurve(t: number): { pos: Punto; ang: number } {
    const c = CURVAS_BEZIER[this.pathId as CurveIndex];
    const pos = bezierPunto(c.p0, c.p1, c.p2, c.p3, t);
    const tan = bezierTangente(c.p0, c.p1, c.p2, c.p3, t);
    return { pos, ang: Math.atan2(tan.y, tan.x) };
  }

  snapshot() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      angulo: this.ultimoAngulo,
      velocidad: this.velocidad,
      estado: this.estado,
      direccion: this.direccion,
      carril: this.carril,
      giro: this.giro,
      accidentado: this.accidentado,
      pathId: this.pathId,
      color: this.color,
    };
  }
}

function curveExitLaneSafe(idx: CurveIndex | -1): 0 | 1 {
  if (idx < 0) return 0;
  return curveExitLane(idx as CurveIndex);
}
