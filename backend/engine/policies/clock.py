from typing import List, Dict
from .base import ReplacementPolicy, CacheLine

class ClockPolicy(ReplacementPolicy):
    """Clock (Second-Chance) replacement policy with reference bits and circular hand."""
    def __init__(self, ways: int):
        super().__init__(ways)
        # set_index -> dict of {way_index: ref_bit}
        self.ref_bits: Dict[int, Dict[int, int]] = {}
        # set_index -> circular hand pointer
        self.clock_hands: Dict[int, int] = {}

    def _init_set(self, set_index: int):
        if set_index not in self.ref_bits:
            self.ref_bits[set_index] = {w: 0 for w in range(self.ways)}
            self.clock_hands[set_index] = 0

    def on_hit(self, set_index: int, way_index: int, current_step: int, **kwargs):
        self._init_set(set_index)
        self.ref_bits[set_index][way_index] = 1 # Mark referenced

    def on_miss_insert(self, set_index: int, way_index: int, current_step: int, **kwargs):
        self._init_set(set_index)
        self.ref_bits[set_index][way_index] = 1 # Newly loaded line has ref bit = 1

    def select_victim(self, set_index: int, lines: List[CacheLine], current_step: int, **kwargs) -> int:
        self._init_set(set_index)
        hand = self.clock_hands[set_index]
        bits = self.ref_bits[set_index]

        # Scan circularly until a line with ref_bit == 0 is found
        while True:
            if bits[hand] == 0:
                victim = hand
                self.clock_hands[set_index] = (hand + 1) % self.ways
                return victim
            else:
                bits[hand] = 0 # Second chance cleared
                hand = (hand + 1) % self.ways

