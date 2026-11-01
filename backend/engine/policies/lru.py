from typing import List, Dict
from .base import ReplacementPolicy, CacheLine

class LRUPolicy(ReplacementPolicy):
    """Least Recently Used: evicts the block whose last access was longest ago."""
    def __init__(self, ways: int):
        super().__init__(ways)
        # set_index -> list of ways in order of access (oldest at index 0, most recent at index -1)
        self.access_orders: Dict[int, List[int]] = {}

    def _get_order(self, set_index: int) -> List[int]:
        if set_index not in self.access_orders:
            self.access_orders[set_index] = []
        return self.access_orders[set_index]

    def on_hit(self, set_index: int, way_index: int, current_step: int, **kwargs):
        order = self._get_order(set_index)
        if way_index in order:
            order.remove(way_index)
        order.append(way_index)

    def on_miss_insert(self, set_index: int, way_index: int, current_step: int, **kwargs):
        order = self._get_order(set_index)
        if way_index in order:
            order.remove(way_index)
        order.append(way_index)

    def select_victim(self, set_index: int, lines: List[CacheLine], current_step: int, **kwargs) -> int:
        order = self._get_order(set_index)
        if order:
            return order[0] # Least recently used
        return 0

