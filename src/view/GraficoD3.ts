import { select } from "d3";
import type { Selection } from "d3";

const WIDTH = 320;
const HEIGHT = 160;
const MARGIN = { top: 10, right: 10, bottom: 22, left: 36 };

export class GraficoD3 {
  private mount: HTMLElement;
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private path: Selection<SVGPathElement, unknown, null, undefined>;
  private xAxis: Selection<SVGGElement, unknown, null, undefined>;
  private yAxis: Selection<SVGGElement, unknown, null, undefined>;
  private xScale: (i: number) => number;
  private yScale: (v: number) => number;
  private line: (data: number[]) => string;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    const section = document.createElement("div");
    const title = document.createElement("p");
    title.className = "panel-title";
    title.textContent = "Espera acumulada (historial)";
    section.appendChild(title);

    this.svg = select(section).append("svg")
      .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
      .attr("preserveAspectRatio", "none");

    this.xAxis = this.svg.append("g").attr("class", "x axis")
      .attr("transform", `translate(0,${HEIGHT - MARGIN.bottom})`);
    this.yAxis = this.svg.append("g").attr("class", "y axis")
      .attr("transform", `translate(${MARGIN.left},0)`);

    this.svg.append("text")
      .attr("x", 4).attr("y", 14)
      .attr("fill", "#8b949e").attr("font-size", 10).attr("font-family", "monospace")
      .text("frames");

    this.path = this.svg.append("path")
      .attr("fill", "none")
      .attr("stroke", "#58a6ff")
      .attr("stroke-width", 1.5);

    const innerW = WIDTH - MARGIN.left - MARGIN.right;
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
    this.xScale = (i: number) => MARGIN.left + (i / Math.max(1, 49)) * innerW;
    this.yScale = (v: number) => HEIGHT - MARGIN.bottom - v * innerH;
    this.line = (data: number[]) => {
      if (data.length === 0) return "";
      const max = Math.max(1, ...data);
      return data.map((v, i) => {
        const x = this.xScale(i);
        const y = HEIGHT - MARGIN.bottom - (v / max) * innerH;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
    };

    this.mount.appendChild(section);
  }

  update(historial: number[]): void {
    this.path.attr("d", this.line(historial));
    if (historial.length > 0) {
      const max = Math.max(1, ...historial);
      this.yAxis.selectAll("text").data([0, max / 2, max]).enter()
        .append("text");
      this.yAxis.selectAll("text")
        .data([0, max / 2, max])
        .attr("x", -6)
        .attr("y", (d) => this.yScaleNorm(d, max))
        .attr("dy", "0.32em")
        .attr("text-anchor", "end")
        .attr("fill", "#8b949e")
        .attr("font-size", 9)
        .attr("font-family", "monospace")
        .text((d) => d.toFixed(0));
    }
    void this.xAxis;
  }

  private yScaleNorm(v: number, max: number): number {
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
    return HEIGHT - MARGIN.bottom - (v / max) * innerH;
  }
}
