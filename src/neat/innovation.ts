import type { Genome } from './genome';

export class InnovationTracker {
  private conns = new Map<string, number>();
  private splits = new Map<number, number>();
  private nextConn: number;
  private nextNode: number;
  constructor(nIn: number, nOut: number) {
    for (let i = 0; i < nIn; i++) for (let o = 0; o < nOut; o++) this.conns.set(`${i}>${nIn + o}`, i * nOut + o);
    this.nextConn = nIn * nOut;
    this.nextNode = nIn + nOut;
  }
  conn(from: number, to: number): number {
    const k = `${from}>${to}`;
    let v = this.conns.get(k);
    if (v === undefined) { v = this.nextConn++; this.conns.set(k, v); }
    return v;
  }
  /** Node id for splitting connection `connInnov`; a fresh id if `g` already has the shared one. */
  split(connInnov: number, g: Genome): number {
    let id = this.splits.get(connInnov);
    if (id === undefined) { id = this.nextNode++; this.splits.set(connInnov, id); }
    if (g.nodes.some((n) => n.id === id)) id = this.nextNode++;
    return id;
  }
}
