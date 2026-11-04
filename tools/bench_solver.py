"""One measured CPU insertion; JIT is reported separately."""

import json
import time

from nat_demo.config import load_config
from nat_demo.sim.insertion import insert
from nat_demo.sim.world import World
from nat_demo.solvers.pbit_emulator import warmup

started = time.perf_counter()
warmup()
jit_ms = (time.perf_counter() - started) * 1000
world = World(load_config(), "hero_crossing")
flight = world.file_flight(True, {"callsign": "XAT417"})
started = time.perf_counter()
record, _ = insert(world, flight, lambda *_: None)
print(
    json.dumps(
        {
            "backend": "pbit_emulator",
            "formulation": "candidate_path",
            "jit_startup_ms": jit_ms,
            "total_insertion_ms": (time.perf_counter() - started) * 1000,
            "verified": record.verified,
            "metrics": record.metrics.model_dump(),
        },
        indent=2,
    )
)
