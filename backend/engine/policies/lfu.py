from typing import List, Dict
from .base import ReplacementPolicy, CacheLine

class LFUPolicy(ReplacementPolicy):
    """Least Frequently Used with LRU tie-breaking among blocks with equal frequency."""
    def __init__(self, ways: int):
        super().__init__(ways)
        # set_index -> dict of {way_index: frequency}
        self.frequencies: Dict[int, Dict[int, int]] = {}
        # set_index -> dict of {way_index: last_access_step}
        self.last_access: Dict[int, Dict[int, int]] = {}

    def _get_freq(self, set_index: int) -> Dict[int, int]:
        if set_index not in self.frequencies:
            self.frequencies[set_index] = {w: 0 for w in range(self.ways)}
            self.last_access[set_index] = {w: 0 for w in range(self.ways)}
        return self.frequencies[set_index]

    def on_hit(self, set_index: int, way_index: int, current_step: int, **kwargs):
        freq = self._get_freq(set_index)
        freq[way_index] = freq.get(way_index, 0) + 1
        self.last_access[set_index][way_index] = current_step

    def on_miss_insert(self, set_index: int, way_index: int, current_step: int, **kwargs):
        freq = self._get_freq(set_index)
        freq[way_index] = 1 # Initial access count
        self.last_access[set_index][way_index] = current_step

    def select_victim(self, set_index: int, lines: List[CacheLine], current_step: int, **kwargs) -> int:
        freq = self._get_freq(set_index)
        last_acc = self.last_access[set_index]

        # Find the minimum frequency
        min_freq = min(freq[w] for w in range(self.ways))
        candidates = [w for w in range(self.ways) if freq[w] == min_freq]

        if len(candidates) == 1:
            return candidates[0]

        # Tie breaker: Least Recently Used among candidates
        return min(candidates, key=lambda w: last_acc.get(w, 0))

