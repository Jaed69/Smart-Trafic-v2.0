import { Container, Graphics, Text } from "pixi.js";
import {
  type DebugSnapshot,
  type SnapshotSim,
  type CapasDebug,
  CAPAS_DEBUG_DEFAULT,
  CANVAS_W,
  CANVAS_H,
  CELL_SIZE,
  CAJA_MIN,
  CAJA_MAX,
  CENTRO,
  FASE_NAMES,
} from "../types";
import { CURVAS_BEZIER, LARGO_CURVAS, STOP_POS } from "../model/Carro";

const COL_RUTA = 0x58a6ff;
const COL_OBB_OK = 0x3fb950;
const COL_OBB_HIT = 0xf85149;
const COL_OBB_ACC = 0xf85149;
const COL_GRID = 0x30363d;
const COL_GRID_OCC = 0x58a6ff;
const COL_PARADA = 0xf0f0f0;
const COL_CONFLICTO = 0xf85149;
const COL_VEL = 0xe3b341;
const COL_GAP = 0x58a6ff;
const COL_GAP_CRUZ = 0xf0883e;
const COL_SEMAFORO_H = 0x3fb950;
const COL_SEMAFORO_V = 0x58a6ff;

export class DebugOverlay {
  private stage: Container;
  private root: Container;
  private capaRutas: Container;
  private capaOBB: Container;
  private capaTray: Container;
  private capaGrid: Container;
  private capaParada: Container;
  private capaVel: Container;
  private capaGap: Container;
  private capaSemaforo: Container;
  private capas: CapasDebug = { ...CAPAS_DEBUG_DEFAULT };
  private textosGap: Text[] = [];
  private textoMDP: Text;
  private semaforoGfxEl: Graphics | null = null;

  constructor(stage: Container) {
    this.stage = stage;
    this.root = new Container();
    this.capaRutas = new Container();
    this.capaOBB = new Container();
    this.capaTray = new Container();
    this.capaGrid = new Container();
    this.capaParada = new Container();
    this.capaVel = new Container();
    this.capaGap = new Container();
    this.capaSemaforo = new Container();
    this.root.addChild(this.capaRutas);
    this.root.addChild(this.capaGrid);
    this.root.addChild(this.capaParada);
    this.root.addChild(this.capaTray);
    this.root.addChild(this.capaOBB);
    this.root.addChild(this.capaVel);
    this.root.addChild(this.capaGap);
    this.root.addChild(this.capaSemaforo);
    this.stage.addChild(this.root);
    this.textoMDP = new Text({ text: "", style: { fill: 0x58a6ff, fontSize: 12, fontFamily: "monospace" } });
    this.textoMDP.position.set(8, 8);
    this.capaSemaforo.addChild(this.textoMDP);
  }

  setCapas(c: CapasDebug): void {
    this.capas = { ...c };
  }

  get capasState(): CapasDebug { return { ...this.capas }; }

  render(debug: DebugSnapshot, sim: SnapshotSim): void {
    this.capaRutas.visible = this.capas.rutas;
    this.capaOBB.visible = this.capas.obb;
    this.capaTray.visible = this.capas.trayectoria;
    this.capaGrid.visible = this.capas.grid;
    this.capaParada.visible = this.capas.parada;
    this.capaVel.visible = this.capas.velocidad;
    this.capaGap.visible = this.capas.gap;
    this.capaSemaforo.visible = this.capas.semaforo;

    if (this.capas.rutas) this.renderRutas(debug);
    if (this.capas.obb) this.renderOBB(debug);
    if (this.capas.trayectoria) this.renderTrayectoria(debug, sim);
    if (this.capas.grid) this.renderGrid(debug);
    if (this.capas.parada) this.renderParada(debug);
    if (this.capas.velocidad) this.renderVelocidad(debug);
    if (this.capas.gap) this.renderGap(debug, sim);
    if (this.capas.semaforo) this.renderSemaforo(debug, sim);
  }

  private clearCapa(c: Container): void {
    c.removeChildren();
  }

  private renderRutas(debug: DebugSnapshot): void {
    this.clearCapa(this.capaRutas);
    const g = new Graphics();
    for (const p of debug.paths) {
      if (p.puntos.length === 0) continue;
      g.moveTo(p.puntos[0].x, p.puntos[0].y);
      for (let i = 1; i < p.puntos.length; i++) {
        g.lineTo(p.puntos[i].x, p.puntos[i].y);
      }
      g.stroke({ color: p.color, width: 1.5, alpha: 0.5 });
    }
    this.capaRutas.addChild(g);
  }

  private renderOBB(debug: DebugSnapshot): void {
    this.clearCapa(this.capaOBB);
    const g = new Graphics();
    for (const o of debug.obbs) {
      const verts = obbVerts(o.obb);
      const col = o.accidentado ? COL_OBB_ACC : o.colisionando ? COL_OBB_HIT : COL_OBB_OK;
      g.poly(verts).fill({ color: col, alpha: 0.15 }).stroke({ color: col, width: 1 });
    }
    this.capaOBB.addChild(g);
  }

  private renderTrayectoria(debug: DebugSnapshot, sim: SnapshotSim): void {
    this.clearCapa(this.capaTray);
    const g = new Graphics();
    for (const c of sim.carros) {
      if (c.estado === "accidentado" || c.estado === "leaving") continue;
      const pts = this.trayectoriaCompleta(c);
      if (pts.length === 0) continue;
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke({ color: c.color, width: 1, alpha: 0.35 });
      const head = pts[pts.length - 1];
      g.circle(head.x, head.y, 3).fill({ color: c.color, alpha: 0.8 });
    }
    void debug;
    this.capaTray.addChild(g);
  }

  private trayectoriaCompleta(c: SnapshotSim["carros"][number]): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    const n = 16;
    if (c.pathId >= 0) {
      const cb = CURVAS_BEZIER[c.pathId as number];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        pts.push({
          x: u*u*u*cb.p0.x + 3*u*u*t*cb.p1.x + 3*u*t*t*cb.p2.x + t*t*t*cb.p3.x,
          y: u*u*u*cb.p0.y + 3*u*u*t*cb.p1.y + 3*u*t*t*cb.p2.y + t*t*t*cb.p3.y,
        });
      }
    }
    return pts;
  }

  private renderGrid(debug: DebugSnapshot): void {
    this.clearCapa(this.capaGrid);
    const g = new Graphics();
    for (let x = 0; x <= CANVAS_W; x += CELL_SIZE) {
      g.moveTo(x, 0).lineTo(x, CANVAS_H);
    }
    for (let y = 0; y <= CANVAS_H; y += CELL_SIZE) {
      g.moveTo(0, y).lineTo(CANVAS_W, y);
    }
    g.stroke({ color: COL_GRID, width: 0.5, alpha: 0.5 });
    for (const cell of debug.grid.celdas) {
      if (!cell.ocupada) continue;
      g.rect(cell.ix * CELL_SIZE, cell.iy * CELL_SIZE, CELL_SIZE, CELL_SIZE).fill({ color: COL_GRID_OCC, alpha: 0.08 });
    }
    this.capaGrid.addChild(g);
  }

  private renderParada(debug: DebugSnapshot): void {
    this.clearCapa(this.capaParada);
    const g = new Graphics();
    g.rect(STOP_POS - 1, CAJA_MIN, 2, CAJA_MAX - CAJA_MIN).fill({ color: COL_PARADA, alpha: 0.6 });
    g.rect(CANVAS_W - STOP_POS - 1, CAJA_MIN, 2, CAJA_MAX - CAJA_MIN).fill({ color: COL_PARADA, alpha: 0.6 });
    g.rect(CAJA_MIN, STOP_POS - 1, CAJA_MAX - CAJA_MIN, 2).fill({ color: COL_PARADA, alpha: 0.6 });
    g.rect(CAJA_MIN, CANVAS_H - STOP_POS - 1, CAJA_MAX - CAJA_MIN, 2).fill({ color: COL_PARADA, alpha: 0.6 });
    for (const z of debug.zonasConflicto) {
      g.rect(z.x, z.y, z.w, z.h).fill({ color: COL_CONFLICTO, alpha: 0.12 }).stroke({ color: COL_CONFLICTO, width: 1, alpha: 0.4 });
    }
    this.capaParada.addChild(g);
  }

  private renderVelocidad(debug: DebugSnapshot): void {
    this.clearCapa(this.capaVel);
    const g = new Graphics();
    for (const v of debug.velocidades) {
      g.moveTo(v.x, v.y).lineTo(v.x + v.vx, v.y + v.vy).stroke({ color: COL_VEL, width: 1.5, alpha: 0.8 });
      const ang = Math.atan2(v.vy, v.vx);
      const ex = v.x + v.vx, ey = v.y + v.vy;
      const a1 = ang + 2.5, a2 = ang - 2.5;
      g.poly([ex, ey, ex + Math.cos(a1) * 4, ey + Math.sin(a1) * 4, ex + Math.cos(a2) * 4, ey + Math.sin(a2) * 4]).fill({ color: COL_VEL, alpha: 0.8 });
    }
    this.capaVel.addChild(g);
  }

  private renderGap(debug: DebugSnapshot, sim: SnapshotSim): void {
    this.clearCapa(this.capaGap);
    while (this.textosGap.length) { this.textosGap.pop(); }
    const g = new Graphics();
    const posPorId = new Map<number, { x: number; y: number }>();
    for (const c of sim.carros) posPorId.set(c.id, { x: c.x, y: c.y });
    for (const l of debug.lideres) {
      if (l.liderId === null || l.gap < 0) continue;
      const a = posPorId.get(l.id);
      const b = posPorId.get(l.liderId);
      if (!a || !b) continue;
      const col = l.esCruzado ? COL_GAP_CRUZ : COL_GAP;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: col, width: 1, alpha: 0.7 });
      const t = new Text({
        text: l.gap.toFixed(0),
        style: { fill: col, fontSize: 9, fontFamily: "monospace" },
      });
      t.anchor.set(0.5);
      t.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 6);
      this.capaGap.addChild(t);
      this.textosGap.push(t);
    }
    this.capaGap.addChildAt(g, 0);
  }

  private renderSemaforo(debug: DebugSnapshot, sim: SnapshotSim): void {
    if (this.semaforoGfxEl) {
      this.semaforoGfxEl.destroy();
      this.semaforoGfxEl = null;
    }
    const g = new Graphics();
    const colFase = sim.fase === 0 || sim.fase === 1 ? COL_SEMAFORO_H : COL_SEMAFORO_V;
    g.rect(CAJA_MIN, CAJA_MIN, CAJA_MAX - CAJA_MIN, CAJA_MAX - CAJA_MIN).stroke({ color: colFase, width: 2, alpha: 0.6 });
    this.capaSemaforo.addChild(g);
    this.semaforoGfxEl = g;
    this.textoMDP.text = this.formatMDP(debug.estadoMDP, sim.fase);
  }

  private formatMDP(e: DebugSnapshot["estadoMDP"], fase: number): string {
    return [
      `Fase: ${FASE_NAMES[fase as 0 | 1 | 2 | 3]}`,
      `MDP  bh=${e.bh} bv=${e.bv}`,
      `      eh=${e.eh ? 1 : 0} ev=${e.ev ? 1 : 0}`,
      `      accion=${e.accion}`,
    ].join("\n");
  }
}

function obbVerts(o: { cx: number; cy: number; angulo: number; hx: number; hy: number }): number[] {
  const cos = Math.cos(o.angulo);
  const sin = Math.sin(o.angulo);
  const ux = cos, uy = sin, vx = -sin, vy = cos;
  return [
    o.cx + ux * o.hx + vx * o.hy, o.cy + uy * o.hx + vy * o.hy,
    o.cx - ux * o.hx + vx * o.hy, o.cy - uy * o.hx + vy * o.hy,
    o.cx - ux * o.hx - vx * o.hy, o.cy - uy * o.hx - vy * o.hy,
    o.cx + ux * o.hx - vx * o.hy, o.cy + uy * o.hx - vy * o.hy,
  ];
}

void LARGO_CURVAS;
void CENTRO;
