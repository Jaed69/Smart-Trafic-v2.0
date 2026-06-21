import { Application, Container, Graphics, Text } from "pixi.js";
import {
  type SnapshotSim,
  type CarroSnapshot,
  type FaseSemaforo,
  type Direccion,
  ANCHO_CARRIL,
  ANCHO_CALZADA,
  CAJA_MIN,
  CAJA_MAX,
  CANVAS_W,
  CANVAS_H,
  CENTRO,
  LARGO_AUTO,
  ANCHO_AUTO,
  FASE_NAMES,
} from "../types";

const COL_ASPHALT = 0x2b2f36;
const COL_ASPHALT_LIGHT = 0x333842;
const COL_LINE_WHITE = 0xd0d0d0;
const COL_LINE_YELLOW = 0xe3b341;
const COL_STOP = 0xf0f0f0;
const COL_ARROW = 0x8b949e;
const COL_LIGHT_HOUSING = 0x161b22;
const COL_GREEN = 0x3fb950;
const COL_YELLOW = 0xe3b341;
const COL_RED = 0xf85149;
const COL_ARROW_DIR = 0xf0883e;
const COL_ACCIDENT = 0xf85149;

interface LightPos { x: number; y: number; dir: Direccion; }

const LIGHTS: LightPos[] = [
  { x: 322, y: 478, dir: "E" },
  { x: 478, y: 322, dir: "W" },
  { x: 478, y: 478, dir: "N" },
  { x: 322, y: 322, dir: "S" },
];

function faseColorFor(dir: Direccion, fase: FaseSemaforo): number {
  const horiz = dir === "E" || dir === "W";
  if (horiz) {
    if (fase === 0) return COL_GREEN;
    if (fase === 1) return COL_YELLOW;
    return COL_RED;
  } else {
    if (fase === 2) return COL_GREEN;
    if (fase === 3) return COL_YELLOW;
    return COL_RED;
  }
}

function obbVertices(c: CarroSnapshot): number[] {
  const cos = Math.cos(c.angulo);
  const sin = Math.sin(c.angulo);
  const hx = LARGO_AUTO / 2;
  const hy = ANCHO_AUTO / 2;
  const ux = cos, uy = sin;
  const vx = -sin, vy = cos;
  const cx = c.x, cy = c.y;
  return [
    cx + ux * hx + vx * hy, cy + uy * hx + vy * hy,
    cx - ux * hx + vx * hy, cy - uy * hx + vy * hy,
    cx - ux * hx - vx * hy, cy - uy * hx - vy * hy,
    cx + ux * hx - vx * hy, cy + uy * hx - vy * hy,
  ];
}

function dirArrowVertices(c: CarroSnapshot): number[] {
  const cos = Math.cos(c.angulo);
  const sin = Math.sin(c.angulo);
  const s = 4;
  const cx = c.x, cy = c.y;
  return [
    cx + cos * s, cy + sin * s,
    cx - cos * s * 0.5 - sin * s * 0.6, cy - sin * s * 0.5 + cos * s * 0.6,
    cx - cos * s * 0.5 + sin * s * 0.6, cy - sin * s * 0.5 - cos * s * 0.6,
  ];
}

export interface RenderPixiCallbacks {
  onGruaClick: (id: number) => void;
}

export class RenderPixi {
  app: Application;
  private stage: Container;
  private staticLayer: Container;
  private semaforoLayer: Container;
  private autosLayer: Container;
  private gruaLayer: Container;
  private ready = false;
  private callbacks: RenderPixiCallbacks;
  private blink = 0;
  private semaforoGfx: Graphics[] = [];
  private semaforosInit = false;

  constructor(callbacks: RenderPixiCallbacks) {
    this.app = new Application();
    this.stage = new Container();
    this.staticLayer = new Container();
    this.semaforoLayer = new Container();
    this.autosLayer = new Container();
    this.gruaLayer = new Container();
    this.callbacks = callbacks;
  }

  async init(mount: HTMLElement): Promise<void> {
    await this.app.init({
      width: CANVAS_W,
      height: CANVAS_H,
      background: 0x05080d,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    mount.appendChild(this.app.canvas);
    this.app.stage.addChild(this.staticLayer);
    this.app.stage.addChild(this.semaforoLayer);
    this.app.stage.addChild(this.autosLayer);
    this.app.stage.addChild(this.gruaLayer);
    this.dibujarEstatico();
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = { contains: () => true } as never;
    this.app.stage.on("pointerdown", (e) => this.onPointer(e));
    this.ready = true;
  }

  private onPointer(e: { global: { x: number; y: number } }): void {
    const snap = this.lastSnap;
    if (!snap) return;
    const gx = e.global.x;
    const gy = e.global.y;
    for (const c of snap.carros) {
      if (!c.accidentado) continue;
      const verts = obbVertices(c);
      if (puntoEnPoligono(gx, gy, verts)) {
        this.callbacks.onGruaClick(c.id);
        return;
      }
    }
  }

  private lastSnap: SnapshotSim | null = null;

  private dibujarEstatico(): void {
    const g = new Graphics();
    g.rect(CAJA_MIN, CAJA_MIN, ANCHO_CALZADA, ANCHO_CALZADA).fill({ color: COL_ASPHALT });
    g.rect(0, CAJA_MIN, CAJA_MIN, ANCHO_CALZADA).fill({ color: COL_ASPHALT });
    g.rect(CAJA_MAX, CAJA_MIN, CANVAS_W - CAJA_MAX, ANCHO_CALZADA).fill({ color: COL_ASPHALT });
    g.rect(CAJA_MIN, 0, ANCHO_CALZADA, CAJA_MIN).fill({ color: COL_ASPHALT });
    g.rect(CAJA_MIN, CAJA_MAX, ANCHO_CALZADA, CANVAS_H - CAJA_MAX).fill({ color: COL_ASPHALT });
    this.staticLayer.addChild(g);

    const lineas = new Graphics();
    lineas.moveTo(CAJA_MIN, CAJA_MIN).lineTo(CAJA_MAX, CAJA_MIN).stroke({ color: COL_LINE_WHITE, width: 1 });
    lineas.moveTo(CAJA_MIN, CAJA_MAX).lineTo(CAJA_MAX, CAJA_MAX).stroke({ color: COL_LINE_WHITE, width: 1 });
    lineas.moveTo(CAJA_MIN, CAJA_MIN).lineTo(CAJA_MIN, CAJA_MAX).stroke({ color: COL_LINE_WHITE, width: 1 });
    lineas.moveTo(CAJA_MAX, CAJA_MIN).lineTo(CAJA_MAX, CAJA_MAX).stroke({ color: COL_LINE_WHITE, width: 1 });

    lineas.moveTo(0, CENTRO.y).lineTo(CAJA_MIN, CENTRO.y).stroke({ color: COL_LINE_YELLOW, width: 2 });
    lineas.moveTo(CAJA_MAX, CENTRO.y).lineTo(CANVAS_W, CENTRO.y).stroke({ color: COL_LINE_YELLOW, width: 2 });
    lineas.moveTo(CENTRO.x, 0).lineTo(CENTRO.x, CAJA_MIN).stroke({ color: COL_LINE_YELLOW, width: 2 });
    lineas.moveTo(CENTRO.x, CAJA_MAX).lineTo(CENTRO.x, CANVAS_H).stroke({ color: COL_LINE_YELLOW, width: 2 });

    this.dibujarLineasCarriles(lineas);
    this.dibujarLineasParada(lineas);
    this.staticLayer.addChild(lineas);

    const flechas = new Graphics();
    this.dibujarFlechas(flechas);
    this.staticLayer.addChild(flechas);
  }

  private dibujarLineasCarriles(g: Graphics): void {
    const dash = 12;
    const gap = 10;
    const stroke = { color: COL_LINE_WHITE, width: 1, alpha: 0.6 };
    for (let x = 0; x < CAJA_MIN; x += dash + gap) {
      g.rect(x, CENTRO.y + ANCHO_CARRIL, Math.min(dash, CAJA_MIN - x), 1).fill(stroke);
      g.rect(x, CENTRO.y - ANCHO_CARRIL, Math.min(dash, CAJA_MIN - x), 1).fill(stroke);
    }
    for (let x = CAJA_MAX; x < CANVAS_W; x += dash + gap) {
      g.rect(x, CENTRO.y + ANCHO_CARRIL, Math.min(dash, CANVAS_W - x), 1).fill(stroke);
      g.rect(x, CENTRO.y - ANCHO_CARRIL, Math.min(dash, CANVAS_W - x), 1).fill(stroke);
    }
    for (let y = 0; y < CAJA_MIN; y += dash + gap) {
      g.rect(CENTRO.x + ANCHO_CARRIL, y, 1, Math.min(dash, CAJA_MIN - y)).fill(stroke);
      g.rect(CENTRO.x - ANCHO_CARRIL, y, 1, Math.min(dash, CAJA_MIN - y)).fill(stroke);
    }
    for (let y = CAJA_MAX; y < CANVAS_H; y += dash + gap) {
      g.rect(CENTRO.x + ANCHO_CARRIL, y, 1, Math.min(dash, CANVAS_H - y)).fill(stroke);
      g.rect(CENTRO.x - ANCHO_CARRIL, y, 1, Math.min(dash, CANVAS_H - y)).fill(stroke);
    }
  }

  private dibujarLineasParada(g: Graphics): void {
    g.rect(CAJA_MIN - 3, CAJA_MIN, 3, ANCHO_CALZADA).fill({ color: COL_STOP });
    g.rect(CAJA_MAX, CAJA_MIN, 3, ANCHO_CALZADA).fill({ color: COL_STOP });
    g.rect(CAJA_MIN, CAJA_MIN - 3, ANCHO_CALZADA, 3).fill({ color: COL_STOP });
    g.rect(CAJA_MIN, CAJA_MAX, ANCHO_CALZADA, 3).fill({ color: COL_STOP });
  }

  private dibujarFlechas(g: Graphics): void {
    this.dibujarFlechaCarril(g, 180, CENTRO.y + ANCHO_CARRIL / 2, 0, true, true);
    this.dibujarFlechaCarril(g, 180, CENTRO.y + ANCHO_CARRIL * 1.5, 0, false, true);
    this.dibujarFlechaCarril(g, CANVAS_W - 180, CENTRO.y - ANCHO_CARRIL / 2, Math.PI, true, true);
    this.dibujarFlechaCarril(g, CANVAS_W - 180, CENTRO.y - ANCHO_CARRIL * 1.5, Math.PI, false, true);
    this.dibujarFlechaCarril(g, CENTRO.x + ANCHO_CARRIL / 2, CANVAS_H - 180, -Math.PI / 2, true, true);
    this.dibujarFlechaCarril(g, CENTRO.x + ANCHO_CARRIL * 1.5, CANVAS_H - 180, -Math.PI / 2, false, true);
    this.dibujarFlechaCarril(g, CENTRO.x - ANCHO_CARRIL / 2, 180, Math.PI / 2, true, true);
    this.dibujarFlechaCarril(g, CENTRO.x - ANCHO_CARRIL * 1.5, 180, Math.PI / 2, false, true);
  }

  private dibujarFlechaCarril(
    g: Graphics,
    x: number,
    y: number,
    ang: number,
    izquierda: boolean,
    recto: boolean,
  ): void {
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const tx = (lx: number, ly: number): [number, number] => [
      x + cos * lx - sin * ly,
      y + sin * lx + cos * ly,
    ];
    const [ax, ay] = tx(10, 0);
    const [bx, by] = tx(-6, -5);
    const [cx, cy] = tx(-6, 5);
    g.poly([ax, ay, bx, by, cx, cy]).fill({ color: COL_ARROW, alpha: 0.5 });
    if (recto) {
      g.moveTo(x - 6, y).lineTo(x + 4, y).stroke({ color: COL_ARROW, width: 1, alpha: 0.4 });
    }
    if (izquierda) {
      void izquierda;
    }
  }

  render(snapshot: SnapshotSim): void {
    if (!this.ready) return;
    this.lastSnap = snapshot;
    this.blink = (this.blink + 1) % 60;
    this.renderSemaforos(snapshot.fase);
    this.renderAutos(snapshot.carros);
  }

  private initSemaforos(): void {
    for (const L of LIGHTS) {
      const housing = new Graphics();
      housing.roundRect(L.x - 9, L.y - 9, 18, 18, 3).fill({ color: COL_LIGHT_HOUSING }).stroke({ color: 0x30363d, width: 1 });
      this.semaforoLayer.addChild(housing);
      const luz = new Graphics();
      luz.circle(L.x, L.y, 6).fill({ color: COL_RED });
      this.semaforoLayer.addChild(luz);
      this.semaforoGfx.push(luz);
      const label = new Text({
        text: L.dir,
        style: { fill: 0x8b949e, fontSize: 9, fontFamily: "monospace" },
      });
      label.anchor.set(0.5);
      label.position.set(L.x, L.y - 18);
      this.semaforoLayer.addChild(label);
    }
    this.semaforosInit = true;
    void FASE_NAMES;
  }

  private renderSemaforos(fase: FaseSemaforo): void {
    if (!this.semaforosInit) this.initSemaforos();
    for (let i = 0; i < LIGHTS.length; i++) {
      const color = faseColorFor(LIGHTS[i].dir, fase);
      const luz = this.semaforoGfx[i];
      luz.clear();
      luz.circle(LIGHTS[i].x, LIGHTS[i].y, 6).fill({ color });
    }
  }

  private renderAutos(carros: CarroSnapshot[]): void {
    const old = this.autosLayer.removeChildren();
    for (const c of old) c.destroy();
    const g = new Graphics();
    for (const c of carros) {
      const verts = obbVertices(c);
      if (c.accidentado) {
        g.poly(verts).fill({ color: COL_ACCIDENT, alpha: 0.5 }).stroke({ color: COL_ACCIDENT, width: 1 });
        g.moveTo(verts[0], verts[1]).lineTo(verts[4], verts[5]).stroke({ color: COL_ACCIDENT, width: 1 });
        g.moveTo(verts[2], verts[3]).lineTo(verts[6], verts[7]).stroke({ color: COL_ACCIDENT, width: 1 });
      } else {
        g.poly(verts).fill({ color: c.color, alpha: 0.9 }).stroke({ color: 0x000000, width: 1 });
      }
    }
    this.autosLayer.addChild(g);

    const ag = new Graphics();
    const parpadeoOn = this.blink < 30;
    for (const c of carros) {
      if (c.accidentado) continue;
      const av = dirArrowVertices(c);
      ag.poly(av).fill({ color: COL_ARROW_DIR, alpha: parpadeoOn ? 1 : 0.3 });
    }
    this.autosLayer.addChild(ag);
  }

  highlightAccidentado(id: number): void {
    this.gruaLayer.removeChildren();
    if (id < 0) return;
    const snap = this.lastSnap;
    if (!snap) return;
    const c = snap.carros.find((x) => x.id === id);
    if (!c) return;
    const g = new Graphics();
    const verts = obbVertices(c);
    g.poly(verts).stroke({ color: COL_ARROW_DIR, width: 2, alpha: 0.9 });
    this.gruaLayer.addChild(g);
  }

  clearGruaHighlight(): void {
    const old = this.gruaLayer.removeChildren();
    for (const c of old) c.destroy();
  }

  destroy(): void {
    this.app.destroy(true);
  }
}

function puntoEnPoligono(px: number, py: number, verts: number[]): boolean {
  let inside = false;
  const n = verts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i * 2], yi = verts[i * 2 + 1];
    const xj = verts[j * 2], yj = verts[j * 2 + 1];
    const intersect = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
