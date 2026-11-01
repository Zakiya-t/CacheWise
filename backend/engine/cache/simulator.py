from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

from .cache_config import CacheConfig
from .address_decoder import AddressDecoder, DecodedAddress
from ..policies.base import CacheLine, ReplacementPolicy
from ..policies.lru import LRUPolicy
from ..policies.fifo import FIFOPolicy
from ..policies.lfu import LFUPolicy
from ..policies.clock import ClockPolicy
from ..policies.belady import BeladyMinPolicy
from ..analytics.miss_classifier import ThreeCMissClassifier
from ..analytics.amat import AMATCalculator

@dataclass
class StepEvent:
    step: int
    operation: str
    address: str
    raw_address: int
    tag: str
    set_index: int
    offset: str
    result: str # "HIT" or "MISS"
    miss_type: Optional[str] # "COMPULSORY", "CAPACITY", "CONFLICT", or None
    way_index: int
    evicted_address: Optional[str]
    evicted_tag: Optional[str]
    dirty: bool
    cache_set_snapshot: List[Dict[str, Any]]

class CacheSimulator:
    def __init__(self, config: CacheConfig, policy_name: str = "lru"):
        self.config = config
        self.policy_name = policy_name.lower()
        self.decoder = AddressDecoder(config)
        self.policy: ReplacementPolicy = self._create_policy(self.policy_name, config.associativity)
        self.classifier = ThreeCMissClassifier(config.num_lines)

        # Allocate 2D cache array: sets x ways
        self.sets: List[List[CacheLine]] = [
            [CacheLine(tag=0, valid=False) for _ in range(config.associativity)]
            for _ in range(config.num_sets)
        ]

        self.hits = 0
        self.misses = 0
        self.evictions = 0
        self.compulsory_misses = 0
        self.capacity_misses = 0
        self.conflict_misses = 0

    def _create_policy(self, name: str, ways: int) -> ReplacementPolicy:
        if name == "lru":
            return LRUPolicy(ways)
        elif name == "fifo":
            return FIFOPolicy(ways)
        elif name == "lfu":
            return LFUPolicy(ways)
        elif name == "clock":
            return ClockPolicy(ways)
        elif name == "belady":
            return BeladyMinPolicy(ways)
        else:
            raise ValueError(f"Unknown replacement policy: {name}")

    def run_trace(self, memory_operations: List[str | int], max_events_to_record: int = 500) -> Dict[str, Any]:
        """
        Executes a sequence of memory operations.
        Operations can be:
        - raw ints (e.g. 0x7ffe82100000)
        - hex strings (e.g. '0x7ffe82100000')
        - operation tuples or strings (e.g. 'READ 0x7ffe82100000')
        """
        # If policy is Belady MIN, pre-feed the full block address trace
        if isinstance(self.policy, BeladyMinPolicy):
            block_trace = []
            for op in memory_operations:
                addr_str = op.split()[-1] if isinstance(op, str) and (" " in op) else op
                dec = self.decoder.decode(addr_str)
                block_trace.append(dec.block_address)
            self.policy.set_future_trace(block_trace)

        events: List[StepEvent] = []

        for step, op in enumerate(memory_operations):
            op_type = "READ"
            addr_str = op
            if isinstance(op, str) and " " in op:
                parts = op.strip().split()
                if len(parts) >= 2:
                    op_type = parts[0].upper()
                    addr_str = parts[1]

            decoded = self.decoder.decode(addr_str)
            set_lines = self.sets[decoded.set_index]

            # 1. Search for HIT in the indexed set
            hit_way = None
            for w, line in enumerate(set_lines):
                if line.valid and line.tag == decoded.tag:
                    hit_way = w
                    break

            evicted_addr = None
            evicted_tag = None
            miss_type = None

            if hit_way is not None:
                # HIT!
                self.hits += 1
                self.policy.on_hit(decoded.set_index, hit_way, step)
                self.classifier.record_hit(decoded.block_address)
                target_way = hit_way
                result = "HIT"
                if op_type == "WRITE":
                    set_lines[hit_way].dirty = True
            else:
                # MISS!
                self.misses += 1
                result = "MISS"
                miss_type = self.classifier.classify_miss(decoded.block_address)
                if miss_type == "COMPULSORY":
                    self.compulsory_misses += 1
                elif miss_type == "CAPACITY":
                    self.capacity_misses += 1
                elif miss_type == "CONFLICT":
                    self.conflict_misses += 1

                # Check for an empty way first
                empty_way = None
                for w, line in enumerate(set_lines):
                    if not line.valid:
                        empty_way = w
                        break

                if empty_way is not None:
                    target_way = empty_way
                    self.policy.on_miss_insert(decoded.set_index, target_way, step)
                else:
                    # Cache set is full -> EVICTION required!
                    self.evictions += 1
                    target_way = self.policy.select_victim(decoded.set_index, set_lines, step)
                    victim = set_lines[target_way]
                    evicted_addr = f"0x{victim.block_address:016x}"
                    evicted_tag = f"0x{victim.tag:x}"
                    self.policy.on_miss_insert(decoded.set_index, target_way, step)

                # Populate the line
                set_lines[target_way].valid = True
                set_lines[target_way].tag = decoded.tag
                set_lines[target_way].block_address = decoded.block_address
                set_lines[target_way].dirty = (op_type == "WRITE")

            # Record step event if within sample limit
            if step < max_events_to_record:
                snapshot = [
                    {
                        "way": w,
                        "valid": line.valid,
                        "tag": f"0x{line.tag:x}" if line.valid else "---",
                        "block_addr": f"0x{line.block_address:016x}" if line.valid else "---",
                        "dirty": line.dirty
                    }
                    for w, line in enumerate(set_lines)
                ]
                events.append(StepEvent(
                    step=step,
                    operation=op_type,
                    address=decoded.hex_address,
                    raw_address=decoded.raw_address,
                    tag=decoded.tag_hex,
                    set_index=decoded.set_index,
                    offset=decoded.offset_hex,
                    result=result,
                    miss_type=miss_type,
                    way_index=target_way,
                    evicted_address=evicted_addr,
                    evicted_tag=evicted_tag,
                    dirty=set_lines[target_way].dirty,
                    cache_set_snapshot=snapshot
                ))

        total_accesses = self.hits + self.misses
        hit_rate = (self.hits / total_accesses * 100) if total_accesses > 0 else 0.0
        miss_rate = (self.misses / total_accesses * 100) if total_accesses > 0 else 0.0

        amat = AMATCalculator.calculate(
            self.hits, self.misses,
            self.config.hit_time_cycles,
            self.config.miss_penalty_cycles
        )

        return {
            "policy": self.policy_name.upper(),
            "geometry": {
                "capacity_kb": self.config.capacity_bytes // 1024,
                "block_size_bytes": self.config.block_size_bytes,
                "associativity": self.config.associativity,
                "num_sets": self.config.num_sets,
                "num_lines": self.config.num_lines,
                "tag_bits": self.config.tag_bits,
                "index_bits": self.config.index_bits,
                "offset_bits": self.config.offset_bits
            },
            "summary": {
                "total_accesses": total_accesses,
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate_pct": round(hit_rate, 2),
                "miss_rate_pct": round(miss_rate, 2),
                "evictions": self.evictions,
                "compulsory_misses": self.compulsory_misses,
                "capacity_misses": self.capacity_misses,
                "conflict_misses": self.conflict_misses,
                "amat_cycles": amat.amat_cycles,
                "amat_formula": amat.formula_str
            },
            "events_sample": [asdict(e) for e in events]
        }

