import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from nat_demo.config import ROOT, DemoConfig


class Recorder:
    def __init__(self, config: DemoConfig, scenario: str):
        folder = ROOT / "runs"
        folder.mkdir(exist_ok=True)
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S_%f")
        self.path = folder / f"{stamp}_{scenario}.jsonl"
        self.file = self.path.open("w", encoding="utf-8")
        resolved = config.model_dump(mode="json")
        encoded = json.dumps(resolved, sort_keys=True, separators=(",", ":"))
        self.write(
            {
                "type": "recording_header",
                "scenario": scenario,
                "config": resolved,
                "config_sha256": hashlib.sha256(encoded.encode()).hexdigest(),
                "git_commit": self._commit(),
                "formulation": "candidate_path",
                "replay_supported": False,
            }
        )

    @staticmethod
    def _commit() -> str:
        # The supplied folder may be nested under an unrelated home-directory
        # Git repository. Do not attribute that repository's commit to this app.
        git = ROOT / ".git"
        if not git.is_dir():
            return "unversioned"
        head = (git / "HEAD").read_text().strip()
        if head.startswith("ref: "):
            ref = git / head[5:]
            return ref.read_text().strip() if ref.exists() else "unversioned"
        return head

    def write(self, event: dict):
        self.file.write(json.dumps(event, separators=(",", ":"), allow_nan=False) + "\n")
        self.file.flush()

    def close(self):
        self.file.close()


def read_recording_header(path: Path) -> dict:
    with path.open() as file:
        return json.loads(next(file))
