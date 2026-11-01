import math
from dataclasses import dataclass

@dataclass
class CacheConfig:
    capacity_bytes: int = 32768      # 32 KB default L1 data cache
    block_size_bytes: int = 64       # 64 bytes per cache line
    associativity: int = 8           # 8-way set associative
    address_width_bits: int = 64     # 64-bit architecture
    hit_time_cycles: float = 4.0     # Typical L1 hit time (cycles)
    miss_penalty_cycles: float = 100.0 # Typical DRAM/LLC penalty (cycles)

    def __post_init__(self):
        if self.capacity_bytes <= 0 or (self.capacity_bytes & (self.capacity_bytes - 1)) != 0:
            raise ValueError(f"Capacity must be a positive power of 2, got {self.capacity_bytes}")
        if self.block_size_bytes <= 0 or (self.block_size_bytes & (self.block_size_bytes - 1)) != 0:
            raise ValueError(f"Block size must be a positive power of 2, got {self.block_size_bytes}")
        if self.associativity <= 0:
            raise ValueError(f"Associativity must be >= 1, got {self.associativity}")

        self.num_lines = self.capacity_bytes // self.block_size_bytes
        if self.associativity > self.num_lines:
            self.associativity = self.num_lines # Fully associative cap

        self.num_sets = self.num_lines // self.associativity
        if (self.num_sets & (self.num_sets - 1)) != 0:
            raise ValueError("Number of sets must be a power of 2")

        self.offset_bits = int(math.log2(self.block_size_bytes))
        self.index_bits = int(math.log2(self.num_sets)) if self.num_sets > 1 else 0
        self.tag_bits = self.address_width_bits - self.index_bits - self.offset_bits

    @property
    def is_direct_mapped(self) -> bool:
        return self.associativity == 1

    @property
    def is_fully_associative(self) -> bool:
        return self.num_sets == 1

