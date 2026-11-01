from dataclasses import dataclass
from .cache_config import CacheConfig

@dataclass
class DecodedAddress:
    raw_address: int
    hex_address: str
    tag: int
    set_index: int
    offset: int
    tag_hex: str
    set_index_bin: str
    offset_hex: str
    block_address: int # Address with offset zeroed out

class AddressDecoder:
    def __init__(self, config: CacheConfig):
        self.config = config
        self.offset_mask = (1 << config.offset_bits) - 1
        self.index_mask = ((1 << config.index_bits) - 1) if config.index_bits > 0 else 0

    def decode(self, address_input: int | str) -> DecodedAddress:
        if isinstance(address_input, str):
            clean = address_input.strip()
            addr_int = int(clean, 16) if clean.startswith(("0x", "0X")) else int(clean)
        else:
            addr_int = int(address_input)

        offset = addr_int & self.offset_mask
        set_index = (addr_int >> self.config.offset_bits) & self.index_mask if self.config.index_bits > 0 else 0
        tag = addr_int >> (self.config.offset_bits + self.config.index_bits)
        block_address = addr_int & ~self.offset_mask

        return DecodedAddress(
            raw_address=addr_int,
            hex_address=f"0x{addr_int:016x}",
            tag=tag,
            set_index=set_index,
            offset=offset,
            tag_hex=f"0x{tag:x}",
            set_index_bin=f"{set_index:0{max(1, self.config.index_bits)}b}",
            offset_hex=f"0x{offset:02x}",
            block_address=block_address
        )

