import {
  type SimParams,
  type EstadoMDP,
  type RespuestaMDP,
  type AccionMDP,
} from "../types";
import { AgenteMDP, calcularPolitica, heuristicaAccion } from "./AgenteMDP";

interface ReqMensaje {
  type: "calcular";
  params: SimParams;
  estado: EstadoMDP;
  usarHeuristica: boolean;
}

const agente = new AgenteMDP();
let cacheParams: SimParams | null = null;

function paramsIgual(a: SimParams, b: SimParams): boolean {
  return (
    a.spawnH === b.spawnH &&
    a.spawnV === b.spawnV &&
    a.turnProb === b.turnProb &&
    a.promReaccion === b.promReaccion &&
    a.friccion === b.friccion &&
    a.imprudencia === b.imprudencia &&
    a.permitirGiroIzquierda === b.permitirGiroIzquierda &&
    a.isMDPMode === b.isMDPMode
  );
}

self.onmessage = (e: MessageEvent<ReqMensaje>) => {
  const { type, params, estado, usarHeuristica } = e.data;
  if (type !== "calcular") return;

  try {
    let accion: AccionMDP;
    let politica: Record<number, AccionMDP> = {};
    let valores: Record<number, number> = {};

    if (usarHeuristica) {
      accion = heuristicaAccion(estado);
    } else {
      if (cacheParams === null || !paramsIgual(cacheParams, params)) {
        const p = agente.calcular();
        politica = serializarPolitica(p.politica);
        valores = serializarValores(p.valores);
        cacheParams = { ...params };
      } else {
        politica = agente.politicaRecord();
        valores = agente.valoresRecord();
      }
      accion = agente.accionPara(estado);
    }

    const resp: RespuestaMDP = {
      accion,
      valores,
      politica,
      tiempoMs: agente.tiempoMs,
    };
    (self as unknown as Worker).postMessage(resp);
  } catch (err) {
    console.error("[mdp.worker] error:", err);
    const resp: RespuestaMDP = {
      accion: "mantener",
      valores: {},
      politica: {},
      tiempoMs: 0,
    };
    (self as unknown as Worker).postMessage(resp);
  }
};

function serializarPolitica(m: Map<number, AccionMDP>): Record<number, AccionMDP> {
  const out: Record<number, AccionMDP> = {};
  for (const [k, v] of m) out[k] = v;
  return out;
}

function serializarValores(m: Map<number, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of m) out[k] = v;
  return out;
}

void calcularPolitica;
