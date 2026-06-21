import {
  type SimParams,
  type SnapshotSim,
  type DebugSnapshot,
  type Metricas,
  type Direccion,
  type FaseSemaforo,
  type EstadoCarro,
  type EstadoMDP,
  type AccionMDP,
  type OBB,
  type Punto,
  type CarroSnapshot,
  DEFAULT_PARAMS,
  DEFAULT_METRICAS,
  IDM,
  MDP,
  ANCHO_CARRIL,
  CAJA_MIN,
  CAJA_MAX,
  CANVAS_W,
  CANVAS_H,
  LARGO_AUTO,
  CELL_SIZE,
  SAT_MARGEN,
  AMARILLO_DURACION,
  AMARILLO_MAX_DURACION,
} from "../types";
import { Carro, CURVAS_BEZIER, LARGO_CURVAS, STOP_POS, BOX_EXIT_POS, spawnPoint, vectorDir, laneY, laneX, distanceToEdge } from "./Carro";
import { SpatialGrid } from "../utils/spatialGrid";
import { sat } from "../utils/sat";
import { distancia, clamp } from "../utils/math";
import { bucketDeCola } from "../mdp/AgenteMDP";

const DIRECCIONES: Direccion[] = ["E", "W", "N", "S"];
const H_DIRS: Direccion[] = ["E", "W"];
const V_DIRS: Direccion[] = ["N", "S"];
const MAX_COLA_BUCKET = 12;
const HISTORIAL_PUNTOS = 50;
const HISTORIAL_INTERVALO = 30;
const GRUA_COOLDOWN = 120;
const DISTRACCION_DURACION = 30;
const DILEMA_DIST = 30;
const DILEMA_VEL = 0.5;
const HARD_STOP_MOVIL = 5;
const HARD_STOP_ACCIDENTADO = 8;
const EMERGENCIA_ACCEL = -0.5;
const FRENO_NORMAL = -0.3;
const AMARILLO_DECEL_UMBRAL = 60;

function esHorizontal(d: Direccion): boolean {
  return d === "E" || d === "W";
}

function posFromXY(x: number, y: number, dir: Direccion): number {
  switch (dir) {
    case "E": return x;
    case "W": return CANVAS_W - x;
    case "N": return CANVAS_H - y;
    case "S": return y;
  }
}

function xyFromPos(pos: number, dir: Direccion, laneCoord: number): Punto {
  switch (dir) {
    case "E": return { x: pos, y: laneCoord };
    case "W": return { x: CANVAS_W - pos, y: laneCoord };
    case "N": return { x: laneCoord, y: CANVAS_H - pos };
    case "S": return { x: laneCoord, y: pos };
  }
}

function laneCoordFor(dir: Direccion, carril: 0 | 1): number {
  if (esHorizontal(dir)) return laneY(dir, carril);
  return laneX(dir, carril);
}

export class SimuladorModel {
  params: SimParams;
  carros: Carro[] = [];
  private flujos: Map<string, Carro[]> = new Map();
  fase: FaseSemaforo = 0;
  tiempoFase: number = 0;
  metricas: Metricas = { ...DEFAULT_METRICAS };
  private grid: SpatialGrid;
  private nextId = 1;
  private gruasCooldown = 0;
  private staggerTimers: Record<Direccion, number> = { E: 0, W: 0, N: 0, S: 0 };
  private historialEspera: number[] = [];
  private frameCount = 0;
  private ultimaAccion: AccionMDP = "mantener";
  private ultimoEstadoMDP: EstadoMDP = { bh: 0, bv: 0, fase: 0, eh: false, ev: false };
  private pausado = false;
  private velocidadSim = 1;
  private cacheColisionCerca: Carro[] = [];
  private cacheConflictoFrame: number = -1;
  private cacheConflicto: boolean = false;

  constructor(params: SimParams = { ...DEFAULT_PARAMS }) {
    this.params = { ...params };
    this.grid = new SpatialGrid(CELL_SIZE, CANVAS_W, CANVAS_H);
  }

  setParams(p: Partial<SimParams>): void {
    this.params = { ...this.params, ...p };
  }

  setPausado(p: boolean): void { this.pausado = p; }
  get pausadoState(): boolean { return this.pausado; }
  setVelocidadSim(v: number): void { this.velocidadSim = clamp(v, 0.1, 10); }
  get velocidadSimState(): number { return this.velocidadSim; }

  reset(): void {
    this.carros = [];
    this.flujos.clear();
    this.fase = 0;
    this.tiempoFase = 0;
    this.metricas = { ...DEFAULT_METRICAS };
    this.nextId = 1;
    this.gruasCooldown = 0;
    this.historialEspera = [];
    this.frameCount = 0;
    this.ultimaAccion = "mantener";
    this.ultimoEstadoMDP = { bh: 0, bv: 0, fase: 0, eh: false, ev: false };
  }

  resetMetricas(): void {
    this.metricas = { ...DEFAULT_METRICAS };
    this.historialEspera = [];
  }

  step(): void {
    if (this.pausado) return;
    const substeps = Math.max(1, Math.round(this.velocidadSim));
    const dt = this.velocidadSim >= 1 ? 1 : this.velocidadSim;
    for (let s = 0; s < substeps; s++) {
      this.stepFrame(dt);
    }
  }

  private stepFrame(dt: number): void {
    this.frameCount++;
    this.grid.clear();
    for (const c of this.carros) {
      this.grid.insert(c.id, c.x, c.y);
    }
    this.rebuildFlujos();
    this.spawnCheck();
    for (const c of this.carros) {
      this.actualizarVehiculo(c, dt);
    }
    this.detectarColisiones();
    this.actualizarSemaforo();
    this.actualizarMetricas();
    if (this.gruasCooldown > 0) this.gruasCooldown--;
    this.removerSalidos();
    if (this.frameCount % HISTORIAL_INTERVALO === 0) {
      this.historialEspera.push(this.metricas.esperaTotal);
      if (this.historialEspera.length > HISTORIAL_PUNTOS) {
        this.historialEspera.shift();
      }
    }
  }

  private rebuildFlujos(): void {
    this.flujos.clear();
    for (const c of this.carros) {
      if (c.estado === "accidentado" || c.estado === "turning") continue;
      let dir: Direccion;
      let carril: 0 | 1;
      if (c.estado === "leaving") {
        dir = c.exitDir;
        carril = c.exitLane;
      } else {
        dir = c.direccion;
        carril = c.carril;
      }
      const key = `${dir}-${carril}`;
      let arr = this.flujos.get(key);
      if (!arr) { arr = []; this.flujos.set(key, arr); }
      arr.push(c);
    }
    for (const arr of this.flujos.values()) {
      arr.sort((a, b) => b.pos - a.pos);
    }
  }

  private spawnCheck(): void {
    for (const dir of DIRECCIONES) {
      if (this.staggerTimers[dir] > 0) {
        this.staggerTimers[dir]--;
        continue;
      }
      const rate = esHorizontal(dir) ? this.params.spawnH : this.params.spawnV;
      if (Math.random() < rate) {
        this.crearVehiculo(dir);
        this.staggerTimers[dir] = 2 + Math.floor(Math.random() * 6);
      }
    }
  }

  private crearVehiculo(direccion: Direccion): Carro | null {
    const giro = this.elegirGiro();
    let carril: 0 | 1;
    if (giro === "izquierda") carril = 0;
    else if (giro === "derecha") carril = 1;
    else carril = Math.random() < 0.5 ? 0 : 1;

    const spawn = spawnPoint(direccion, carril);
    for (const c of this.carros) {
      if (c.direccion !== direccion || c.carril !== carril) continue;
      if (c.estado === "accidentado" || c.estado === "turning") continue;
      const d = distancia(c.x, c.y, spawn.x, spawn.y);
      if (d < 35 + LARGO_AUTO) return null;
    }

    const carro = new Carro(
      this.nextId++,
      direccion,
      carril,
      giro,
      this.params.promReaccion,
      IDM.maxVel,
    );
    this.carros.push(carro);
    return carro;
  }

  private elegirGiro(): "recto" | "izquierda" | "derecha" {
    const r = Math.random();
    if (r < this.params.turnProb) {
      if (this.params.permitirGiroIzquierda) {
        return Math.random() < 0.5 ? "izquierda" : "derecha";
      }
      return "derecha";
    }
    return "recto";
  }

  private actualizarVehiculo(c: Carro, dt: number): void {
    if (c.accidentado) {
      c.estado = "accidentado";
      c.velocidad = 0;
      return;
    }

    if (Math.random() < this.params.imprudencia * 0.001 && c.distraido === 0) {
      c.distraido = DISTRACCION_DURACION;
    }
    if (c.distraido > 0) {
      c.distraido--;
      c.gapPercibidoMult = 1.5;
      c.timerReaccion = c.latenciaReaccion;
    } else {
      c.gapPercibidoMult = 1;
    }

    if (c.timerReaccion > 0) c.timerReaccion--;

    switch (c.estado) {
      case "approaching": this.stepApproaching(c, dt); break;
      case "waiting": this.stepWaiting(c, dt); break;
      case "turning": this.stepTurning(c, dt); break;
      case "crossing": this.stepCrossing(c, dt); break;
      case "leaving": this.stepLeaving(c, dt); break;
      case "accidentado": break;
    }
  }

  private stepApproaching(c: Carro, dt: number): void {
    const { gap, velLider, liderId } = this.buscarLider(c);
    c.liderId = liderId;
    c.gap = gap;

    let gapEf = gap;
    let velLiderEf = velLider;
    if (c.pos >= STOP_POS - AMARILLO_DECEL_UMBRAL) {
      const sInfo = this.evaluarSemaforo(c);
      if (sInfo.debeDetenerse) {
        const gapStop = (STOP_POS - c.pos) * c.gapPercibidoMult;
        if (gapStop < gapEf) {
          gapEf = gapStop;
          velLiderEf = 0;
        }
      }
    }

    const a = this.calcAceleracion(c, gapEf, velLiderEf);
    c.velocidad = Math.max(0, c.velocidad + a * dt);
    this.aplicarHardStop(c);
    c.pos += c.velocidad * dt;

    if (c.pos >= STOP_POS) {
      const sInfo = this.evaluarSemaforo(c);
      if (sInfo.debeDetenerse && !sInfo.dilema) {
        c.pos = STOP_POS;
        c.estado = "waiting";
        c.velocidad = 0;
        return;
      }
      if (c.giro === "recto") {
        c.estado = "crossing";
      } else {
        if (c.giro === "izquierda" && this.hayConflictoInterseccion(c)) {
          c.pos = STOP_POS;
          c.estado = "waiting";
          c.velocidad = 0;
          return;
        }
        c.estado = "turning";
        c.pos = STOP_POS;
        if (c.giro === "izquierda") c.prioridadGiro = Math.random() < 0.5;
      }
    }
    this.actualizarXYRecto(c);
  }

  private stepWaiting(c: Carro, dt: number): void {
    c.tiempoEspera += dt;
    c.velocidad = 0;
    c.pos = STOP_POS;
    const sInfo = this.evaluarSemaforo(c);
    if (sInfo.puedePasar) {
      if (c.giro === "izquierda" && this.hayConflictoInterseccion(c)) return;
      if (c.giro === "recto") {
        c.estado = "crossing";
      } else {
        c.estado = "turning";
        if (c.giro === "izquierda") c.prioridadGiro = Math.random() < 0.5;
      }
    }
    this.actualizarXYRecto(c);
  }

  private stepTurning(c: Carro, dt: number): void {
    const idx = c.pathId as number;
    if (idx < 0) { c.estado = "leaving"; return; }
    const largo = LARGO_CURVAS[idx];
    const t = (c.pos - STOP_POS) / largo;
    if (t >= 1) {
      c.pos = c.leaveStartPos;
      c.estado = "leaving";
      c.angulo = Math.atan2(c.exitVec.y, c.exitVec.x);
      c.ultimoAngulo = c.angulo;
      this.actualizarXYLeaving(c);
      return;
    }
    const { gap, velLider, liderId, esCruzado } = this.buscarLiderCruzado(c);
    c.liderId = liderId;
    c.gap = gap;
    c.gapCruzado = gap;
    const a = this.calcAceleracion(c, gap, velLider);
    c.velocidad = Math.max(0, c.velocidad + a * dt);
    c.pos += c.velocidad * dt;
    const tt = clamp((c.pos - STOP_POS) / largo, 0, 1);
    const s = c.sampleCurve(tt);
    c.x = s.pos.x;
    c.y = s.pos.y;
    c.angulo = s.ang;
    c.ultimoAngulo = s.ang;
    void esCruzado;
  }

  private stepCrossing(c: Carro, dt: number): void {
    const { gap, velLider, liderId } = this.buscarLider(c);
    c.liderId = liderId;
    c.gap = gap;
    const a = this.calcAceleracion(c, gap, velLider);
    c.velocidad = Math.max(0, c.velocidad + a * dt);
    c.pos += c.velocidad * dt;
    if (c.pos >= BOX_EXIT_POS) {
      c.estado = "leaving";
      c.pos = BOX_EXIT_POS;
    }
    this.actualizarXYRecto(c);
  }

  private stepLeaving(c: Carro, dt: number): void {
    const { gap, velLider, liderId } = this.buscarLider(c);
    c.liderId = liderId;
    c.gap = gap;
    const a = this.calcAceleracion(c, gap, velLider);
    c.velocidad = Math.max(0, c.velocidad + a * dt);
    c.pos += c.velocidad * dt;
    this.actualizarXYLeaving(c);
    if (c.pos >= CANVAS_W) {
      c.estado = "leaving";
    }
  }

  private actualizarXYRecto(c: Carro): void {
    const coord = laneCoordFor(c.direccion, c.carril);
    const p = xyFromPos(c.pos, c.direccion, coord);
    c.x = p.x;
    c.y = p.y;
    const v = vectorDir(c.direccion);
    c.angulo = Math.atan2(v.y, v.x);
    if (!c.accidentado) c.ultimoAngulo = c.angulo;
  }

  private actualizarXYLeaving(c: Carro): void {
    const coord = laneCoordFor(c.exitDir, c.exitLane);
    const p = xyFromPos(c.pos, c.exitDir, coord);
    c.x = p.x;
    c.y = p.y;
    c.angulo = Math.atan2(c.exitVec.y, c.exitVec.x);
    if (!c.accidentado) c.ultimoAngulo = c.angulo;
  }

  private buscarLider(c: Carro): { gap: number; velLider: number; liderId: number | null } {
    let dir: Direccion;
    let carril: 0 | 1;
    if (c.estado === "leaving") {
      dir = c.exitDir;
      carril = c.exitLane;
    } else {
      dir = c.direccion;
      carril = c.carril;
    }
    const arr = this.flujos.get(`${dir}-${carril}`);
    if (!arr) return { gap: Infinity, velLider: 0, liderId: null };
    let idx = -1;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].id === c.id) { idx = i; break; }
    }
    if (idx <= 0) return { gap: Infinity, velLider: 0, liderId: null };
    const lider = arr[idx - 1];
    const gap = (lider.pos - c.pos) - LARGO_AUTO;
    return { gap: Math.max(0, gap), velLider: lider.velocidad, liderId: lider.id };
  }

  private buscarLiderCruzado(c: Carro): { gap: number; velLider: number; liderId: number | null; esCruzado: boolean } {
    const vecinos = this.grid.queryVecinos(c.x, c.y, 80);
    const v = vectorDir(c.direccion);
    let mejorGap = Infinity;
    let mejorLider: Carro | null = null;
    for (const id of vecinos) {
      if (id === c.id) continue;
      const otro = this.carros.find((x) => x.id === id);
      if (!otro || otro.accidentado) continue;
      if (otro.direccion === c.direccion) continue;
      const dx = otro.x - c.x;
      const dy = otro.y - c.y;
      const proj = dx * v.x + dy * v.y;
      if (proj <= 0) continue;
      const d = distancia(c.x, c.y, otro.x, otro.y);
      const gap = d - LARGO_AUTO;
      if (proj < 80 && gap < mejorGap) {
        mejorGap = gap;
        mejorLider = otro;
      }
    }
    return {
      gap: Math.max(0, mejorGap),
      velLider: mejorLider ? mejorLider.velocidad : 0,
      liderId: mejorLider ? mejorLider.id : null,
      esCruzado: mejorLider !== null,
    };
  }

  private calcAceleracion(c: Carro, gap: number, velLider: number): number {
    const v = c.velocidad;
    const vmax = c.velocidadMaximaIndividual;
    const aFree = IDM.aMax * (1 - Math.pow(v / vmax, IDM.delta));
    if (!isFinite(gap) || gap > 999) return aFree;
    const s = Math.max(1, gap * c.gapPercibidoMult);
    const dv = v - velLider;
    const sStar = IDM.gapMin + Math.max(0, v * IDM.tiempoCabeza + (v * dv) / (2 * Math.sqrt(IDM.aMax * IDM.bDecel)));
    const aInt = IDM.aMax * Math.pow(sStar / s, 2);
    let a = aFree - aInt;

    if (gap < IDM.gapMin * 1.5) {
      const pExito = 0.70 + (1 - this.params.imprudencia) * 0.30;
      if (Math.random() < pExito) {
        a = Math.min(a, EMERGENCIA_ACCEL);
      }
    }
    return clamp(a, FRENO_NORMAL, IDM.aMax);
  }

  private aplicarHardStop(c: Carro): void {
    const vecinos = this.grid.queryVecinos(c.x, c.y, LARGO_AUTO * 2);
    for (const id of vecinos) {
      if (id === c.id) continue;
      const otro = this.carros.find((x) => x.id === id);
      if (!otro) continue;
      const d = distancia(c.x, c.y, otro.x, otro.y);
      const umbral = otro.accidentado ? HARD_STOP_ACCIDENTADO : HARD_STOP_MOVIL;
      if (d < umbral + LARGO_AUTO) {
        c.velocidad = 0;
      }
    }
  }

  private evaluarSemaforo(c: Carro): { debeDetenerse: boolean; puedePasar: boolean; dilema: boolean } {
    const horiz = esHorizontal(c.direccion);
    const verde = horiz ? this.fase === 0 : this.fase === 2;
    const amarillo = horiz ? this.fase === 1 : this.fase === 3;
    const rojo = !verde && !amarillo;
    let debeDetenerse = rojo || amarillo;
    let dilema = false;
    if (amarillo) {
      const distStop = STOP_POS - c.pos;
      if (distStop < DILEMA_DIST && c.velocidad > DILEMA_VEL && !c.correLuzDecidido) {
        dilema = true;
        debeDetenerse = false;
      }
      if (c.correLuzDecidido) {
        dilema = true;
        debeDetenerse = false;
      }
    }
    if (amarillo && !dilema && c.velocidad > DILEMA_VEL && !c.correLuzDecidido) {
      c.correLuzDecidido = true;
      this.metricas.totalImprudencias++;
    }
    if (rojo && c.velocidad > DILEMA_VEL && !c.correLuzDecidido && c.pos < STOP_POS) {
      c.correLuzDecidido = true;
      this.metricas.totalImprudencias++;
    }
    const puedePasar = verde || dilema;
    return { debeDetenerse, puedePasar, dilema };
  }

  private actualizarSemaforo(): void {
    this.tiempoFase++;
    if (this.fase === 1 || this.fase === 3) {
      if (this.tiempoFase >= AMARILLO_DURACION) {
        const eje = this.fase === 1 ? "H" : "V";
        if (this.hayAutosEnCaja(eje) && this.tiempoFase < AMARILLO_MAX_DURACION) {
          // extender amarillo hasta despejar la caja
        } else {
          this.fase = this.fase === 1 ? 2 : 0;
          this.tiempoFase = 0;
        }
      }
    }
  }

  aplicarAccionSemaforo(accion: AccionMDP): void {
    this.ultimaAccion = accion;
    if (accion !== "cambiar") {
      this.tiempoFase = 0;
      return;
    }
    if (this.fase !== 0 && this.fase !== 2) return;
    const eje = this.fase === 0 ? "H" : "V";
    if (this.hayAutosEnCaja(eje)) {
      this.tiempoFase = 0;
      return;
    }
    if (this.fase === 0) { this.fase = 1; this.tiempoFase = 0; }
    else { this.fase = 3; this.tiempoFase = 0; }
  }

  private hayAutosGirandoEnEje(eje: "H" | "V"): boolean {
    for (const c of this.carros) {
      if (c.estado !== "turning") continue;
      if (eje === "H" && esHorizontal(c.direccion)) return true;
      if (eje === "V" && !esHorizontal(c.direccion)) return true;
    }
    return false;
  }

  private hayAutosEnCaja(eje: "H" | "V"): boolean {
    for (const c of this.carros) {
      if (c.estado !== "crossing" && c.estado !== "turning") continue;
      if (eje === "H" && esHorizontal(c.direccion)) return true;
      if (eje === "V" && !esHorizontal(c.direccion)) return true;
    }
    return false;
  }

  private hayConflictoInterseccion(c: Carro): boolean {
    if (this.frameCount === this.cacheConflictoFrame) return this.cacheConflicto;
    this.cacheConflictoFrame = this.frameCount;
    const oncoming = c.direccion === "E" ? "W" : c.direccion === "W" ? "E" : c.direccion === "N" ? "S" : "N";
    for (const otro of this.carros) {
      if (otro.id === c.id) continue;
      if (otro.accidentado) continue;
      if (otro.direccion !== oncoming) continue;
      if (otro.estado === "approaching" && otro.pos > STOP_POS - 40) {
        this.cacheConflicto = true; return true;
      }
      if (otro.estado === "crossing" || otro.estado === "turning") {
        this.cacheConflicto = true; return true;
      }
    }
    this.cacheConflicto = false;
    return false;
  }

  private detectarColisiones(): void {
    const procesados = new Set<string>();
    for (const c of this.carros) {
      if (c.accidentado) continue;
      const vecinos = this.grid.queryVecinos(c.x, c.y, LARGO_AUTO * 2);
      for (const id of vecinos) {
        if (id <= c.id) continue;
        const key = `${c.id}-${id}`;
        if (procesados.has(key)) continue;
        procesados.add(key);
        const otro = this.carros.find((x) => x.id === id);
        if (!otro || otro.accidentado) continue;
        if (sat(c.obb(), otro.obb(), SAT_MARGEN)) {
          c.accidentado = true;
          otro.accidentado = true;
          c.velocidad = 0;
          otro.velocidad = 0;
          c.estado = "accidentado";
          otro.estado = "accidentado";
          this.metricas.accidentes++;
        }
      }
    }
  }

  private removerSalidos(): void {
    const restantes: Carro[] = [];
    for (const c of this.carros) {
      const edgeDist = distanceToEdge({ x: c.x, y: c.y }, c.exitDir);
      if (c.estado === "leaving" && edgeDist <= 0) {
        this.metricas.autosSalientes++;
        this.metricas.esperaTotal += c.tiempoEspera;
        if (this.metricas.autosSalientes > 0) {
          this.metricas.esperaPromedio = this.metricas.esperaTotal / this.metricas.autosSalientes;
        }
        continue;
      }
      restantes.push(c);
    }
    this.carros = restantes;
  }

  private actualizarMetricas(): void {
    let cola = 0;
    for (const c of this.carros) {
      if (c.estado === "waiting") cola++;
    }
    if (cola > this.metricas.colaMaxima) this.metricas.colaMaxima = cola;
  }

  removerAccidentado(id: number): boolean {
    if (this.gruasCooldown > 0) return false;
    const idx = this.carros.findIndex((c) => c.id === id && c.accidentado);
    if (idx < 0) return false;
    this.carros.splice(idx, 1);
    this.metricas.totalRemovidosGrua++;
    this.gruasCooldown = GRUA_COOLDOWN;
    return true;
  }

  gruasListo(): boolean { return this.gruasCooldown <= 0; }

  estadoMDP(): EstadoMDP {
    let colaH = 0;
    let colaV = 0;
    let espH = false;
    let espV = false;
    for (const c of this.carros) {
      if (c.estado === "waiting" || (c.estado === "approaching" && c.pos > STOP_POS - 50)) {
        if (esHorizontal(c.direccion)) { colaH++; espH = true; }
        else { colaV++; espV = true; }
      }
    }
    const bh = bucketDeCola(colaH, MAX_COLA_BUCKET);
    const bv = bucketDeCola(colaV, MAX_COLA_BUCKET);
    return { bh, bv, fase: this.fase, eh: espH, ev: espV };
  }

  setUltimoEstadoMDP(e: EstadoMDP, accion: AccionMDP): void {
    this.ultimoEstadoMDP = e;
    this.ultimaAccion = accion;
  }

  get ultimaAccionMDP(): AccionMDP {
    return this.ultimaAccion;
  }

  debeDecidirMDP(): boolean {
    if (this.fase !== 0 && this.fase !== 2) return false;
    return this.tiempoFase >= MDP.T_DECISION;
  }

  getHistorialEspera(): number[] {
    return [...this.historialEspera];
  }

  snapshot(): SnapshotSim {
    const carros: CarroSnapshot[] = this.carros.map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      angulo: c.ultimoAngulo,
      velocidad: c.velocidad,
      estado: c.estado,
      direccion: c.direccion,
      carril: c.carril,
      giro: c.giro,
      accidentado: c.accidentado,
      pathId: c.pathId,
      color: c.color,
    }));
    return {
      carros,
      fase: this.fase,
      tiempoFase: this.tiempoFase,
      metricas: { ...this.metricas },
    };
  }

  snapshotDebug(): DebugSnapshot {
    const obbs = this.carros.map((c) => {
      let colisionando = false;
      const vecinos = this.grid.queryVecinos(c.x, c.y, LARGO_AUTO * 2);
      for (const id of vecinos) {
        if (id === c.id) continue;
        const otro = this.carros.find((x) => x.id === id);
        if (otro && sat(c.obb(), otro.obb(), SAT_MARGEN)) { colisionando = true; break; }
      }
      return { id: c.id, obb: c.obb(), colisionando, accidentado: c.accidentado };
    });

    const paths = this.carros
      .filter((c) => c.estado !== "accidentado" && c.estado !== "leaving")
      .slice(0, 40)
      .map((c) => {
        const puntos: Punto[] = [];
        if (c.pathId >= 0) {
          const cb = CURVAS_BEZIER[c.pathId as number];
          for (let i = 0; i <= 24; i++) {
            const t = i / 24;
            const p = { x: 0, y: 0 } as Punto;
            const u = 1 - t;
            p.x = u*u*u*cb.p0.x + 3*u*u*t*cb.p1.x + 3*u*t*t*cb.p2.x + t*t*t*cb.p3.x;
            p.y = u*u*u*cb.p0.y + 3*u*u*t*cb.p1.y + 3*u*t*t*cb.p2.y + t*t*t*cb.p3.y;
            puntos.push(p);
          }
        }
        return { id: c.id, puntos, color: c.color };
      });

    const lideres = this.carros.map((c) => ({
      id: c.id,
      liderId: c.liderId,
      gap: isFinite(c.gap) ? c.gap : -1,
      esCruzado: c.estado === "turning" && c.gapCruzado < Infinity,
    }));

    const velocidades = this.carros.map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      vx: Math.cos(c.ultimoAngulo) * c.velocidad * 20,
      vy: Math.sin(c.ultimoAngulo) * c.velocidad * 20,
    }));

    const zonasConflicto = [
      { x: CAJA_MIN, y: CAJA_MIN, w: ANCHO_CARRIL * 2, h: ANCHO_CARRIL * 2 },
      { x: CAJA_MAX - ANCHO_CARRIL * 2, y: CAJA_MAX - ANCHO_CARRIL * 2, w: ANCHO_CARRIL * 2, h: ANCHO_CARRIL * 2 },
    ];

    return {
      obbs,
      paths,
      grid: { cell: CELL_SIZE, celdas: this.grid.celdasOcupadas() },
      lideres,
      velocidades,
      zonasConflicto,
      estadoMDP: { ...this.ultimoEstadoMDP, accion: this.ultimaAccion },
    };
  }

  forzarCambioSemaforo(): void {
    if (this.fase === 0) { this.fase = 1; this.tiempoFase = 0; }
    else if (this.fase === 2) { this.fase = 3; this.tiempoFase = 0; }
  }

  stepOnce(): void {
    if (!this.pausado) return;
    this.stepFrame(1);
  }
}
