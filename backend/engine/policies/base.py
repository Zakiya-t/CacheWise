from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

@dataclass
class CacheLine:
    tag: int
    valid: bool = False
    dirty: bool = False
    block_address: int = 0
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

class ReplacementPolicy(ABC):
    def __init__(self, ways: int):
        self.ways = ways

    @abstractmethod
    def on_hit(self, set_index: int, way_index: int, current_step: int, **kwargs):
        """Called when an access hits in a specific way."""
        pass

    @abstractmethod
    def on_miss_insert(self, set_index: int, way_index: int, current_step: int, **kwargs):
        """Called when a new block is loaded into an empty or victim way."""
        pass

    @abstractmethod
    def select_victim(self, set_index: int, lines: List[CacheLine], current_step: int, **kwargs) -> int:
        """Returns the way index to evict."""
        pass

