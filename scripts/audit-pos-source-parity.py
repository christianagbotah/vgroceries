#!/usr/bin/env python3
"""Read-only file-level POS staging/canonical parity inventory.

Only allowlisted source filenames and their hashes are inspected. Never reads
secrets, API credentials, database rows, or service process settings.
This is NOT proof of runtime parity or deployment authorization.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

SCOPES = {
    "frontend_pages": "src/app/**/page.tsx",
    "api_controllers": "apps/api/src/**/*controller.ts",
    "shared_contracts": "packages/contracts/src/**/*.ts",
}

def git_detail(root: Path) -> dict:
    base = ["git", "-c", f"safe.directory={root}", "-C", str(root)]
    def run(*args: str) -> str | None:
        proc = subprocess.run(base + list(args), capture_output=True, text=True)
        return proc.stdout.strip() if proc.returncode == 0 else None
    head = run("rev-parse", "HEAD")
    status = run("status", "--porcelain", "--untracked-files=normal")
    return {
        "head": head if head and len(head) == 40 else None,
        "uncommitted_path_count": len(status.splitlines()) if status else (0 if status == "" else None),
        "working_tree_clean": status == "" if status is not None else None,
    }

def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fp:
        for chunk in iter(lambda: fp.read(131072), b""):
            h.update(chunk)
    return h.hexdigest()

def collect(root: Path, pattern: str) -> dict[str, str]:
    return {
        file.relative_to(root).as_posix(): digest(file)
        for file in sorted(root.glob(pattern))
        if file.is_file() and not file.is_symlink()
    }

def audit(canonical: Path, pos: Path) -> dict:
    scopes = {}
    for name, pattern in SCOPES.items():
        a, b = collect(canonical, pattern), collect(pos, pattern)
        sa, sb = set(a), set(b)
        common = sa & sb
        scopes[name] = {
            "canonical_file_count": len(a),
            "pos_file_count": len(b),
            "canonical_only": sorted(sa - sb),
            "pos_only": sorted(sb - sa),
            "different_common": sorted(path for path in common if a[path] != b[path]),
            "identical_common_count": sum(a[p] == b[p] for p in common),
        }
    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "canonical_root": str(canonical), "pos_root": str(pos),
        "canonical_git": git_detail(canonical), "pos_git": git_detail(pos),
        "scopes": scopes, "release_authorized": False,
        "limitation": "File-level inventory only. Page/controller counts are not route equivalence. Hashes cannot prove auth, stock, payments, database or runtime parity.",
    }

def code(value: object) -> str:
    return chr(96) + str(value) + chr(96)

def render_markdown(data: dict, max_paths: int) -> str:
    lines = [
        "# Variety Groceries — POS/canonical source parity snapshot", "",
        "Generated UTC: " + data["generated_at_utc"], "",
        "**Read-only inventory; NOT release approval.** Preserve live POS staging upstreams 3049/3052.", "",
        "- Canonical: " + code(data["canonical_root"]) + ", commit " +
            code(data["canonical_git"]["head"]) + ", uncommitted paths: " +
            code(data["canonical_git"]["uncommitted_path_count"]),
        "- POS staging: " + code(data["pos_root"]) + ", commit " +
            code(data["pos_git"]["head"]) + ", uncommitted paths: " +
            code(data["pos_git"]["uncommitted_path_count"]), "",
        "| Scope | Canonical files | POS files | Canonical only | POS only | Different shared | Identical shared |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for scope, row in data["scopes"].items():
        lines.append(
            f"| {scope.replace('_', ' ')} | {row['canonical_file_count']} | {row['pos_file_count']} | " +
            f"{len(row['canonical_only'])} | {len(row['pos_only'])} | " +
            f"{len(row['different_common'])} | {row['identical_common_count']} |"
        )
    lines += ["", "## Allowlisted path differences only", ""]
    for scope, row in data["scopes"].items():
        lines += ["### " + scope.replace("_", " ").title(), ""]
        for label, kind in (
            ("Only POS", "pos_only"),
            ("Only canonical", "canonical_only"),
            ("Different content in both", "different_common"),
        ):
            paths = row[kind]
            lines.append(f"**{label} ({len(paths)}):**")
            displayed = paths if max_paths == 0 else paths[:max_paths]
            lines += ["- " + code(p) for p in displayed] or ["- None"]
            if len(paths) > len(displayed):
                lines.append(f"- ...and {len(paths) - len(displayed)} more paths (use --max-paths 0)")
            lines.append("")
    lines += [
        "## Mandatory human review", "",
        "NO-GO without a separate full route/service/DB/schema/UAT/restore parity review. " +
        "Compare POS-only features, role and payment guards, reconcile pending local edits, " +
        "and retain an isolated tested rollback.", "",
        "Limitation: " + data["limitation"], "",
    ]
    return "\n".join(lines)

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--canonical", type=Path, required=True)
    parser.add_argument("--pos", type=Path, required=True)
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--max-paths", type=int, default=40)
    parser.add_argument("--require-parity", action="store_true",
                        help="exit 3 on source differences or dirty/unavailable git status")
    args = parser.parse_args()
    if args.max_paths < 0:
        parser.error("--max-paths must be 0 or positive")
    a, b = args.canonical.resolve(), args.pos.resolve()
    for label, root in (("canonical", a), ("POS", b)):
        if not root.is_dir() or not (root / "src/app").is_dir() or not (root / "apps/api/src").is_dir():
            parser.error(label + " must be a readable source tree")
    if a == b:
        parser.error("canonical and POS must be different trees")
    data = audit(a, b)
    result = json.dumps(data, indent=2) + "\n" if args.format == "json" else render_markdown(data, args.max_paths)
    if args.output:
        args.output.write_text(result, encoding="utf-8")
    else:
        print(result, end="")
    different = any(r["canonical_only"] or r["pos_only"] or r["different_common"]
                    for r in data["scopes"].values())
    dirty = any(data[k]["working_tree_clean"] is not True
                for k in ("canonical_git", "pos_git"))
    return 3 if args.require_parity and (different or dirty) else 0

if __name__ == "__main__":
    sys.exit(main())
