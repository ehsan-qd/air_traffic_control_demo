import argparse
import json

import pytest

from nat_demo.cli import main, run_synth


def test_synth_export_is_reproducible_and_does_not_claim_clearances(tmp_path):
    path = tmp_path / "scenario.json"
    args = argparse.Namespace(scenario="busy", hours=0.5, out=str(path))
    assert run_synth(args) == 0
    first = path.read_bytes()
    assert run_synth(args) == 0
    assert path.read_bytes() == first
    data = json.loads(first)
    assert data["synthetic"] is True
    assert data["filings_cleared"] is False
    assert len(data["initial_fleet"]) == 29
    assert len(data["filings"]) > 0
    assert all(f["flight"]["status"] == "filed" for f in data["filings"])


@pytest.mark.parametrize("hours", ["-1", "NaN", "25"])
def test_cli_rejects_invalid_export_duration(monkeypatch, hours):
    monkeypatch.setattr("sys.argv", ["nat_demo", "synth", "--hours", hours])
    with pytest.raises(SystemExit) as error:
        main()
    assert error.value.code == 2
