
from pathlib import Path
from typing import Literal
from threading import Lock
from statistics import median
import re
import subprocess

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="CacheWise Execution API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_methods=["*"],
    allow_headers=["*"]
)

PROJECT = Path(__file__).resolve().parents[2]
BINARY = PROJECT / "benchmarks" / "cachewise_matrix"

# Prevent simultaneous benchmark runs.
benchmark_lock = Lock()


class MatrixExperiment(BaseModel):
    mode: Literal["row", "column"]
    size: int = Field(default=2048, ge=256, le=4096)
    repetitions: int = Field(default=5, ge=1, le=10)
    trials: int = Field(default=5, ge=3, le=9)


def execute_benchmark(mode, size, repetitions):

    if not BINARY.is_file():
        raise HTTPException(
            status_code=503,
            detail="Benchmark executable not found."
        )

    command = [
        str(BINARY),
        mode,
        str(size),
        str(repetitions)
    ]

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
        raise HTTPException(
            status_code=408,
            detail="Benchmark execution timed out."
        )

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=result.stderr or "Benchmark failed."
        )

    time_match = re.search(
        r"Execution time:\s*([\d.]+)\s*ms",
        result.stdout
    )

    checksum_match = re.search(
        r"Checksum:\s*(\d+)",
        result.stdout
    )

    if not time_match or not checksum_match:
        raise HTTPException(
            status_code=500,
            detail="Could not parse benchmark output."
        )

    return {
        "time_ms": float(time_match.group(1)),
        "checksum": int(checksum_match.group(1))
    }


@app.get("/")
def home():
    return {
        "application": "CacheWise",
        "status": "running"
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "benchmark_exists": BINARY.is_file()
    }


@app.post("/api/experiments/matrix")
def run_matrix_experiment(request: MatrixExperiment):

    if not benchmark_lock.acquire(blocking=False):
        raise HTTPException(
            status_code=409,
            detail="Another benchmark is currently running."
        )

    try:
        # Warm-up: not included in reported trials.
        execute_benchmark(
            request.mode,
            request.size,
            request.repetitions
        )

        results = []

        for _ in range(request.trials):
            results.append(
                execute_benchmark(
                    request.mode,
                    request.size,
                    request.repetitions
                )
            )

        checksums = {item["checksum"] for item in results}

        if len(checksums) != 1:
            raise HTTPException(
                status_code=500,
                detail="Inconsistent benchmark checksums."
            )

        timings = [item["time_ms"] for item in results]

        return {
            "experiment": "matrix_traversal",
            "execution": "native_cpp_on_ubuntu_vm",
            "mode": request.mode,
            "matrix_size": request.size,
            "repetitions_per_trial": request.repetitions,
            "trials": request.trials,
            "checksum": results[0]["checksum"],
            "execution_times_ms": timings,
            "median_ms": median(timings),
            "minimum_ms": min(timings),
            "maximum_ms": max(timings),
            "measurement": "C++ steady_clock elapsed time",
            "hardware_cache_counters": "not currently available"
        }

    finally:
        benchmark_lock.release()
