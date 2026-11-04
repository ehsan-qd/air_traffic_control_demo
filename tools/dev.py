"""Run the live demonstrator without changing the presentation app."""

import os
import signal
import subprocess
import time
from contextlib import suppress
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    processes = []
    exit_code = 0

    def interrupt(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupt)
    try:
        env = {**os.environ, "PYTHONUNBUFFERED": "1"}
        processes.append(
            subprocess.Popen(
                [
                    "uv",
                    "run",
                    "uvicorn",
                    "nat_demo.api.app:create_app",
                    "--factory",
                    "--reload",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8765",
                ],
                cwd=ROOT / "backend",
                env=env,
                start_new_session=True,
            )
        )
        processes.append(
            subprocess.Popen(
                ["npm", "run", "dev"], cwd=ROOT / "web", env=env, start_new_session=True
            )
        )
        print(
            "\nLive demonstrator: http://127.0.0.1:5173\nBackend: http://127.0.0.1:8765/api/health\nCtrl+C stops both.\n",
            flush=True,
        )
        while all(process.poll() is None for process in processes):
            time.sleep(0.25)
        exit_code = 1
        print("A development service stopped. Stopping the other service.", flush=True)
    except KeyboardInterrupt:
        pass
    finally:
        for process in processes:
            if process.poll() is None:
                with suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGTERM)
        for process in processes:
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                with suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
