"""Headless inspection of the same world and insertion pipeline as the UI."""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from nat_demo.config import SCENARIOS, load_config
from nat_demo.sim.insertion import insert
from nat_demo.sim.world import World
from nat_demo.solvers.pbit_emulator import warmup


def run_solve(args: argparse.Namespace) -> int:
    world = World(load_config(args.scenario), args.scenario)
    warmup()
    prefix = world.config.traffic.callsign_prefixes[0]
    params = {"callsign": f"{prefix}417", "conflict_with": f"{prefix}208"}
    first = next(
        (beat for beat in world.config.director.scripted_beats if beat.action == "file_flight"),
        None,
    )
    if first:
        params.update(first.params)
    flight = world.file_flight(True, params)

    def emit(kind, data):
        if args.verbose and kind == "pipeline_step":
            step = data["step"]
            print(
                f"{step['name']}: {step['status']} · {step['duration_ms']:.2f} ms · {step['detail']}",
                file=sys.stderr,
            )

    record, _ = insert(world, flight, emit)
    print(record.model_dump_json(indent=2, exclude={"snapshot"}))
    return 0 if record.verified else 2


def run_synth(args: argparse.Namespace) -> int:
    world = World(load_config(args.scenario), args.scenario)
    initial = [f.model_dump(mode="json") for f in world.view().flights]
    filings = []
    # Exported future filings are nominal requests, not issued clearances.
    while world.next_filing < args.hours * 3600:
        world.time_s = world.next_filing
        directed = (
            world.config.director.enabled
            and world.director_rng.random() < world.config.director.conflict_injection_probability
        )
        flight = world.file_flight(directed)
        filings.append(
            {
                "flight": world.view().flights[-1].model_dump(mode="json"),
                "nominal_trajectory": flight.nominal.payload(),
                "nominal_conflict_pairs": world.check(
                    flight.nominal, flight.scheduled_exit
                ).conflicting_pairs,
            }
        )
        world.next_filing += float(
            world.traffic_rng.exponential(3600 / world.config.traffic.filings_per_hour)
        )
    payload = {
        "synthetic": True,
        "scenario": args.scenario,
        "seed": world.config.seed,
        "initial_fleet_verified": True,
        "filings_cleared": False,
        "tracks": [track.model_dump() for track in world.tracks],
        "initial_fleet": initial,
        "filings": filings,
        "wind": world.wind.grid(0),
    }
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False))
    print(f"Wrote {len(initial)} initial flights and {len(filings)} synthetic filings to {path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="ORBIT NAT synthetic demonstrator")
    sub = parser.add_subparsers(dest="command", required=True)
    solve_parser = sub.add_parser("solve", help="Insert and independently verify one flight")
    solve_parser.add_argument("--scenario", choices=SCENARIOS, default="hero_crossing")
    solve_parser.add_argument("--verbose", action="store_true")
    synth_parser = sub.add_parser("synth", help="Export nominal synthetic data; no clearances")
    synth_parser.add_argument("--scenario", choices=SCENARIOS, default="busy")
    synth_parser.add_argument("--hours", type=float, default=3)
    synth_parser.add_argument("--out", default="../runs/busy_synth.json")
    args = parser.parse_args()
    if args.command == "synth":
        if not np.isfinite(args.hours) or not 0 <= args.hours <= 24:
            parser.error("--hours must be between 0 and 24")
        return run_synth(args)
    return run_solve(args)


if __name__ == "__main__":
    raise SystemExit(main())
