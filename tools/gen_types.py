"""Generate the TS contract from the Pydantic message and control models."""

import json
import subprocess
from pathlib import Path

from pydantic import BaseModel

from nat_demo.api.messages import ControlRequest, ServerEvent, WindGrid

ROOT = Path(__file__).resolve().parents[1]


class Contract(BaseModel):
    event: ServerEvent
    control: ControlRequest
    wind: WindGrid


def main():
    cache = ROOT / ".cache"
    cache.mkdir(exist_ok=True)
    schema = cache / "api.schema.json"
    schema.write_text(json.dumps(Contract.model_json_schema(), indent=2))
    subprocess.run(
        [
            str(ROOT / "web/node_modules/.bin/json2ts"),
            "-i",
            str(schema),
            "-o",
            str(ROOT / "web/src/api/types.gen.ts"),
            "--unreachableDefinitions",
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
