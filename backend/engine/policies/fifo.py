from typing import List, Dict
from collections import deque
from .base import ReplacementPolicy, CacheLine

class FIFOPolicy(ReplacementPolicy):
    """First-In, First-Out: evicts the block that was loaded earliest, regardless of hits."""
    def __init__(self, ways: int):
        super().__init__(ways)
        # set_index -> queue of way indices in insertion order
        self.queues: Dict[int, deque] = {}

    def _get_queue(self, set_index: int) -> deque:
        if set_index not in self.queues:
            self.queues[set_index] = deque()
        return self.queues[set_index]

    def on_hit(self, set_index: int, way_index: int, current_step: int, **kwargs):
        # FIFO ignores hits! Insertion order does not change.
        pass

    def on_miss_insert(self, set_index: int, way_index: int, current_step: int, **kwargs):
        q = self._get_queue(set_index)
        if way_index in q:
            q.remove(way_index)
        q.append(way_index)

    def select_victim(self, set_index: int, lines: List[CacheLine], current_step: int, **kwargs) -> int:
        q = self._get_queue(set_index)
        if q:
            return q[0] # Head of FIFO queue
        return 0

