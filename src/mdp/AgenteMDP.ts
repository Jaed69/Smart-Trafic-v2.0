import {
  type AccionMDP,
  type FaseSemaforo,
  type EstadoMDP,
  MDP,
} from "../types";

type GF = 0 | 1;

const N = MDP.N_BUCKETS;
const ACCIONES: AccionMDP[] = ["mantener", "cambiar"];

function gfDeFase(fase: FaseSemaforo): GF | null {
  if (fase === 0) return 0;
  if (fase === 2) return 1;
  return null;
}

function stateKey(bh: number, bv: number, gf: GF, eh: boolean, ev: boolean): number {
  const e = eh ? 1 : 0;
  const v = ev ? 1 : 0;
  return ((bh * N + bv) * 2 + gf) * 4 + e * 2 + v;
}

function reward(
  bh: number,
  bv: number,
  gf: GF,
  accion: AccionMDP,
): { recompensa: number; cambio: number; accidente: number } {
  const espera = bh + bv;
  const cambio = accion === "cambiar" ? 1 : 0;
  let accidente = 0;
  if (accion === "cambiar") {
    if (gf === 0 && bh >= N - 2) accidente = 1;
    if (gf === 1 && bv >= N - 2) accidente = 1;
  }
  const recompensa =
    -(MDP.PENALIZACION_ESPERA * espera +
      MDP.COSTO_CAMBIO * cambio +
      MDP.PENALIZACION_ACCIDENTE * accidente);
  return { recompensa, cambio, accidente };
}

function nextBuckets(
  bh: number,
  bv: number,
  gfNext: GF,
): { bh: number; bv: number } {
  let nbh = bh;
  let nbv = bv;
  if (gfNext === 0) {
    nbh = Math.max(0, bh - 1);
    nbv = Math.min(N - 1, bv + 1);
  } else {
    nbv = Math.max(0, bv - 1);
    nbh = Math.min(N - 1, bh + 1);
  }
  return { bh: nbh, bv: nbv };
}

function nextGF(gf: GF, accion: AccionMDP): GF {
  if (accion === "cambiar") return gf === 0 ? 1 : 0;
  return gf;
}

function nextEhEv(bh: number, bv: number): { eh: boolean; ev: boolean } {
  return { eh: bh >= Math.floor(N / 2), ev: bv >= Math.floor(N / 2) };
}

export interface PoliticaMDP {
  politica: Map<number, AccionMDP>;
  valores: Map<number, number>;
  iteraciones: number;
  tiempoMs: number;
}

export function estadoToKey(estado: EstadoMDP): number | null {
  const gf = gfDeFase(estado.fase);
  if (gf === null) return null;
  return stateKey(estado.bh, estado.bv, gf, estado.eh, estado.ev);
}

export function calcularPolitica(): PoliticaMDP {
  const inicio = performance.now();
  const total = N * N * 2 * 2 * 2;
  const V = new Float64Array(total);
  const Vn = new Float64Array(total);
  const politica = new Map<number, AccionMDP>();
  let iter = 0;
  const maxIter = 500;
  const tol = 1e-3;
  let delta = Infinity;

  while (iter < maxIter && delta > tol) {
    delta = 0;
    for (let k = 0; k < total; k++) {
      const e = (k % 4);
      const ev = (e % 2) === 1;
      const eh = (e >= 2);
      const rest = Math.floor(k / 4);
      const gf: GF = (rest % 2) as GF;
      const rest2 = Math.floor(rest / 2);
      const bv = rest2 % N;
      const bh = Math.floor(rest2 / N);

      let mejor = -Infinity;
      let mejorAccion: AccionMDP = "mantener";
      for (const a of ACCIONES) {
        const r = reward(bh, bv, gf, a).recompensa;
        const gfNext = nextGF(gf, a);
        const { bh: nbh, bv: nbv } = nextBuckets(bh, bv, gfNext);
        const { eh: neh, ev: nev } = nextEhEv(nbh, nbv);
        const kNext = stateKey(nbh, nbv, gfNext, neh, nev);
        const val = r + MDP.GAMMA * V[kNext];
        if (val > mejor) {
          mejor = val;
          mejorAccion = a;
        }
      }
      Vn[k] = mejor;
      const d = Math.abs(Vn[k] - V[k]);
      if (d > delta) delta = d;
    }
    V.set(Vn);
    iter++;
  }

  for (let k = 0; k < total; k++) {
    const e = k % 4;
    const ev = e % 2 === 1;
    const eh = e >= 2;
    const rest = Math.floor(k / 4);
    const gf: GF = (rest % 2) as GF;
    const rest2 = Math.floor(rest / 2);
    const bv = rest2 % N;
    const bh = Math.floor(rest2 / N);

    let mejor = -Infinity;
    let mejorAccion: AccionMDP = "mantener";
    for (const a of ACCIONES) {
      const r = reward(bh, bv, gf, a).recompensa;
      const gfNext = nextGF(gf, a);
      const { bh: nbh, bv: nbv } = nextBuckets(bh, bv, gfNext);
      const { eh: neh, ev: nev } = nextEhEv(nbh, nbv);
      const kNext = stateKey(nbh, nbv, gfNext, neh, nev);
      const val = r + MDP.GAMMA * V[kNext];
      if (val > mejor) {
        mejor = val;
        mejorAccion = a;
      }
    }
    politica.set(k, mejorAccion);
  }

  const valores = new Map<number, number>();
  for (let k = 0; k < total; k++) valores.set(k, V[k]);

  return { politica, valores, iteraciones: iter, tiempoMs: performance.now() - inicio };
}

export class AgenteMDP {
  private politica: Map<number, AccionMDP> = new Map();
  private valores: Map<number, number> = new Map();
  private ultimaIteraciones = 0;
  private ultimoTiempoMs = 0;
  private calculada = false;

  calcular(): PoliticaMDP {
    const p = calcularPolitica();
    this.politica = p.politica;
    this.valores = p.valores;
    this.ultimaIteraciones = p.iteraciones;
    this.ultimoTiempoMs = p.tiempoMs;
    this.calculada = true;
    return p;
  }

  accionPara(estado: EstadoMDP): AccionMDP {
    if (!this.calculada) this.calcular();
    const gf = gfDeFase(estado.fase);
    if (gf === null) return "mantener";
    const k = stateKey(estado.bh, estado.bv, gf, estado.eh, estado.ev);
    return this.politica.get(k) ?? "mantener";
  }

  valorPara(estado: EstadoMDP): number {
    const gf = gfDeFase(estado.fase);
    if (gf === null) return 0;
    const k = stateKey(estado.bh, estado.bv, gf, estado.eh, estado.ev);
    return this.valores.get(k) ?? 0;
  }

  get calculado(): boolean { return this.calculada; }
  get iteraciones(): number { return this.ultimaIteraciones; }
  get tiempoMs(): number { return this.ultimoTiempoMs; }

  politicaRecord(): Record<number, AccionMDP> {
    const out: Record<number, AccionMDP> = {};
    for (const [k, v] of this.politica) out[k] = v;
    return out;
  }

  valoresRecord(): Record<number, number> {
    const out: Record<number, number> = {};
    for (const [k, v] of this.valores) out[k] = v;
    return out;
  }
}

export function heuristicaAccion(estado: EstadoMDP): AccionMDP {
  const gf = gfDeFase(estado.fase);
  if (gf === null) return "mantener";
  const colaVerde = gf === 0 ? estado.bh : estado.bv;
  const colaRojo = gf === 0 ? estado.bv : estado.bh;
  return colaRojo > colaVerde + 3 ? "cambiar" : "mantener";
}

export function bucketDeCola(cola: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(N - 1, Math.floor((cola / max) * N));
}

export type { GF };
