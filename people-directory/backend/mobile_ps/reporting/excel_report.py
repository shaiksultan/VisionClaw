import json
from pathlib import Path


def create_excel_report(job_root: Path) -> Path:
    result = json.loads((job_root / "result.json").read_text(encoding="utf-8"))
    output = job_root / "reports" / f"{result['job_id']}-V4-placeholder.xlsx"
    output.write_text(
        "V4 not fully implemented. This placeholder was generated from result.json only.\n"
        + json.dumps(result.get("summary", {}), indent=2),
        encoding="utf-8",
    )
    return output
