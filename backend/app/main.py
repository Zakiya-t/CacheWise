from pathlib import Path
from typing import Literal, List, Optional
from threading import Lock
from statistics import median
import re
import subprocess
import shutil

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ..engine.cache.cache_config import CacheConfig
from ..engine.cache.simulator import CacheSimulator
from ..engine.advisor.predictor import CacheAdvisor

app = FastAPI(title="CacheWise Hybrid Execution & Architecture API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

PROJECT = Path(__file__).resolve().parents[2]
BENCH_DIR = PROJECT / "benchmarks"
CPP_SOURCE = BENCH_DIR / "matrix_traversal.cpp"
# Support both Linux native binary and Windows .exe binary
BINARY_NAME = "cachewise_matrix.exe" if shutil.which("cl") or shutil.which("g++") and Path("C:/").exists() and not Path("/proc").exists() else "cachewise_matrix"
BINARY = BENCH_DIR / BINARY_NAME

benchmark_lock = Lock()

def ensure_compiled():
    """Compiles the C++ benchmark if not already built."""
    if BINARY.is_file():
        return True

    compiler = shutil.which("g++") or shutil.which("clang++")
    if not compiler:
        return False

    cmd = [compiler, "-O2", str(CPP_SOURCE), "-o", str(BINARY)]
    res = subprocess.run(cmd, cwd=BENCH_DIR, capture_output=True, text=True)
    return res.returncode == 0

# Schemas
class MatrixExperiment(BaseModel):
    mode: Literal["row", "column"]
    size: int = Field(default=2048, ge=256, le=4096)
    repetitions: int = Field(default=5, ge=1, le=10)
    trials: int = Field(default=5, ge=3, le=9)

class TraceRequest(BaseModel):
    mode: Literal["row", "column"]
    size: int = Field(default=128, ge=32, le=512)
    max_records: int = Field(default=150, ge=10, le=1000)

class SimulationRequest(BaseModel):
    capacity_bytes: int = Field(default=32768, ge=1024, le=1048576) # 1KB to 1MB
    block_size_bytes: int = Field(default=64, ge=16, le=256)
    associativity: int = Field(default=8, ge=1, le=64)
    policy: Literal["lru", "fifo", "lfu", "clock", "belady"] = "lru"
    trace: Optional[List[str]] = None
    source_mode: Optional[Literal["row", "column"]] = "row"

@app.get("/")
def home():
    return {
        "application": "CacheWise",
        "tagline": "Hybrid Native Execution & Microarchitectural Memory Lab",
        "status": "ready",
        "benchmark_compiled": BINARY.is_file()
    }

@app.get("/api/system/capabilities")
def get_system_capabilities():
    perf_path = shutil.which("perf")
    has_gxx = bool(shutil.which("g++") or shutil.which("clang++"))
    return {
        "perf_installed": bool(perf_path),
        "perf_path": perf_path,
        "compiler_available": has_gxx,
        "software_counters": ["task-clock", "page-faults", "context-switches"] if perf_path else [],
        "real_execution": "native_cpp",
        "trace_driven_simulation": "supported"
    }

def run_native_binary_with_perf(mode: str, size: int, repetitions: int):
    if not BINARY.is_file():
        if not ensure_compiled():
            raise HTTPException(status_code=503, detail="Could not compile C++ benchmark.")

    perf_cmd = shutil.which("perf")
    base_cmd = [str(BINARY), mode, str(size), str(repetitions)]

    if perf_cmd:
        # Measure software performance counters via Linux perf
        command = [
            perf_cmd, "stat",
            "-e", "task-clock,page-faults,context-switches",
            "--"
        ] + base_cmd
    else:
        command = base_cmd

    try:
        result = subprocess.run(
            command,
            cwd=PROJECT,
            capture_output=True,
            text=True,
            timeout=15,
            check=False
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Benchmark execution timed out.")

    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "Benchmark execution failed.")

    output = result.stdout
    perf_output = result.stderr # perf stat prints its report to stderr

    time_match = re.search(r"Execution time:\s*([\d.]+)\s*ms", output)
    checksum_match = re.search(r"Checksum:\s*(\d+)", output)
    throughput_match = re.search(r"Memory throughput:\s*([\d.]+)\s*GB/s", output)
    data_match = re.search(r"Total data processed:\s*([\d.]+)\s*MB", output)

    if not time_match or not checksum_match:
        raise HTTPException(status_code=500, detail="Could not parse benchmark output.")

    # Parse perf counters from stderr
    task_clock_ms = None
    page_faults = None
    context_switches = None

    if perf_output:
        tc_m = re.search(r"([\d.,]+)\s+msec\s+task-clock", perf_output)
        pf_m = re.search(r"([\d.,]+)\s+page-faults", perf_output)
        cs_m = re.search(r"([\d.,]+)\s+context-switches", perf_output)
        if tc_m:
            task_clock_ms = float(tc_m.group(1).replace(",", ""))
        if pf_m:
            page_faults = int(pf_m.group(1).replace(",", ""))
        if cs_m:
            context_switches = int(cs_m.group(1).replace(",", ""))

    return {
        "time_ms": float(time_match.group(1)),
        "checksum": int(checksum_match.group(1)),
        "throughput_gb_s": float(throughput_match.group(1)) if throughput_match else 0.0,
        "data_mb": float(data_match.group(1)) if data_match else 0.0,
        "task_clock_ms": task_clock_ms,
        "page_faults": page_faults,
        "context_switches": context_switches
    }

@app.post("/api/experiments/matrix")
def run_matrix_experiment(request: MatrixExperiment):
    if not benchmark_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another benchmark is currently running.")

    try:
        # Warmup run
        run_native_binary_with_perf(request.mode, request.size, request.repetitions)

        results = []
        for _ in range(request.trials):
            results.append(run_native_binary_with_perf(request.mode, request.size, request.repetitions))

        timings = [item["time_ms"] for item in results]
        throughputs = [item["throughput_gb_s"] for item in results]

        # Averages for perf metrics
        task_clocks = [r["task_clock_ms"] for r in results if r["task_clock_ms"] is not None]
        page_faults = [r["page_faults"] for r in results if r["page_faults"] is not None]

        return {
            "experiment": "matrix_traversal",
            "execution": "native_cpp_on_ubuntu_vm",
            "mode": request.mode,
            "matrix_size": request.size,
            "repetitions_per_trial": request.repetitions,
            "trials": request.trials,
            "checksum": results[0]["checksum"],
            "data_processed_mb": results[0]["data_mb"],
            "execution_times_ms": timings,
            "median_ms": median(timings),
            "minimum_ms": min(timings),
            "maximum_ms": max(timings),
            "median_throughput_gb_s": median(throughputs) if throughputs else 0.0,
            "task_clock_ms": median(task_clocks) if task_clocks else None,
            "page_faults": int(median(page_faults)) if page_faults else None,
            "perf_status": "active (task-clock, page-faults)" if task_clocks else "native_clock"
        }
    finally:
        benchmark_lock.release()

@app.post("/api/experiments/trace")
def extract_real_trace(request: TraceRequest):
    """Executes the C++ benchmark in --trace mode and returns real 64-bit virtual memory addresses."""
    if not BINARY.is_file():
        if not ensure_compiled():
            raise HTTPException(status_code=503, detail="Could not compile C++ benchmark.")

    cmd = [str(BINARY), request.mode, str(request.size), "1", "--trace", str(request.max_records)]
    try:
        res = subprocess.run(cmd, cwd=PROJECT, capture_output=True, text=True, timeout=10)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Trace capture timed out.")

    if res.returncode != 0:
        raise HTTPException(status_code=500, detail="Trace generation failed.")

    lines = res.stdout.splitlines()
    trace_ops = []
    capture = False
    for line in lines:
        if "=== MEMORY TRACE START ===" in line:
            capture = True
            continue
        if "=== MEMORY TRACE END ===" in line:
            break
        if capture and line.startswith("READ"):
            trace_ops.append(line)

    return {
        "mode": request.mode,
        "sample_count": len(trace_ops),
        "source": "native_c++_virtual_memory",
        "sample_trace": trace_ops
    }

@app.post("/api/simulation/run")
def run_simulation(request: SimulationRequest):
    """Replays real or synthetic memory traces against configurable cache microarchitecture."""
    trace = request.trace
    if not trace:
        # Extract a real trace directly from the C++ benchmark
        trace_data = extract_real_trace(TraceRequest(mode=request.source_mode or "row", size=128, max_records=120))
        trace = trace_data["sample_trace"]

    config = CacheConfig(
        capacity_bytes=request.capacity_bytes,
        block_size_bytes=request.block_size_bytes,
        associativity=request.associativity
    )

    sim = CacheSimulator(config, policy_name=request.policy)
    result = sim.run_trace(trace, max_events_to_record=150)
    return result

@app.post("/api/advisor/analyze")
def analyze_workload(request: SimulationRequest):
    """Extracts locality features and provides policy recommendation & optimization diagnostics."""
    trace = request.trace
    if not trace:
        trace_data = extract_real_trace(TraceRequest(mode=request.source_mode or "row", size=128, max_records=200))
        trace = trace_data["sample_trace"]

    config = CacheConfig(
        capacity_bytes=request.capacity_bytes,
        block_size_bytes=request.block_size_bytes,
        associativity=request.associativity
    )

    advisor = CacheAdvisor(config)
    analysis = advisor.analyze_and_advise(trace)
    return analysis
