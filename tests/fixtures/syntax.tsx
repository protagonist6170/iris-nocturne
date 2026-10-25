export type Run = {
  id: string;
  name: string;
  latencyMs: number;
  status: "running" | "complete";
};

export function formatRun(run: Run, precision: number = 2): string {
  const latency = run.latencyMs.toFixed(precision);
  return `${run.name}: ${latency} ms`;
}

export function RunCard({run}: {run: Run}) {
  const isComplete = run.status === "complete";
  return <article data-complete={isComplete}>
    <h2>{run.name}</h2>
    <p>{formatRun(run)}</p>
  </article>;
}
