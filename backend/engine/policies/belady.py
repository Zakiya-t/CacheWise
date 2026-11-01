from typing import List, Dict, Optional
from .base import ReplacementPolicy, CacheLine

class BeladyMinPolicy(ReplacementPolicy):
    """
    Belady's Optimal (MIN) Offline Oracle:
    Evicts the block whose next access is furthest in the future (or never accessed again).
    Used as an architectural gold standard to measure policy headroom.
    """
    def __init__(self, ways: int, future_trace: Optional[List[int]] = None):
        super().__init__(ways)
        self.future_trace = future_trace or []

    def set_future_trace(self, trace: List[int]):
        self.future_trace = trace

    def on_hit(self, set_index: int, way_index: int, current_step: int, **kwargs):
        pass

    def on_miss_insert(self, set_index: int, way_index: int, current_step: int, **kwargs):
        pass

    def select_victim(self, set_index: int, lines: List[CacheLine], current_step: int, **kwargs) -> int:
        furthest_step = -1
        victim_way = 0

        # Scan each way currently residing in this set
        for way_idx, line in enumerate(lines):
            if not line.valid:
                return way_idx

            block_addr = line.block_address
            # Find next occurrence of block_addr in future_trace starting after current_step
            next_use = float('inf')
            for step in range(current_step + 1, len(self.future_trace)):
                if self.future_trace[step] == block_addr:
                    next_use = step
                    break

            if next_use > furthest_step:
                furthest_step = next_use
                victim_way = way_idx
                if next_use == float('inf'): # Never used again, perfect victim!
                    break

        return victim_way

