import json

import pytest
from fastapi.testclient import TestClient

from nat_demo.api.app import create_app
from nat_demo.api.messages import ServerEvent


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("NAT_DEMO_SCENARIO", "hero_crossing")
    monkeypatch.setattr("nat_demo.sim.recorder.ROOT", tmp_path)
    with TestClient(create_app()) as client:
        yield client


def test_state_wind_and_input_validation(client):
    health = client.get("/api/health").json()
    assert health["status"] == "ok"
    assert health["synthetic"] is True
    assert health["encoding"] == "candidate_path"
    world = client.get("/api/state").json()
    assert world["running"] is False
    assert world["sim_time_s"] == 0
    assert len(world["flights"]) == 29
    assert world["separation_losses"] == 0
    grid = client.get("/api/wind/grid?t=0").json()
    assert len(grid["u_ms"]) == len(grid["v_ms"]) == 61 * 27
    assert client.get("/api/wind/grid?t=NaN").status_code == 422
    assert client.post("/api/control", json={"action": "speed", "speed": 7}).status_code == 422
    assert client.post("/api/control", json={"action": "pause", "extra": 1}).status_code == 422
    assert (
        client.post("/api/control", json={"action": "reset", "scenario": "../../bad"}).status_code
        == 422
    )
    assert client.get("/api/state").json() == world


def test_clock_controls_and_seeded_reset(client):
    initial = client.get("/api/state").json()
    assert client.post("/api/control", json={"action": "step"}).status_code == 200
    assert client.get("/api/state").json()["sim_time_s"] == 5
    assert client.post("/api/control", json={"action": "speed", "speed": 300}).status_code == 200
    assert client.post("/api/control", json={"action": "play"}).status_code == 200
    assert client.post("/api/control", json={"action": "step"}).status_code == 409
    assert client.post("/api/control", json={"action": "pause"}).status_code == 200
    assert (
        client.post(
            "/api/control", json={"action": "reset", "scenario": "hero_crossing"}
        ).status_code
        == 200
    )
    assert client.get("/api/state").json() == initial


def test_real_streamed_insertion_is_verified_and_recorded(client):
    with client.websocket_connect("/ws", headers={"origin": "http://127.0.0.1:5173"}) as websocket:
        hello = websocket.receive_json()
        ServerEvent.model_validate(hello)
        assert hello["type"] == "hello"
        assert hello["data"]["history"] == []
        assert (
            client.post(
                "/api/control", json={"action": "file_flight", "conflict": True}
            ).status_code
            == 200
        )
        assert client.post("/api/control", json={"action": "reset"}).status_code == 409
        events = []
        for _ in range(600):
            event = websocket.receive_json()
            ServerEvent.model_validate(event)
            events.append(event)
            if event["type"] in ("clearance_issued", "controller_attention"):
                break
        else:
            pytest.fail("Insertion did not finish within 600 streamed events")
        record = events[-1]["data"]["record"]
        assert events[-1]["type"] == "clearance_issued"
        assert record["verified"] is True
        assert record["callsign"] == "XAT417"
        assert len(record["message"]) == 2
        assert record["metrics"]["n_conflict_pairs"] > 0
        assert record["metrics"]["t_solve_ms"] > 0
        assert record["metrics"]["n_vars"] > 1
        assert abs(record["metrics"]["arrival_dev_min"]) <= 10
        assert any(event["type"] == "solve_progress" for event in events)
        sequences = [event["sequence"] for event in events]
        assert sequences == sorted(set(sequences))
        assert record["snapshot"]["sim_time_s"] == 0
        assert record["snapshot"]["separation_losses"] == 0
    lines = client.get("/api/recording").text.splitlines()
    header = json.loads(lines[0])
    assert header["type"] == "recording_header"
    assert len(header["config_sha256"]) == 64
    assert any(json.loads(line)["type"] == "clearance_issued" for line in lines[1:])
    with client.websocket_connect("/ws") as reconnect:
        restored = reconnect.receive_json()["data"]
        assert restored["history"][-1]["id"] == record["id"]
        assert restored["solve"]["callsign"] == "XAT417"


def test_backend_failure_never_issues_clearance(client, monkeypatch):
    def unavailable(*args):
        raise RuntimeError("ORBIT hardware is not connected")

    monkeypatch.setattr("nat_demo.api.app.insert", unavailable)
    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()
        client.post("/api/control", json={"action": "file_flight"})
        for _ in range(100):
            event = websocket.receive_json()
            assert event["type"] != "clearance_issued"
            if event["type"] == "controller_attention":
                record = event["data"]["record"]
                assert record["verified"] is False
                assert record["outcome"] == "error"
                assert record["trajectory"] is None
                assert record["message"][0] == "NO CLEARANCE ISSUED"
                flight = next(
                    f for f in event["data"]["world"]["flights"] if f["id"] == record["flight_id"]
                )
                assert flight["status"] == "held"
                break
        else:
            pytest.fail("Backend error was not surfaced")


def test_websocket_rejects_unrelated_browser_origin(client):
    from starlette.websockets import WebSocketDisconnect

    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/ws", headers={"origin": "https://example.com"}),
    ):
        pytest.fail("An unrelated browser origin was accepted")


def test_explicit_hosted_origin_supports_cors_and_websocket(monkeypatch, tmp_path):
    origin = "https://nats.example.com"
    monkeypatch.setenv("NAT_ALLOWED_ORIGINS", origin)
    monkeypatch.setenv("NAT_DEMO_SCENARIO", "hero_crossing")
    monkeypatch.setattr("nat_demo.sim.recorder.ROOT", tmp_path)
    with TestClient(create_app()) as remote:
        response = remote.options(
            "/api/control",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
        assert (
            "access-control-allow-origin"
            not in remote.get(
                "/api/health", headers={"Origin": "https://unrelated.example.com"}
            ).headers
        )
        with remote.websocket_connect("/ws", headers={"origin": origin}) as websocket:
            assert websocket.receive_json()["type"] == "hello"


def test_wildcard_origin_is_not_accepted(monkeypatch):
    monkeypatch.setenv("NAT_ALLOWED_ORIGINS", "*")
    with pytest.raises(ValueError, match="explicit browser origins"):
        create_app()
