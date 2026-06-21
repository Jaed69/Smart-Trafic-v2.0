export class SpatialGrid {
  private cell: number;
  private cols: number;
  private rows: number;
  private buckets: Map<number, Set<number>>;

  constructor(cell: number, width: number, height: number) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.buckets = new Map();
  }

  clear(): void {
    this.buckets.clear();
  }

  private key(ix: number, iy: number): number {
    return iy * this.cols + ix;
  }

  insert(id: number, x: number, y: number): void {
    const ix = Math.floor(x / this.cell);
    const iy = Math.floor(y / this.cell);
    if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) return;
    const k = this.key(ix, iy);
    let set = this.buckets.get(k);
    if (!set) {
      set = new Set();
      this.buckets.set(k, set);
    }
    set.add(id);
  }

  queryVecinos(x: number, y: number, radio: number): number[] {
    const ix = Math.floor(x / this.cell);
    const iy = Math.floor(y / this.cell);
    const r = Math.ceil(radio / this.cell);
    const out: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = ix + dx;
        const ny = iy + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const set = this.buckets.get(this.key(nx, ny));
        if (set) {
          for (const id of set) out.push(id);
        }
      }
    }
    return out;
  }

  queryCelda(ix: number, iy: number): Set<number> | undefined {
    if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) return undefined;
    return this.buckets.get(this.key(ix, iy));
  }

  celdasOcupadas(): { ix: number; iy: number; ocupada: boolean }[] {
    const out: { ix: number; iy: number; ocupada: boolean }[] = [];
    for (let iy = 0; iy < this.rows; iy++) {
      for (let ix = 0; ix < this.cols; ix++) {
        const set = this.buckets.get(this.key(ix, iy));
        out.push({ ix, iy, ocupada: set !== undefined && set.size > 0 });
      }
    }
    return out;
  }

  get dims(): { cols: number; rows: number; cell: number } {
    return { cols: this.cols, rows: this.rows, cell: this.cell };
  }
}
