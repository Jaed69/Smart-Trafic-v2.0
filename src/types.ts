// Tipos centrales del simulador Smart Traffic v2.0

export type Direccion = "E" | "W" | "N" | "S";
export type TipoGiro = "recto" | "izquierda" | "derecha";
export type EstadoCarro =
  | "approaching"
  | "waiting"
  | "turning"
  | "crossing"
  | "leaving"
  | "accidentado";
export type FaseSemaforo = 0 | 1 | 2 | 3;
export type AccionMDP = "mantener" | "cambiar";

export const FASE_NAMES: Record<FaseSemaforo, string> = {
  0: "Verde-H",
  1: "Amarillo-H",
  2: "Verde-V",
  3: "Amarillo-V",
};

export interface Punto {
  x: number;
  y: number;
}

export interface CubicBezier {
  p0: Punto;
  p1: Punto;
  p2: Punto;
  p3: Punto;
}

export interface OBB {
  cx: number;
  cy: number;
  angulo: number;
  hx: number;
  hy: number;
}

export interface Path {
  direccion: Direccion;
  carril: 0 | 1;
  giro: TipoGiro;
}

export interface SimParams {
  spawnH: number;
  spawnV: number;
  turnProb: number;
  promReaccion: number;
  friccion: number;
  imprudencia: number;
  permitirGiroIzquierda: boolean;
  isMDPMode: boolean;
}

export interface Metricas {
  autosSalientes: number;
  esperaTotal: number;
  esperaPromedio: number;
  colaMaxima: number;
  accidentes: number;
  totalRemovidosGrua: number;
  totalImprudencias: number;
  totalCambiosDeCarril: number;
}

export interface CarroSnapshot {
  id: number;
  x: number;
  y: number;
  angulo: number;
  velocidad: number;
  estado: EstadoCarro;
  direccion: Direccion;
  carril: 0 | 1;
  giro: TipoGiro;
  accidentado: boolean;
  pathId: number;
  color: number;
}

export interface SnapshotSim {
  carros: CarroSnapshot[];
  fase: FaseSemaforo;
  tiempoFase: number;
  metricas: Metricas;
}

export interface EstadoMDP {
  bh: number;
  bv: number;
  fase: FaseSemaforo;
  eh: boolean;
  ev: boolean;
}

export interface ResultadoMDP {
  politica: Map<number, AccionMDP>;
  valores: Map<number, number>;
}

export interface SolicitudMDP {
  params: SimParams;
  estado: EstadoMDP;
}

export interface RespuestaMDP {
  accion: AccionMDP;
  valores: Record<number, number>;
  politica: Record<number, AccionMDP>;
  tiempoMs: number;
}

export interface OBBDebug {
  id: number;
  obb: OBB;
  colisionando: boolean;
  accidentado: boolean;
}

export interface PathDebug {
  id: number;
  puntos: Punto[];
  color: number;
}

export interface GridDebug {
  cell: number;
  celdas: { ix: number; iy: number; ocupada: boolean }[];
}

export interface LiderDebug {
  id: number;
  liderId: number | null;
  gap: number;
  esCruzado: boolean;
}

export interface VelDebug {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ZonaConflictoDebug {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DebugSnapshot {
  obbs: OBBDebug[];
  paths: PathDebug[];
  grid: GridDebug;
  lideres: LiderDebug[];
  velocidades: VelDebug[];
  zonasConflicto: ZonaConflictoDebug[];
  estadoMDP: EstadoMDP & { accion: AccionMDP };
}

export interface CapasDebug {
  rutas: boolean;
  obb: boolean;
  trayectoria: boolean;
  grid: boolean;
  parada: boolean;
  velocidad: boolean;
  gap: boolean;
  semaforo: boolean;
}

export const CAPAS_DEBUG_DEFAULT: CapasDebug = {
  rutas: false,
  obb: false,
  trayectoria: false,
  grid: false,
  parada: false,
  velocidad: false,
  gap: false,
  semaforo: false,
};

export interface DebugSnapshotFull {
  sim: SnapshotSim;
  debug: DebugSnapshot;
}

export const DEFAULT_PARAMS: SimParams = {
  spawnH: 0.05,
  spawnV: 0.02,
  turnProb: 0.3,
  promReaccion: 0.8,
  friccion: 0.1,
  imprudencia: 0.15,
  permitirGiroIzquierda: true,
  isMDPMode: true,
};

export const DEFAULT_METRICAS: Metricas = {
  autosSalientes: 0,
  esperaTotal: 0,
  esperaPromedio: 0,
  colaMaxima: 0,
  accidentes: 0,
  totalRemovidosGrua: 0,
  totalImprudencias: 0,
  totalCambiosDeCarril: 0,
};

export const ANCHO_CARRIL = 30;
export const ANCHO_CALZADA = 120;
export const CANVAS_W = 800;
export const CANVAS_H = 800;
export const CENTRO = { x: 400, y: 400 } as Punto;
export const CAJA_MIN = 340;
export const CAJA_MAX = 460;
export const LARGO_AUTO = 24;
export const ANCHO_AUTO = 12;
export const CELL_SIZE = 60;
export const SAT_MARGEN = 2;
export const AMARILLO_DURACION = 120;
export const AMARILLO_MAX_DURACION = 360;

export const IDM = {
  aMax: 0.08,
  bDecel: 0.15,
  gapMin: 18,
  tiempoCabeza: 0.8,
  delta: 4,
  maxVel: 2.0,
};

export const MDP = {
  GAMMA: 0.95,
  COSTO_CAMBIO: 6,
  PENALIZACION_ESPERA: 25,
  PENALIZACION_ACCIDENTE: 80,
  T_DECISION: 180,
  N_BUCKETS: 6,
};
