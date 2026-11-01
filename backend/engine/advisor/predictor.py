from typing import List, Dict, Any
from ..cache.cache_config import CacheConfig
from ..cache.simulator import CacheSimulator
from .feature_extractor import WorkloadFeatureExtractor

class CacheAdvisor:
    """
    Analyzes workload characteristics, evaluates multiple policies,
    and produces actionable architectural and software advice.
    """
    def __init__(self, config: CacheConfig):
        self.config = config
        self.extractor = WorkloadFeatureExtractor(config.block_size_bytes)

    def analyze_and_advise(self, trace_addresses: List[int | str]) -> Dict[str, Any]:
        features = self.extractor.extract(trace_addresses)

        # Run simulations across candidate policies
        policies = ["lru", "fifo", "lfu", "clock", "belady"]
        policy_results = {}
        for p in policies:
            sim = CacheSimulator(self.config, policy_name=p)
            res = sim.run_trace(trace_addresses, max_events_to_record=0)
            policy_results[p.upper()] = {
                "hits": res["summary"]["hits"],
                "misses": res["summary"]["misses"],
                "miss_rate_pct": res["summary"]["miss_rate_pct"],
                "amat_cycles": res["summary"]["amat_cycles"],
                "evictions": res["summary"]["evictions"]
            }

        # Find best deployable policy (excluding Belady oracle)
        deployable = {k: v for k, v in policy_results.items() if k != "BELADY"}
        best_policy = min(deployable.keys(), key=lambda k: deployable[k]["miss_rate_pct"])
        oracle_best = policy_results.get("BELADY", {})

        # Generate intelligent diagnostics & code advice
        diagnostics: List[str] = []
        actionable_advice: List[str] = []

        spatial = features.get("spatial_locality_score", 0)
        temporal = features.get("temporal_locality_score", 0)
        footprint = features.get("working_set_footprint_kb", 0)
        cache_kb = self.config.capacity_bytes // 1024

        if spatial < 20.0:
            diagnostics.append("Poor spatial locality: Access addresses are jumping non-sequentially across memory pages.")
            actionable_advice.append("Check matrix traversal or nested loop ordering: ensure inner loops iterate across contiguous elements (Row-Major in C/C++).")

        if footprint > cache_kb:
            diagnostics.append(f"Working set ({footprint} KB) exceeds cache capacity ({cache_kb} KB), leading to capacity thrashing.")
            actionable_advice.append("Apply loop tiling (blocking) so sub-matrices fit comfortably within L1 cache.")

        if best_policy == "LRU" and policy_results["LRU"]["miss_rate_pct"] < policy_results["FIFO"]["miss_rate_pct"]:
            diagnostics.append("Significant temporal recency observed: recently touched lines are re-referenced soon.")
        elif best_policy == "LFU":
            diagnostics.append("High frequency concentration: specific hot blocks dominate memory accesses.")

        return {
            "workload_features": features,
            "policy_benchmarks": policy_results,
            "recommended_policy": best_policy,
            "headroom_vs_oracle_pct": round(
                policy_results[best_policy]["miss_rate_pct"] - oracle_best.get("miss_rate_pct", 0), 2
            ),
            "diagnostics": diagnostics,
            "actionable_advice": actionable_advice
        }

