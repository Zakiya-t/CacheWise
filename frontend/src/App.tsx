import { useState } from "react";
import {
  Activity, Cpu, Gauge, Code2, LayoutDashboard, MemoryStick,
  FileBarChart, Settings, Play, Clock3, CheckCircle2,
  AlertCircle, Zap, ArrowRight, Layers
} from "lucide-react";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";

import "./App.css";

type Mode = "row" | "column";

type ExperimentResult = {
  mode: Mode;
  median_ms: number;
  minimum_ms: number;
  maximum_ms: number;
  execution_times_ms: number[];
  checksum: number;
  matrix_size: number;
};

const API = "http://127.0.0.1:8000";

function App() {
  const [mode, setMode] = useState<Mode>("row");
  const [size, setSize] = useState(2048);
  const [repetitions, setRepetitions] = useState(5);
  const [trials, setTrials] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Partial<Record<Mode, ExperimentResult>>>({});
  const [activePage, setActivePage] = useState("Dashboard");

  const current = results[mode];

  async function runExperiment(selectedMode: Mode) {
    setLoading(true);
    setError("");
    setMode(selectedMode);

    try {
      const response = await fetch(`${API}/api/experiments/matrix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selectedMode,
          size,
          repetitions,
          trials
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Experiment failed.");
      }

      setResults(previous => ({
        ...previous,
        [selectedMode]: data
      }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to CacheWise backend."
      );
    } finally {
      setLoading(false);
    }
  }

  const chartData = [
    {
      mode: "Row major",
      time: results.row?.median_ms ?? 0
    },
    {
      mode: "Column major",
      time: results.column?.median_ms ?? 0
    }
  ];

  const completed = Object.keys(results).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Activity size={23} /></div>
          <div>
            <h2>CacheWise</h2>
            <span>MEMORY INTELLIGENCE</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        {[
          { name: "Dashboard", icon: LayoutDashboard },
          { name: "Experiments", icon: Code2 },
          { name: "Memory Visualizer", icon: MemoryStick },
          { name: "Reports", icon: FileBarChart }
        ].map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.name}
              className={`nav-item ${activePage === item.name ? "active" : ""}`}
              onClick={() => setActivePage(item.name)}
            >
              <Icon size={18} />
              {item.name}
            </button>
          );
        })}

        <div className="sidebar-bottom">
          <button className="nav-item">
            <Settings size={18} /> Settings
          </button>
          <div className="system-status">
            <span className="status-dot" />
            <div>
              <strong>Execution engine</strong>
              <small>Local Ubuntu VM</small>
            </div>
          </div>
          <div className="version">CACHEWISE · v0.1.0</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">WORKSPACE /</span>
            <strong>{activePage}</strong>
          </div>
          <div className="top-right">
            <span className="live-indicator"><span /> Backend connected</span>
            <div className="avatar">CW</div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome">
            <div>
              <div className="eyebrow"><Zap size={14} /> NATIVE EXECUTION ANALYSIS</div>
              <h1>Understand your <span>memory.</span></h1>
              <p>
                Execute real C++ workloads, study memory access patterns
                and compare performance.
              </p>
            </div>
            <div className="welcome-chip">
              <Cpu size={17} />
              <span>x86_64 · Ubuntu</span>
            </div>
          </section>

          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-top"><span>EXPERIMENTS COMPLETED</span><Activity size={18} /></div>
              <strong>{completed}</strong>
              <small>Traversal modes tested</small>
            </div>
            <div className="stat-card">
              <div className="stat-top"><span>MATRIX DIMENSION</span><Layers size={18} /></div>
              <strong>{size.toLocaleString()} × {size.toLocaleString()}</strong>
              <small>Elements per experiment</small>
            </div>
            <div className="stat-card">
              <div className="stat-top"><span>EXECUTION ENGINE</span><Cpu size={18} /></div>
              <strong className="stat-green">Native C++</strong>
              <small>Compiled benchmark binary</small>
            </div>
            <div className="stat-card">
              <div className="stat-top"><span>HARDWARE COUNTERS</span><Gauge size={18} /></div>
              <strong className="stat-muted">Unavailable</strong>
              <small>VM currently exposes no cycles counter</small>
            </div>
          </section>

          <div className="section-heading">
            <div>
              <h2>Experiment workspace</h2>
              <p>Configure and execute a matrix traversal benchmark.</p>
            </div>
            <span className="native-tag"><span /> NATIVE EXECUTION</span>
          </div>

          <section className="workspace-grid">
            <div className="panel config-panel">
              <div className="panel-heading">
                <div className="panel-icon"><Code2 size={18} /></div>
                <div><h3>Experiment configuration</h3><p>Choose your workload parameters</p></div>
              </div>

              <label className="field-label">MEMORY ACCESS PATTERN</label>
              <div className="mode-selector">
                <button
                  className={mode === "row" ? "mode-option selected" : "mode-option"}
                  onClick={() => setMode("row")}
                >
                  <div className="mode-symbol row-symbol">↔</div>
                  <div><strong>Row major</strong><small>Sequential access</small></div>
                  {mode === "row" && <CheckCircle2 size={17} />}
                </button>
                <button
                  className={mode === "column" ? "mode-option selected" : "mode-option"}
                  onClick={() => setMode("column")}
                >
                  <div className="mode-symbol col-symbol">↕</div>
                  <div><strong>Column major</strong><small>Strided access</small></div>
                  {mode === "column" && <CheckCircle2 size={17} />}
                </button>
              </div>

              <div className="field">
                <div className="field-title"><label>Matrix dimension</label><strong>{size} × {size}</strong></div>
                <input type="range" min="256" max="4096" step="256" value={size}
                  onChange={e => setSize(Number(e.target.value))} />
                <div className="range-labels"><span>256 × 256</span><span>4096 × 4096</span></div>
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

              <button className="run-button" disabled={loading} onClick={() => runExperiment(mode)}>
                {loading ? <><span className="spinner" /> Executing benchmark...</> : <><Play size={17} fill="currentColor" /> Run native experiment</>}
              </button>

              {error && <div className="error-message"><AlertCircle size={16} />{error}</div>}

              <div className="execution-note">
                <CheckCircle2 size={15} />
                Executes the compiled C++ benchmark on your Ubuntu VM.
              </div>
            </div>

            <div className="panel result-panel">
              <div className="panel-heading">
                <div className="panel-icon"><Gauge size={18} /></div>
                <div><h3>Execution results</h3><p>Measured benchmark performance</p></div>
              </div>

              {current ? (
                <>
                  <div className="result-primary">
                    <span>MEDIAN EXECUTION TIME</span>
                    <div>{current.median_ms.toFixed(3)} <small>ms</small></div>
                    <span className="result-mode">{mode.toUpperCase()} MAJOR TRAVERSAL</span>
                  </div>
                  <div className="result-metrics">
                    <div><span>Minimum</span><strong>{current.minimum_ms.toFixed(3)} ms</strong></div>
                    <div><span>Maximum</span><strong>{current.maximum_ms.toFixed(3)} ms</strong></div>
                    <div><span>Checksum</span><strong>{current.checksum.toLocaleString()}</strong></div>
                    <div><span>Trials</span><strong>{current.execution_times_ms.length}</strong></div>
                  </div>
                  <div className="trial-list">
                    <span>INDIVIDUAL TRIALS</span>
                    {current.execution_times_ms.map((time, index) => (
                      <div key={index}><span>Trial {index + 1}</span><strong>{time.toFixed(3)} ms</strong></div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-result">
                  <div className="empty-icon"><Clock3 size={26} /></div>
                  <h3>Awaiting your first experiment</h3>
                  <p>Configure your workload and click Run native experiment to see real execution measurements here.</p>
                  <div className="empty-hint"><ArrowRight size={15} /> Results will appear in this panel</div>
                </div>
              )}
            </div>
          </section>

          <section className="lower-grid">
            <div className="panel chart-panel">
              <div className="panel-heading">
                <div className="panel-icon"><Activity size={18} /></div>
                <div><h3>Performance comparison</h3><p>Median execution time by access pattern</p></div>
              </div>
              {completed > 0 ? (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#252d3b" vertical={false} />
                      <XAxis dataKey="mode" stroke="#8994a7" tickLine={false} axisLine={false} />
                      <YAxis stroke="#8994a7" tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: "#151c29", border: "1px solid #303b4c", borderRadius: 10 }} />
                      <Bar dataKey="time" name="Median time (ms)" fill="#38d99b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="chart-empty">Run an experiment to populate the comparison chart.</div>
              )}
            </div>

            <div className="panel visual-panel">
              <div className="panel-heading">
                <div className="panel-icon"><MemoryStick size={18} /></div>
                <div><h3>Memory access preview</h3><p>Conceptual matrix traversal</p></div>
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
                <span><i className="legend-active" /> Selected access path</span>
                <span><i className="legend-idle" /> Other elements</span>
              </div>
              <p className="visual-disclaimer">Illustrative access pattern — not a live hardware cache trace.</p>
            </div>
          </section>

          <footer>
            <span>CacheWise © 2026</span>
            <span>Built for native memory behaviour analysis</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
