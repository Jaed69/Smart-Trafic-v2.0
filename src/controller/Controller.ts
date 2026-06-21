import {
  type SimParams,
  type RespuestaMDP,
  type EstadoMDP,
  type AccionMDP,
  type CapasDebug,
  type DebugSnapshotFull,
  DEFAULT_PARAMS,
  CAPAS_DEBUG_DEFAULT,
  MDP,
} from "../types";
import { SimuladorModel } from "../model/SimuladorModel";
import { RenderPixi } from "../view/RenderPixi";
import { DebugOverlay } from "../view/DebugOverlay";
import { Dashboard } from "../view/Dashboard";
import { GraficoD3 } from "../view/GraficoD3";
import { debounce } from "../utils/debounce";
import { heuristicaAccion } from "../mdp/AgenteMDP";

interface ReqMensaje {
  type: "calcular";
  params: SimParams;
  estado: EstadoMDP;
  usarHeuristica: boolean;
}

export class Controller {
  private model: SimuladorModel;
  private render: RenderPixi;
  private debug: DebugOverlay;
  private dashboard: Dashboard;
  private grafico: GraficoD3;
  private worker: Worker;
  private rafId = 0;
  private decisionPendiente = false;
  private overlayEl: HTMLElement;
  private debugActivo = false;
  private capas: CapasDebug = { ...CAPAS_DEBUG_DEFAULT };
  private velocidad = 1;
  private ultimaAccion: AccionMDP = "mantener";
  private fpsContador = 0;
  private fpsTimer = 0;
  private fpsActual = 0;
  private lastGraficoUpdate = 0;

  constructor() {
    this.model = new SimuladorModel({ ...DEFAULT_PARAMS });
    this.overlayEl = document.getElementById("recalculando-overlay") as HTMLElement;

    this.render = new RenderPixi({ onGruaClick: (id) => this.onGruaClick(id) });
    this.dashboard = new Dashboard(document.getElementById("dashboard") as HTMLElement);
    this.grafico = new GraficoD3(document.getElementById("grafico") as HTMLElement);

    this.worker = new Worker(new URL("../mdp/mdp.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<RespuestaMDP>) => this.onWorkerRespuesta(e.data);

    this.debug = new DebugOverlay(this.render.app.stage);
  }

  async init(): Promise<void> {
    await this.render.init(document.getElementById("stage") as HTMLElement);
    this.construirControles();
    this.recalcMDPDebounced();
    this.loop();
  }

  private construirControles(): void {
    const mount = document.getElementById("controls") as HTMLElement;
    mount.innerHTML = "";

    const seccion = document.createElement("div");
    const title = document.createElement("p");
    title.className = "panel-title";
    title.textContent = "Controles";
    seccion.appendChild(title);

    this.addSlider(seccion, "spawnH", "Spawn H", this.model.params.spawnH, 0, 0.2, 0.005, (v) => { this.model.setParams({ spawnH: v }); this.recalcMDPDebounced(); });
    this.addSlider(seccion, "spawnV", "Spawn V", this.model.params.spawnV, 0, 0.2, 0.005, (v) => { this.model.setParams({ spawnV: v }); this.recalcMDPDebounced(); });
    this.addSlider(seccion, "turnProb", "Prob. giro", this.model.params.turnProb, 0, 1, 0.05, (v) => { this.model.setParams({ turnProb: v }); });
    this.addSlider(seccion, "promReaccion", "Reacción", this.model.params.promReaccion, 0.2, 2, 0.05, (v) => { this.model.setParams({ promReaccion: v }); });
    this.addSlider(seccion, "friccion", "Fricción", this.model.params.friccion, 0, 0.5, 0.01, (v) => { this.model.setParams({ friccion: v }); });
    this.addSlider(seccion, "imprudencia", "Imprudencia", this.model.params.imprudencia, 0, 1, 0.01, (v) => { this.model.setParams({ imprudencia: v }); this.recalcMDPDebounced(); });

    this.addCheck(seccion, "Permitir giro izq.", this.model.params.permitirGiroIzquierda, (v) => { this.model.setParams({ permitirGiroIzquierda: v }); });

    const modoRow = document.createElement("div");
    modoRow.className = "ctrl-row buttons";
    const btnMdp = document.createElement("button");
    btnMdp.textContent = "MDP";
    btnMdp.className = this.model.params.isMDPMode ? "active" : "";
    const btnHeur = document.createElement("button");
    btnHeur.textContent = "Heurística";
    btnHeur.className = this.model.params.isMDPMode ? "" : "active";
    btnMdp.onclick = () => {
      this.model.setParams({ isMDPMode: true });
      btnMdp.className = "active";
      btnHeur.className = "";
      this.recalcMDPDebounced();
    };
    btnHeur.onclick = () => {
      this.model.setParams({ isMDPMode: false });
      btnMdp.className = "";
      btnHeur.className = "active";
    };
    modoRow.appendChild(document.createTextNode("Modo: "));
    modoRow.appendChild(btnMdp);
    modoRow.appendChild(btnHeur);
    seccion.appendChild(modoRow);

    const velRow = document.createElement("div");
    velRow.className = "ctrl-row buttons";
    velRow.appendChild(document.createTextNode("Vel: "));
    const velBtns: HTMLElement[] = [];
    for (const v of [0.5, 1, 2, 5]) {
      const b = document.createElement("button");
      b.textContent = `${v}x`;
      if (v === 1) b.className = "active";
      b.onclick = () => {
        this.velocidad = v;
        this.model.setVelocidadSim(v);
        for (const x of velBtns) x.className = "";
        b.className = "active";
      };
      velBtns.push(b);
      velRow.appendChild(b);
    }
    seccion.appendChild(velRow);

    const accRow = document.createElement("div");
    accRow.className = "ctrl-row buttons";
    const btnPausa = this.addButton(accRow, "Pausar", () => {
      const pausa = !this.model.pausadoState;
      this.model.setPausado(pausa);
      btnPausa.textContent = pausa ? "Reanudar" : "Pausar";
      btnPausa.className = pausa ? "active" : "";
    });
    this.addButton(accRow, "Step", () => { this.model.stepOnce(); });
    this.addButton(accRow, "Reiniciar", () => { this.model.reset(); this.recalcMDPDebounced(); });
    this.addButton(accRow, "Forzar semáforo", () => { this.model.forzarCambioSemaforo(); });
    this.addButton(accRow, "Reset métricas", () => { this.model.resetMetricas(); });
    void btnPausa;
    seccion.appendChild(accRow);

    mount.appendChild(seccion);

    const dbgSec = document.createElement("div");
    const dbgTitle = document.createElement("p");
    dbgTitle.className = "panel-title";
    dbgTitle.textContent = "Debug / Preview";
    dbgSec.appendChild(dbgTitle);

    const dbgMaster = document.createElement("div");
    dbgMaster.className = "ctrl-row check";
    const mLabel = document.createElement("label");
    const mCheck = document.createElement("input");
    mCheck.type = "checkbox";
    mCheck.checked = false;
    mCheck.onchange = () => {
      this.debugActivo = mCheck.checked;
      if (!this.debugActivo) {
        const vacio: CapasDebug = { ...CAPAS_DEBUG_DEFAULT };
        this.debug.setCapas(vacio);
      } else {
        this.debug.setCapas(this.capas);
      }
    };
    mLabel.appendChild(mCheck);
    mLabel.appendChild(document.createTextNode("Activar debug"));
    dbgMaster.appendChild(mLabel);
    dbgSec.appendChild(dbgMaster);

    const layers = document.createElement("div");
    layers.className = "debug-layers";
    const caps: Array<[keyof CapasDebug, string]> = [
      ["rutas", "Rutas/Bézier"],
      ["obb", "Cajas OBB"],
      ["trayectoria", "Trayectoria"],
      ["grid", "SpatialGrid"],
      ["parada", "Parada + conflicto"],
      ["velocidad", "Vectores vel."],
      ["gap", "Gap + líder"],
      ["semaforo", "Semáforo/MDP"],
    ];
    for (const [key, label] of caps) {
      const lbl = document.createElement("label");
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = this.capas[key];
      chk.onchange = () => {
        this.capas[key] = chk.checked;
        if (this.debugActivo) this.debug.setCapas(this.capas);
      };
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(label));
      layers.appendChild(lbl);
    }
    dbgSec.appendChild(layers);
    mount.appendChild(dbgSec);
  }

  private addSlider(
    parent: HTMLElement,
    key: string,
    label: string,
    ini: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
  ): void {
    const row = document.createElement("div");
    row.className = "ctrl-row";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(ini);
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = this.fmt(ini, step);
    input.oninput = () => {
      const v = parseFloat(input.value);
      val.textContent = this.fmt(v, step);
      onChange(v);
    };
    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(val);
    parent.appendChild(row);
  }

  private fmt(v: number, step: number): string {
    const dec = step < 0.01 ? 3 : step < 0.1 ? 2 : 1;
    return v.toFixed(dec);
  }

  private addCheck(parent: HTMLElement, label: string, ini: boolean, onChange: (v: boolean) => void): void {
    const row = document.createElement("div");
    row.className = "ctrl-row check";
    const lbl = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = ini;
    input.onchange = () => onChange(input.checked);
    lbl.appendChild(input);
    lbl.appendChild(document.createTextNode(label));
    row.appendChild(lbl);
    parent.appendChild(row);
  }

  private addButton(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = onClick;
    parent.appendChild(b);
    return b;
  }

  private recalcMDPDebounced = debounce(() => {
    if (!this.model.params.isMDPMode) return;
    this.mostrarOverlay(true);
    const estado = this.model.estadoMDP();
    const req: ReqMensaje = {
      type: "calcular",
      params: { ...this.model.params },
      estado,
      usarHeuristica: false,
    };
    this.worker.postMessage(req);
  }, 250);

  private onWorkerRespuesta(resp: RespuestaMDP): void {
    if (this.decisionPendiente) {
      this.decisionPendiente = false;
      this.model.aplicarAccionSemaforo(resp.accion);
      const estado = this.model.estadoMDP();
      this.model.setUltimoEstadoMDP(estado, resp.accion);
    }
    this.ultimaAccion = resp.accion;
    this.mostrarOverlay(false);
  }

  private mostrarOverlay(show: boolean): void {
    if (show) this.overlayEl.classList.remove("hidden");
    else this.overlayEl.classList.add("hidden");
  }

  private onGruaClick(id: number): void {
    if (!this.model.gruasListo()) return;
    const ok = this.model.removerAccidentado(id);
    if (ok) {
      this.render.highlightAccidentado(id);
      setTimeout(() => this.render.clearGruaHighlight(), 300);
    }
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    this.fpsContador++;
    this.fpsTimer++;
    if (this.fpsTimer >= 60) {
      this.fpsActual = this.fpsContador;
      this.fpsContador = 0;
      this.fpsTimer = 0;
    }

    this.model.step();

    if (this.model.params.isMDPMode && this.model.debeDecidirMDP() && !this.decisionPendiente) {
      this.decisionPendiente = true;
      this.mostrarOverlay(true);
      const estado = this.model.estadoMDP();
      const req: ReqMensaje = {
        type: "calcular",
        params: { ...this.model.params },
        estado,
        usarHeuristica: false,
      };
      this.worker.postMessage(req);
    } else if (!this.model.params.isMDPMode && this.model.debeDecidirMDP()) {
      const estado = this.model.estadoMDP();
      const accion: AccionMDP = heuristicaAccion(estado);
      this.model.aplicarAccionSemaforo(accion);
      this.model.setUltimoEstadoMDP(estado, accion);
    }

    const snap = this.model.snapshot();
    this.render.render(snap);

    if (this.debugActivo) {
      const full: DebugSnapshotFull = {
        sim: snap,
        debug: this.model.snapshotDebug(),
      };
      this.debug.render(full.debug, full.sim);
    }

    const estadoMDP = this.model.estadoMDP();
    this.dashboard.update(snap.metricas, estadoMDP, this.ultimaAccionMDP(), snap.fase);

    this.lastGraficoUpdate++;
    if (this.lastGraficoUpdate >= 30) {
      this.lastGraficoUpdate = 0;
      this.grafico.update(this.model.getHistorialEspera());
    }
  };

  private ultimaAccionMDP(): AccionMDP {
    return this.model.ultimaAccionMDP;
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.worker.terminate();
    this.render.destroy();
  }
}

void MDP;
