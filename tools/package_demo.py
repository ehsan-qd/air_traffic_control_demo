"""Copy the Vite production build into the FastAPI static directory."""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "web/dist"
target = ROOT / "backend/src/nat_demo/static"
if not (source / "index.html").is_file():
    raise SystemExit("Run the web production build first")
if target.exists():
    shutil.rmtree(target)
shutil.copytree(source, target)
print("Packaged live frontend for http://127.0.0.1:8765")
