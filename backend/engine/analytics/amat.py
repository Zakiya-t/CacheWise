from dataclasses import dataclass

@dataclass
class AMATResult:
    hit_time_cycles: float
    miss_penalty_cycles: float
    hit_rate_pct: float
    miss_rate_pct: float
    amat_cycles: float
    formula_str: str

class AMATCalculator:
    @staticmethod
    def calculate(
        hits: int,
        misses: int,
        hit_time_cycles: float = 4.0,
        miss_penalty_cycles: float = 100.0
    ) -> AMATResult:
        total = hits + misses
        if total == 0:
            return AMATResult(hit_time_cycles, miss_penalty_cycles, 0.0, 0.0, hit_time_cycles, "No accesses")

        miss_rate = misses / total
        hit_rate = hits / total
        amat = hit_time_cycles + (miss_rate * miss_penalty_cycles)

        formula = f"{hit_time_cycles:.1f} + ({miss_rate:.4f} × {miss_penalty_cycles:.1f}) = {amat:.2f} cycles"

        return AMATResult(
            hit_time_cycles=hit_time_cycles,
            miss_penalty_cycles=miss_penalty_cycles,
            hit_rate_pct=round(hit_rate * 100, 2),
            miss_rate_pct=round(miss_rate * 100, 2),
            amat_cycles=round(amat, 2),
            formula_str=formula
        )

