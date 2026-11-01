import { useState } from "react";
import {
  Activity, Cpu, Gauge, Code2, LayoutDashboard, MemoryStick,
  FileBarChart, Settings, Play, Clock3, CheckCircle2,
  AlertCircle, Zap, ArrowRight, Layers, SkipBack, SkipForward, Pause,
  Check, ArrowUpRight, Compass, RefreshCw
} from "lucide-react";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from "recharts";

import "./App.css";

type Mode = "row" | "column";
type ActiveTab = "Hardware Lab" | "Microarchitecture Studio" | "ML Locality Advisor" | "Policy Comparison";

type ExperimentResult = {
  mode: Mode;
  median_ms: number;
  minimum_ms: number;
  maximum_ms: number;
  execution_times_ms: number[];
  checksum: number;
  matrix_size: number;
  median_throughput_gb_s: number;
  data_processed_mb: number;
  task_clock_ms: number | null;
  page_faults: number | null;
  perf_status: string;
};

type StepEvent = {
  step: number;
  operation: string;
  address: string;
  raw_address: number;
  tag: string;
  set_index: number;
  offset: string;
  result: "HIT" | "MISS";
  miss_type: string | null;
  way_index: number;
  evicted_address: string | null;
  evicted_tag: string | null;
  dirty: boolean;
  cache_set_snapshot: {
    way: number;
    valid: boolean;
    tag: string;
    block_addr: string;
    dirty: boolean;
  }[];
};

type SimulationResponse = {
  policy: string;
  geometry: {
    capacity_kb: number;
    block_size_bytes: number;
    associativity: number;
    num_sets: number;
    num_lines: number;
    tag_bits: number;
    index_bits: number;
    offset_bits: number;
  };
  summary: {
    total_accesses: number;
    hits: number;
    misses: number;
    hit_rate_pct: number;
    miss_rate_pct: number;
    evictions: number;
    compulsory_misses: number;
    capacity_misses: number;
    conflict_misses: number;
    amat_cycles: number;
    amat_formula: string;
  };
  events_sample: StepEvent[];
};

type AdvisorResponse = {
  workload_features: {
    total_accesses: number;
    unique_blocks: number;
    working_set_footprint_kb: number;
    reuse_ratio: number;
    mean_reuse_distance: number;
    median_reuse_distance: number;
    temporal_locality_score: number;
    sequential_access_ratio: number;
    spatial_locality_score: number;
    normalized_entropy: number;
  };
  policy_benchmarks: Record<string, {
    hits: number;
    misses: number;
    miss_rate_pct: number;
    amat_cycles: number;
    evictions: number;
  }>;
  recommended_policy: string;
  headroom_vs_oracle_pct: number;
  diagnostics: string[];
  actionable_advice: string[];
};

const API = "http://127.0.0.1:8000";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("Hardware Lab");

  // Hardware Lab State
  const [mode, setMode] = useState<Mode>("row");
  const [size, setSize] = useState(2048);
  const [repetitions, setRepetitions] = useState(5);
  const [trials, setTrials] = useState(5);
  const [hwLoading, setHwLoading] = useState(false);
  const [hwError, setHwError] = useState("");
  const [results, setResults] = useState<Partial<Record<Mode, ExperimentResult>>>({});

  // Simulation Studio State
  const [simCapacityKb, setSimCapacityKb] = useState(32);
  const [simBlockSize, setSimBlockSize] = useState(64);
  const [simAssociativity, setSimAssociativity] = useState(8);
  const [simPolicy, setSimPolicy] = useState<"lru" | "fifo" | "lfu" | "clock" | "belady">("lru");
  const [simSourceMode, setSimSourceMode] = useState<Mode>("row");
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState("");
  const [simulationData, setSimulationData] = useState<SimulationResponse | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // ML Advisor State
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorError, setAdvisorError] = useState("");
  const [advisorData, setAdvisorData] = useState<AdvisorResponse | null>(null);

  // 1. Run Native Benchmark
  async function runNativeExperiment(selectedMode: Mode) {
    setHwLoading(true);
    setHwError("");
    setMode(selectedMode);

    try {
      const response = await fetch(`${API}/api/experiments/matrix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: selectedMode, size, repetitions, trials })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Experiment failed.");

      setResults(prev => ({ ...prev, [selectedMode]: data }));
    } catch (err) {
      setHwError(err instanceof Error ? err.message : "Backend unreachable.");
    } finally {
      setHwLoading(false);
    }
  }

  // 2. Run Trace-Driven Cache Simulation
  async function runSimulation() {
    setSimLoading(true);
    setSimError("");
    try {
      const response = await fetch(`${API}/api/simulation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capacity_bytes: simCapacityKb * 1024,
          block_size_bytes: simBlockSize,
          associativity: simAssociativity,
          policy: simPolicy,
          source_mode: simSourceMode
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Simulation failed.");
      setSimulationData(data);
      setCurrentStepIdx(0);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : "Simulation failed.");
    } finally {
      setSimLoading(false);
    }
  }

  // 3. Run ML Locality Advisor
  async function runAdvisor() {
    setAdvisorLoading(true);
    setAdvisorError("");
    try {
      const response = await fetch(`${API}/api/advisor/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capacity_bytes: simCapacityKb * 1024,
          block_size_bytes: simBlockSize,
          associativity: simAssociativity,
          policy: simPolicy,
          source_mode: simSourceMode
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Advisor analysis failed.");
      setAdvisorData(data);
    } catch (err) {
      setAdvisorError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAdvisorLoading(false);
    }
  }

  // Step Playback Handler
  const currentEvent = simulationData?.events_sample?.[currentStepIdx];
  const maxSteps = simulationData?.events_sample?.length || 0;

  const currentResult = results[mode];
  const speedup = (results.column && results.row && results.row.median_ms > 0)
    ? (results.column.median_ms / results.row.median_ms).toFixed(1)
    : null;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Activity size={23} /></div>
          <div>
            <h2>CacheWise</h2>
            <span>HARDWARE & TRACE LAB</span>
          </div>
        </div>

        <div className="nav-label">PLATFORM LABS</div>

        {[
          { name: "Hardware Lab" as ActiveTab, icon: Cpu },
          { name: "Microarchitecture Studio" as ActiveTab, icon: MemoryStick },
          { name: "ML Locality Advisor" as ActiveTab, icon: Compass },
          { name: "Policy Comparison" as ActiveTab, icon: FileBarChart }
        ].map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.name}
              className={`nav-item ${activeTab === item.name ? "active" : ""}`}
              onClick={() => setActiveTab(item.name)}
            >
              <Icon size={18} />
              {item.name}
            </button>
          );
        })}

        <div className="sidebar-bottom">
          <div className="system-status">
            <span className="status-dot" />
            <div>
              <strong>Execution Engine</strong>
              <small>Native C++ / Linux perf</small>
            </div>
          </div>
          <div className="version">CACHEWISE v2.0 · INTEL ARCH LAB</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">CACHEWISE /</span>
            <strong>{activeTab}</strong>
          </div>
          <div className="top-right">
            <span className="live-indicator"><span /> API Connected</span>
            <div className="avatar">CW</div>
          </div>
        </header>

        <div className="page-content">

          {/* TAB 1: HARDWARE LAB */}
          {activeTab === "Hardware Lab" && (
            <>
              <section className="welcome">
                <div>
                  <div className="eyebrow"><Zap size={14} /> NATIVE CPU BENCHMARKING</div>
                  <h1>Measure real <span>hardware memory.</span></h1>
                  <p>Execute real C++ workloads on the CPU and observe the physical memory wall.</p>
                </div>
                <div className="welcome-chip">
                  <Cpu size={17} />
                  <span>x86_64 · Intel Core Ultra</span>
                </div>
              </section>

              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top"><span>ROW-MAJOR THROUGHPUT</span><Activity size={18} /></div>
                  <strong className="stat-green">
                    {results.row ? `${results.row.median_throughput_gb_s.toFixed(2)} GB/s` : "---"}
                  </strong>
                  <small>Sequential spatial bandwidth</small>
                </div>
                <div className="stat-card">
                  <div className="stat-top"><span>COLUMN-MAJOR THROUGHPUT</span><Layers size={18} /></div>
                  <strong>
                    {results.column ? `${results.column.median_throughput_gb_s.toFixed(2)} GB/s` : "---"}
                  </strong>
                  <small>Strided thrashing bandwidth</small>
                </div>
                <div className="stat-card">
                  <div className="stat-top"><span>HARDWARE SPEEDUP</span><Gauge size={18} /></div>
                  <strong className={speedup ? "stat-green" : ""}>
                    {speedup ? `${speedup}× FASTER` : "---"}
                  </strong>
                  <small>Spatial locality advantage</small>
                </div>
                <div className="stat-card">
                  <div className="stat-top"><span>PERF STATUS</span><Activity size={18} /></div>
                  <strong className="stat-green">Active</strong>
                  <small>task-clock & page-faults tracked</small>
                </div>
              </section>

              <section className="workspace-grid">
                <div className="panel config-panel">
                  <div className="panel-heading">
                    <div className="panel-icon"><Code2 size={18} /></div>
                    <div><h3>Benchmark Configuration</h3><p>Configure matrix access pattern</p></div>
                  </div>

                  <label className="field-label">MEMORY TRAVERSAL ORDER</label>
                  <div className="mode-selector">
                    <button
                      className={mode === "row" ? "mode-option selected" : "mode-option"}
                      onClick={() => setMode("row")}
                    >
                      <div className="mode-symbol row-symbol">↔</div>
                      <div><strong>Row Major</strong><small>Sequential (High Locality)</small></div>
                      {mode === "row" && <CheckCircle2 size={17} />}
                    </button>
                    <button
                      className={mode === "column" ? "mode-option selected" : "mode-option"}
                      onClick={() => setMode("column")}
                    >
                      <div className="mode-symbol col-symbol">↕</div>
                      <div><strong>Column Major</strong><small>Strided (Cache Thrashing)</small></div>
                      {mode === "column" && <CheckCircle2 size={17} />}
                    </button>
                  </div>

                  <div className="field">
                    <div className="field-title"><label>Matrix Dimension</label><strong>{size} × {size}</strong></div>
                    <input type="range" min="512" max="4096" step="512" value={size}
                      onChange={e => setSize(Number(e.target.value))} />
                    <div className="range-labels"><span>512 × 512 (1 MB)</span><span>4096 × 4096 (64 MB)</span></div>
                  </div>

                  <div className="two-fields">
                    <div className="field">
                      <label>Repetitions</label>
                      <input type="number" min="1" max="10" value={repetitions}
                        onChange={e => setRepetitions(Math.min(10, Math.max(1, Number(e.target.value))))} />
                    </div>
                    <div className="field">
                      <label>Trials</label>
                      <input type="number" min="3" max="9" value={trials}
                        onChange={e => setTrials(Math.min(9, Math.max(3, Number(e.target.value))))} />
                    </div>
                  </div>

                  <button className="run-button" disabled={hwLoading} onClick={() => runNativeExperiment(mode)}>
                    {hwLoading ? <><span className="spinner" /> Executing on CPU...</> : <><Play size={17} fill="currentColor" /> Run Native Benchmark</>}
                  </button>
                  {hwError && <div className="error-message"><AlertCircle size={16} />{hwError}</div>}
                </div>

                {/* Execution Results */}
                <div className="panel result-panel">
                  <div className="panel-heading">
                    <div className="panel-icon"><Gauge size={18} /></div>
                    <div><h3>Measured Telemetry</h3><p>Real native execution results</p></div>
                  </div>

                  {currentResult ? (
                    <>
                      <div className="result-primary">
                        <span>MEDIAN EXECUTION TIME</span>
                        <div>{currentResult.median_ms.toFixed(3)} <small>ms</small></div>
                        <span className="result-mode">{currentResult.median_throughput_gb_s.toFixed(2)} GB/s Throughput</span>
                      </div>
                      <div className="result-metrics">
                        <div><span>Data Processed</span><strong>{currentResult.data_processed_mb} MB</strong></div>
                        <div><span>Trials</span><strong>{currentResult.execution_times_ms.length}</strong></div>
                        <div><span>Page Faults</span><strong>{currentResult.page_faults ?? "N/A"}</strong></div>
                        <div><span>Task Clock</span><strong>{currentResult.task_clock_ms ? `${currentResult.task_clock_ms.toFixed(2)} ms` : "N/A"}</strong></div>
                      </div>
                      <div className="trial-list">
                        <span>MEASURED TRIALS</span>
                        {currentResult.execution_times_ms.map((time, idx) => (
                          <div key={idx}><span>Trial {idx + 1}</span><strong>{time.toFixed(3)} ms</strong></div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="empty-result">
                      <div className="empty-icon"><Clock3 size={26} /></div>
                      <h3>Awaiting Execution</h3>
                      <p>Click "Run Native Benchmark" to measure real execution time and memory bandwidth on your CPU.</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Lower Charts */}
              <section className="lower-grid">
                <div className="panel chart-panel">
                  <div className="panel-heading">
                    <div className="panel-icon"><Activity size={18} /></div>
                    <div><h3>Throughput Comparison (GB/s)</h3><p>Higher is better</p></div>
                  </div>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={[
                        { name: "Row Major (Sequential)", bandwidth: results.row?.median_throughput_gb_s ?? 0 },
                        { name: "Col Major (Strided)", bandwidth: results.column?.median_throughput_gb_s ?? 0 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#252d3b" vertical={false} />
                        <XAxis dataKey="name" stroke="#8994a7" tickLine={false} axisLine={false} />
                        <YAxis stroke="#8994a7" tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ background: "#151c29", border: "1px solid #303b4c", borderRadius: 10 }} />
                        <Bar dataKey="bandwidth" name="Throughput (GB/s)" radius={[6, 6, 0, 0]}>
                          <Cell fill="#4bdda4" />
                          <Cell fill="#ff7b7b" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="panel visual-panel">
                  <div className="panel-heading">
                    <div className="panel-icon"><MemoryStick size={18} /></div>
                    <div><h3>Spatial Locality Visualizer</h3><p>Matrix memory layout</p></div>
                  </div>
                  <div className="matrix-preview">
                    {Array.from({ length: 64 }, (_, i) => {
                      const row = Math.floor(i / 8);
                      const col = i % 8;
                      const highlighted = mode === "row" ? row === 2 : col === 2;
                      return <div key={i} className={highlighted ? "matrix-cell highlighted" : "matrix-cell"} />;
                    })}
                  </div>
                  <div className="visual-legend">
                    <span><i className="legend-active" /> Active cache line</span>
                    <span><i className="legend-idle" /> Dormant lines</span>
                  </div>
                  <p className="visual-disclaimer">
                    Row-major hits the same 64-byte cache line 16 times in a row. Column-major misses on every single access!
                  </p>
                </div>
              </section>
            </>
          )}

          {/* TAB 2: MICROARCHITECTURE STUDIO */}
          {activeTab === "Microarchitecture Studio" && (
            <>
              <section className="welcome">
                <div>
                  <div className="eyebrow"><MemoryStick size={14} /> TRACE-DRIVEN SIMULATION</div>
                  <h1>Microarchitecture <span>Studio.</span></h1>
                  <p>Replay real 64-bit memory address streams through configurable cache lines and replacement policies.</p>
                </div>
                <button className="welcome-chip" onClick={runSimulation} disabled={simLoading}>
                  <RefreshCw size={15} />
                  <span>{simLoading ? "Simulating..." : "Re-simulate Trace"}</span>
                </button>
              </section>

              {/* Cache Geometry & Controls */}
              <div className="workspace-grid">
                <div className="panel">
                  <div className="panel-heading">
                    <div className="panel-icon"><Settings size={18} /></div>
                    <div><h3>Cache Architecture Parameters</h3><p>Define geometry & replacement policy</p></div>
                  </div>

                  <div className="two-fields">
                    <div className="field">
                      <label>Cache Capacity (KB)</label>
                      <select
                        className="mode-option"
                        style={{ width: "100%", marginTop: "8px" }}
                        value={simCapacityKb}
                        onChange={e => setSimCapacityKb(Number(e.target.value))}
                      >
                        <option value={8}>8 KB</option>
                        <option value={16}>16 KB</option>
                        <option value={32}>32 KB (Standard L1)</option>
                        <option value={64}>64 KB</option>
                        <option value={128}>128 KB</option>
                      </select>
                    </div>

                    <div className="field">
                      <label>Line / Block Size</label>
                      <select
                        className="mode-option"
                        style={{ width: "100%", marginTop: "8px" }}
                        value={simBlockSize}
                        onChange={e => setSimBlockSize(Number(e.target.value))}
                      >
                        <option value={32}>32 Bytes</option>
                        <option value={64}>64 Bytes (x86 Standard)</option>
                        <option value={128}>128 Bytes</option>
                      </select>
                    </div>
                  </div>

                  <div className="two-fields">
                    <div className="field">
                      <label>Associativity</label>
                      <select
                        className="mode-option"
                        style={{ width: "100%", marginTop: "8px" }}
                        value={simAssociativity}
                        onChange={e => setSimAssociativity(Number(e.target.value))}
                      >
                        <option value={1}>1-Way (Direct Mapped)</option>
                        <option value={2}>2-Way Set Associative</option>
                        <option value={4}>4-Way Set Associative</option>
                        <option value={8}>8-Way Set Associative</option>
                      </select>
                    </div>

                    <div className="field">
                      <label>Replacement Policy</label>
                      <select
                        className="mode-option"
                        style={{ width: "100%", marginTop: "8px" }}
                        value={simPolicy}
                        onChange={e => setSimPolicy(e.target.value as any)}
                      >
                        <option value="lru">LRU (Least Recently Used)</option>
                        <option value="fifo">FIFO (First-In, First-Out)</option>
                        <option value="lfu">LFU (Least Frequently Used)</option>
                        <option value="clock">Clock (Second-Chance)</option>
                        <option value="belady">Belady MIN (Optimal Oracle)</option>
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label>Real Workload Source</label>
                    <div className="mode-selector" style={{ marginTop: "8px" }}>
                      <button
                        className={simSourceMode === "row" ? "mode-option selected" : "mode-option"}
                        onClick={() => setSimSourceMode("row")}
                      >
                        <strong>Row Major Trace</strong>
                      </button>
                      <button
                        className={simSourceMode === "column" ? "mode-option selected" : "mode-option"}
                        onClick={() => setSimSourceMode("column")}
                      >
                        <strong>Column Major Trace</strong>
                      </button>
                    </div>
                  </div>

                  <button className="run-button" onClick={runSimulation} disabled={simLoading}>
                    {simLoading ? "Running Simulation..." : "Execute Trace Simulation"}
                  </button>
                  {simError && <div className="error-message"><AlertCircle size={16} />{simError}</div>}
                </div>

                {/* 3C Breakdown & Summary */}
                <div className="panel">
                  <div className="panel-heading">
                    <div className="panel-icon"><Gauge size={18} /></div>
                    <div><h3>3C Miss Breakdown & AMAT</h3><p>Compulsory, capacity, and conflict metrics</p></div>
                  </div>

                  {simulationData ? (
                    <>
                      <div className="three-c-grid">
                        <div className="three-c-card">
                          <span>COMPULSORY</span>
                          <strong>{simulationData.summary.compulsory_misses}</strong>
                          <small>First-time references</small>
                        </div>
                        <div className="three-c-card">
                          <span>CONFLICT</span>
                          <strong style={{ color: "#ffb07b" }}>{simulationData.summary.conflict_misses}</strong>
                          <small>Set contention</small>
                        </div>
                        <div className="three-c-card">
                          <span>CAPACITY</span>
                          <strong style={{ color: "#ff7b7b" }}>{simulationData.summary.capacity_misses}</strong>
                          <small>Working set overflow</small>
                        </div>
                      </div>

                      <div className="amat-box">
                        <strong>AMAT: {simulationData.summary.amat_cycles} cycles</strong>
                        <div>Formula: {simulationData.summary.amat_formula}</div>
                      </div>

                      <div className="result-metrics">
                        <div><span>Hit Rate</span><strong style={{ color: "#4bdda4" }}>{simulationData.summary.hit_rate_pct}%</strong></div>
                        <div><span>Miss Rate</span><strong>{simulationData.summary.miss_rate_pct}%</strong></div>
                        <div><span>Evictions</span><strong>{simulationData.summary.evictions}</strong></div>
                        <div><span>Total Accesses</span><strong>{simulationData.summary.total_accesses}</strong></div>
                      </div>
                    </>
                  ) : (
                    <div className="empty-result">
                      <p>Run trace simulation to see 3C miss breakdown and AMAT calculations.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Visual 64-bit Address Decoder & Step Inspector */}
              {simulationData && currentEvent && (
                <div className="panel" style={{ marginTop: "20px" }}>
                  <div className="panel-heading">
                    <div className="panel-icon"><Code2 size={18} /></div>
                    <div>
                      <h3>64-bit Address Decoder & Step Inspector (Step {currentStepIdx + 1} of {maxSteps})</h3>
                      <p>Raw memory address: <code>{currentEvent.address}</code></p>
                    </div>
                  </div>

                  <div className="decoder-box">
                    <div className="decoder-part tag">
                      <label>TAG ({simulationData.geometry.tag_bits} bits)</label>
                      <strong>{currentEvent.tag}</strong>
                      <small>Cache Tag Identifier</small>
                    </div>
                    <div className="decoder-part index">
                      <label>SET INDEX ({simulationData.geometry.index_bits} bits)</label>
                      <strong>Set #{currentEvent.set_index}</strong>
                      <small>Indexed Cache Row</small>
                    </div>
                    <div className="decoder-part offset">
                      <label>BYTE OFFSET ({simulationData.geometry.offset_bits} bits)</label>
                      <strong>{currentEvent.offset}</strong>
                      <small>Line Byte Offset</small>
                    </div>
                  </div>

                  {/* Playback Controls */}
                  <div className="playback-bar">
                    <button
                      className="playback-btn"
                      onClick={() => setCurrentStepIdx(prev => Math.max(0, prev - 1))}
                      disabled={currentStepIdx === 0}
                    >
                      <SkipBack size={14} /> Prev Step
                    </button>
                    <button
                      className="playback-btn"
                      onClick={() => setCurrentStepIdx(prev => Math.min(maxSteps - 1, prev + 1))}
                      disabled={currentStepIdx === maxSteps - 1}
                    >
                      Next Step <SkipForward size={14} />
                    </button>
                    <span style={{ fontSize: "11px", color: "#8a9bac", marginLeft: "auto" }}>
                      Access: <strong>{currentEvent.operation} {currentEvent.address}</strong> $\rightarrow$
                      <span className={currentEvent.result === "HIT" ? "badge-hit" : "badge-miss"} style={{ marginLeft: "8px" }}>
                        {currentEvent.result} {currentEvent.miss_type ? `(${currentEvent.miss_type})` : ""}
                      </span>
                    </span>
                  </div>

                  {/* Active Cache Set Snapshot */}
                  <div>
                    <h4 style={{ fontSize: "12px", margin: "12px 0 6px", color: "#8e9eb2" }}>
                      Cache Set #{currentEvent.set_index} Ways Status
                    </h4>
                    <table className="cache-table">
                      <thead>
                        <tr>
                          <th>Way</th>
                          <th>Valid</th>
                          <th>Tag</th>
                          <th>Block Base Address</th>
                          <th>Dirty</th>
                          <th>State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentEvent.cache_set_snapshot.map((w, idx) => (
                          <tr key={idx} className={idx === currentEvent.way_index ? "highlighted-row" : ""}>
                            <td>Way {w.way}</td>
                            <td>{w.valid ? "YES" : "NO"}</td>
                            <td><code>{w.tag}</code></td>
                            <td><code>{w.block_addr}</code></td>
                            <td>{w.dirty ? "DIRTY" : "CLEAN"}</td>
                            <td>{idx === currentEvent.way_index ? `TARGET (${currentEvent.result})` : "Resident"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 3: ML LOCALITY ADVISOR */}
          {activeTab === "ML Locality Advisor" && (
            <>
              <section className="welcome">
                <div>
                  <div className="eyebrow"><Compass size={14} /> WORKLOAD INTELLIGENCE</div>
                  <h1>ML Locality <span>Advisor.</span></h1>
                  <p>Analyzes memory address patterns, predicts optimal cache geometry, and recommends code optimizations.</p>
                </div>
                <button className="welcome-chip" onClick={runAdvisor} disabled={advisorLoading}>
                  <Compass size={15} />
                  <span>{advisorLoading ? "Analyzing..." : "Analyze Workload"}</span>
                </button>
              </section>

              {advisorData ? (
                <>
                  <div className="advisor-card">
                    <span className="advisor-badge">RECOMMENDED POLICY: {advisorData.recommended_policy}</span>
                    <h3 style={{ margin: "0 0 10px" }}>Workload Diagnostic Assessment</h3>
                    <p style={{ color: "#95a8be", fontSize: "12px" }}>
                      The ML feature engine evaluated candidate policies against this trace.
                      Policy <strong>{advisorData.recommended_policy}</strong> minimizes miss rate with a{" "}
                      <strong>{advisorData.headroom_vs_oracle_pct}%</strong> performance headroom vs. Belady's theoretical optimal oracle.
                    </p>

                    <h4 style={{ fontSize: "12px", color: "#4bdda4", marginTop: "16px" }}>Actionable Optimization Advice:</h4>
                    <ul className="diagnostic-list">
                      {advisorData.actionable_advice.map((adv, i) => (
                        <li key={i}><Check size={16} /><span>{adv}</span></li>
                      ))}
                    </ul>
                  </div>

                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-top"><span>SPATIAL LOCALITY SCORE</span><Activity size={18} /></div>
                      <strong className="stat-green">{advisorData.workload_features.spatial_locality_score}%</strong>
                      <small>Sequential stride regularity</small>
                    </div>
                    <div className="stat-card">
                      <div className="stat-top"><span>TEMPORAL LOCALITY SCORE</span><Gauge size={18} /></div>
                      <strong className="stat-green">{advisorData.workload_features.temporal_locality_score}%</strong>
                      <small>Reuse recency metric</small>
                    </div>
                    <div className="stat-card">
                      <div className="stat-top"><span>WORKING SET FOOTPRINT</span><Layers size={18} /></div>
                      <strong>{advisorData.workload_features.working_set_footprint_kb} KB</strong>
                      <small>Unique memory lines referenced</small>
                    </div>
                    <div className="stat-card">
                      <div className="stat-top"><span>REUSE RATIO</span><RefreshCw size={18} /></div>
                      <strong>{(advisorData.workload_features.reuse_ratio * 100).toFixed(1)}%</strong>
                      <small>Repeated address access rate</small>
                    </div>
                  </div>
                </>
              ) : (
                <div className="panel empty-result">
                  <div className="empty-icon"><Compass size={28} /></div>
                  <h3>No Workload Analysis Yet</h3>
                  <p>Click "Analyze Workload" to extract reuse distance, stride predictability, and receive optimization advice.</p>
                  <button className="run-button" style={{ maxWidth: "240px", marginTop: "15px" }} onClick={runAdvisor}>
                    Analyze Active Workload
                  </button>
                </div>
              )}
            </>
          )}

          {/* TAB 4: POLICY COMPARISON */}
          {activeTab === "Policy Comparison" && (
            <>
              <section className="welcome">
                <div>
                  <div className="eyebrow"><FileBarChart size={14} /> MULTI-POLICY BENCHMARK</div>
                  <h1>Policy <span>Shootout.</span></h1>
                  <p>Compare LRU, FIFO, LFU, Clock, and Belady MIN on the exact same real memory trace.</p>
                </div>
                <button className="welcome-chip" onClick={runAdvisor} disabled={advisorLoading}>
                  <RefreshCw size={15} />
                  <span>Update Shootout</span>
                </button>
              </section>

              {advisorData ? (
                <div className="panel">
                  <div className="panel-heading">
                    <div className="panel-icon"><FileBarChart size={18} /></div>
                    <div><h3>Miss Rate by Replacement Policy (%)</h3><p>Lower is better</p></div>
                  </div>

                  <div className="chart-wrap" style={{ height: "300px" }}>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={Object.entries(advisorData.policy_benchmarks).map(([k, v]) => ({
                        policy: k,
                        miss_rate: v.miss_rate_pct,
                        amat: v.amat_cycles
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#252d3b" vertical={false} />
                        <XAxis dataKey="policy" stroke="#8994a7" tickLine={false} axisLine={false} />
                        <YAxis stroke="#8994a7" tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ background: "#151c29", border: "1px solid #303b4c", borderRadius: 10 }} />
                        <Bar dataKey="miss_rate" name="Miss Rate (%)" fill="#4bdda4" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <table className="cache-table" style={{ marginTop: "25px" }}>
                    <thead>
                      <tr>
                        <th>Policy</th>
                        <th>Miss Rate</th>
                        <th>Hits</th>
                        <th>Misses</th>
                        <th>Evictions</th>
                        <th>AMAT (cycles)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(advisorData.policy_benchmarks).map(([pol, stat]) => (
                        <tr key={pol} className={pol === advisorData.recommended_policy ? "highlighted-row" : ""}>
                          <td><strong>{pol}</strong> {pol === "BELADY" ? "(Oracle)" : ""}</td>
                          <td style={{ color: "#4bdda4" }}>{stat.miss_rate_pct}%</td>
                          <td>{stat.hits}</td>
                          <td>{stat.misses}</td>
                          <td>{stat.evictions}</td>
                          <td>{stat.amat_cycles}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="panel empty-result">
                  <p>Click "Update Shootout" to compare all cache policies against the real address trace.</p>
                  <button className="run-button" style={{ maxWidth: "220px", marginTop: "15px" }} onClick={runAdvisor}>
                    Run Policy Shootout
                  </button>
                </div>
              )}
            </>
          )}

          <footer>
            <span>CacheWise © 2026 · Hybrid Native Execution & Microarchitectural Memory Lab</span>
            <span>Real CPU Telemetry + Trace-Driven Analysis</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
