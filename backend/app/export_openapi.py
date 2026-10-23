"""Write the API contract to docs/openapi.json. CI fails if it is out of date."""

import json
import sys
from pathlib import Path

from .main import app

out = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"
spec = json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"
if "--check" in sys.argv:
    sys.exit(0 if out.exists() and out.read_text(encoding="utf-8") == spec else "docs/openapi.json is stale")
out.write_text(spec, encoding="utf-8")
