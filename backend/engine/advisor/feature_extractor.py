from typing import List, Dict, Any
from collections import Counter
import statistics
import math

class WorkloadFeatureExtractor:
    """
    Extracts microarchitectural memory-access features from a real memory trace:
    1. Temporal locality (reuse distances)
    2. Spatial locality (stride distributions)
    3. Working set footprint
    4. Frequency concentration (entropy)
    """
    def __init__(self, block_size_bytes: int = 64):
        self.block_size = block_size_bytes

    def extract(self, trace_addresses: List[int | str]) -> Dict[str, Any]:
        if not trace_addresses:
            return {"error": "Empty trace"}

        # Convert to integer block addresses
        block_addrs: List[int] = []
        raw_addrs: List[int] = []
        for a in trace_addresses:
            if isinstance(a, str):
                clean = a.split()[-1]
                val = int(clean, 16) if clean.startswith(("0x", "0X")) else int(clean)
            else:
                val = int(a)
            raw_addrs.append(val)
            block_addrs.append(val // self.block_size)

        total_accesses = len(block_addrs)
        unique_blocks = len(set(block_addrs))
        footprint_kb = round((unique_blocks * self.block_size) / 1024, 2)

        # 1. Reuse Distances (Temporal Locality)
        last_seen: Dict[int, int] = {}
        reuse_distances: List[int] = []
        for i, b in enumerate(block_addrs):
            if b in last_seen:
                dist = i - last_seen[b]
                reuse_distances.append(dist)
            last_seen[b] = i

        reuse_ratio = len(reuse_distances) / total_accesses if total_accesses > 0 else 0.0
        mean_reuse_dist = round(statistics.mean(reuse_distances), 2) if reuse_distances else 0.0
        median_reuse_dist = round(statistics.median(reuse_distances), 2) if reuse_distances else 0.0

        # Temporal locality score: high when reuse ratio is high and median distance is low
        temporal_score = 0.0
        if reuse_distances:
            temporal_score = min(100.0, max(0.0, (reuse_ratio * 100.0) * (50.0 / (median_reuse_dist + 1.0))))

        # 2. Spatial Strides (Spatial Locality)
        strides: List[int] = []
        sequential_count = 0
        for i in range(1, len(raw_addrs)):
            diff = raw_addrs[i] - raw_addrs[i - 1]
            strides.append(diff)
            # Contiguous within same or adjacent cache block
            if 0 < diff <= self.block_size:
                sequential_count += 1

        stride_count = len(strides)
        sequential_ratio = (sequential_count / stride_count) if stride_count > 0 else 0.0
        spatial_score = round(sequential_ratio * 100.0, 1)

        # 3. Frequency Concentration (Entropy)
        counts = Counter(block_addrs)
        entropy = 0.0
        for cnt in counts.values():
            p = cnt / total_accesses
            if p > 0:
                entropy -= p * math.log2(p)
        max_entropy = math.log2(unique_blocks) if unique_blocks > 1 else 1.0
        normalized_entropy = round(entropy / max_entropy, 3) if max_entropy > 0 else 1.0

        return {
            "total_accesses": total_accesses,
            "unique_blocks": unique_blocks,
            "working_set_footprint_kb": footprint_kb,
            "reuse_ratio": round(reuse_ratio, 3),
            "mean_reuse_distance": mean_reuse_dist,
            "median_reuse_distance": median_reuse_dist,
            "temporal_locality_score": round(temporal_score, 1),
            "sequential_access_ratio": round(sequential_ratio, 3),
            "spatial_locality_score": spatial_score,
            "normalized_entropy": normalized_entropy
        }

