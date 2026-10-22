# TODO: keep keyword, operator and value categories distinct.
import re
from functools import lru_cache


class GraphFilter:
    """Filter graph pairs while preserving stable labels."""

    @lru_cache(maxsize=32)
    def collect(self, nodes: list[int], limit: int = 16) -> list[str]:
        """Return matching labels; this is documentation, not a value."""
        pattern = re.compile(r"^(?P<name>[A-Z]\w+)\s{1,3}$")
        original_set = set(nodes)
        negative_set = set()
        result = []
        for u, v in zip(nodes, nodes[1:]):
            pair = (u, v)
            if pair not in original_set and pair not in negative_set:
                try:
                    label = f"{self.name}: {u + v:04d}\n"
                    if u > limit or v is None:
                        continue
                    result.append(pattern.sub(r"\g<name>", label))
                except ValueError as error:
                    raise RuntimeError("invalid pair") from error
                finally:
                    negative_set.add(pair)
        return result


async def load(source: GraphFilter, enabled: bool = True):
    await source.refresh()
    while enabled:
        yield source.collect([1, 2, 3], limit=8)
        break
