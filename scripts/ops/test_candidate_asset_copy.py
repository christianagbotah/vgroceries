"""Exercise the actual CI asset-copy block against disposable build trees."""
import pathlib
import subprocess
import tempfile
import textwrap
import unittest

WORKFLOW = pathlib.Path(__file__).resolve().parents[2] / ".github/workflows/ci.yml"


class CandidateAssetCopyTest(unittest.TestCase):
    def test_copy_preserves_assets_without_nested_duplicate_directories(self):
        workflow = WORKFLOW.read_text()
        start = workflow.index("          mkdir -p candidate/payload/.next candidate/evidence")
        end = workflow.index("          # Fail closed", start)
        commands = textwrap.dedent(workflow[start:end])
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for name, data in {
                ".next/static/chunks/app.js": b"javascript",
                ".next/static/.keep": b"hidden asset",
                "public/images/logo.svg": b"logo",
                "public/.well-known/check": b"public metadata",
                ".next/standalone/server.js": b"server",
                ".next/standalone/.next/static/chunks/app.js": b"javascript",
                ".next/standalone/public/images/logo.svg": b"logo",
            }.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            subprocess.run(["bash", "-euo", "pipefail", "-c", commands], cwd=root, check=True)
            payload = root / "candidate/payload"
            self.assertFalse((payload / ".next/static/static").exists())
            self.assertFalse((payload / "public/public").exists())
            self.assertEqual((payload / "server.js").read_bytes(), b"server")
            for source, destination in [(".next/static", ".next/static"), ("public", "public")]:
                expected = root / source
                actual = payload / destination
                self.assertEqual(
                    {p.relative_to(expected): p.read_bytes() for p in expected.rglob("*") if p.is_file()},
                    {p.relative_to(actual): p.read_bytes() for p in actual.rglob("*") if p.is_file()},
                )


if __name__ == "__main__":
    unittest.main()
