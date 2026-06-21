import {
  type Metricas,
  type EstadoMDP,
  type AccionMDP,
  type FaseSemaforo,
  FASE_NAMES,
} from "../types";

interface Fila { key: string; label: string; value: string; }

export class Dashboard {
  private mount: HTMLElement;
  private valores: Record<string, HTMLElement> = {};
  private mdpEl: HTMLElement | null = null;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.construir();
  }

  private construir(): void {
    const section = document.createElement("div");
    const title = document.createElement("p");
    title.className = "panel-title";
    title.textContent = "Métricas en vivo";
    section.appendChild(title);

    const dl = document.createElement("dl");
    const campos: Array<[string, string]> = [
      ["autosSalientes", "Autos salientes"],
      ["esperaTotal", "Espera total (frames)"],
      ["esperaPromedio", "Espera promedio"],
      ["colaMaxima", "Cola máxima"],
      ["accidentes", "Accidentes"],
      ["totalRemovidosGrua", "Removidos por grúa"],
      ["totalImprudencias", "Imprudencias"],
      ["totalCambiosDeCarril", "Cambios de carril"],
    ];
    for (const [key, label] of campos) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = "0";
      dl.appendChild(dt);
      dl.appendChild(dd);
      this.valores[key] = dd;
    }
    section.appendChild(dl);

    this.mdpEl = document.createElement("div");
    this.mdpEl.className = "mdp-state";
    section.appendChild(this.mdpEl);

    this.mount.appendChild(section);
  }

  update(metricas: Metricas, estado: EstadoMDP | null, accion: AccionMDP, fase: FaseSemaforo): void {
    this.valores["autosSalientes"].textContent = String(metricas.autosSalientes);
    this.valores["esperaTotal"].textContent = metricas.esperaTotal.toFixed(0);
    this.valores["esperaPromedio"].textContent = metricas.esperaPromedio.toFixed(2);
    this.valores["colaMaxima"].textContent = String(metricas.colaMaxima);
    this.valores["accidentes"].textContent = String(metricas.accidentes);
    this.valores["totalRemovidosGrua"].textContent = String(metricas.totalRemovidosGrua);
    this.valores["totalImprudencias"].textContent = String(metricas.totalImprudencias);
    this.valores["totalCambiosDeCarril"].textContent = String(metricas.totalCambiosDeCarril);

    if (this.mdpEl) {
      if (estado) {
        this.mdpEl.textContent =
          `Fase: ${FASE_NAMES[fase]} | MDP(bh=${estado.bh}, bv=${estado.bv}, ` +
          `eh=${estado.eh ? 1 : 0}, ev=${estado.ev ? 1 : 0}) → ${accion}`;
      } else {
        this.mdpEl.textContent = `Fase: ${FASE_NAMES[fase]} | MDP sin decidir`;
      }
    }
  }

  filaSnapshot(): Fila[] {
    return [];
  }
}
