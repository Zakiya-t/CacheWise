from typing import Set, Dict, List
from collections import deque

class ThreeCMissClassifier:
    """
    Implements Mark Hill's 3C Cache Miss Classification Model:
    - Compulsory (Cold): First time this memory block is ever referenced.
    - Capacity: Misses even in an idealized Fully-Associative LRU cache of identical total size.
    - Conflict: Hits in a Fully-Associative cache, but misses due to set mapping contention.
    """
    def __init__(self, total_cache_lines: int):
        self.total_cache_lines = total_cache_lines
        self.seen_blocks: Set[int] = set()
        # Fully-associative LRU shadow cache with capacity = total_cache_lines
        self.shadow_fa_lru: deque = deque(maxlen=total_cache_lines)
        self.shadow_fa_set: Set[int] = set()

    def classify_miss(self, block_address: int) -> str:
        # 1. Compulsory Check
        if block_address not in self.seen_blocks:
            self.seen_blocks.add(block_address)
            self._update_shadow_cache(block_address)
            return "COMPULSORY"

        # 2. Check if it would have been a HIT in the Fully-Associative shadow cache
        if block_address in self.shadow_fa_set:
            # It hit in fully-associative cache, so it only missed in set-associative cache due to set conflicts!
            self._update_shadow_cache(block_address)
            return "CONFLICT"
        else:
            # It missed even in fully-associative cache -> Capacity Miss!
            self._update_shadow_cache(block_address)
            return "CAPACITY"

    def record_hit(self, block_address: int):
        self._update_shadow_cache(block_address)

    def _update_shadow_cache(self, block_address: int):
        if block_address in self.shadow_fa_set:
            self.shadow_fa_lru.remove(block_address)
        elif len(self.shadow_fa_lru) >= self.total_cache_lines:
            evicted = self.shadow_fa_lru.popleft()
            self.shadow_fa_set.discard(evicted)

        self.shadow_fa_lru.append(block_address)
        self.shadow_fa_set.add(block_address)

