"""Offline validation of exact-path Hubtel webhook Nginx rollout.

All filesystem writes occur in disposable temporary directories; never touch
the real canonical VPS Nginx configuration while running this suite.
"""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

script = Path(__file__).resolve().parents[1] / "deploy/scripts/apply-hubtel-callback-ingress.py"
spec = importlib.util.spec_from_file_location("vg_hubtel_ingress", script)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

SNIPPET = module.SOURCE.read_text(encoding="utf8")
CANONICAL = (
    "server {\n"
    "    listen 443 ssl;\n"
    "    server_name portal.varietygroceries.com;\n"
    "    include /usr/local/apps/nginx/etc/conf.d/includes/varietygroceries-product-media.conf;\n"
    "    location /api/v1/ { proxy_pass http://127.0.0.1:3049; }\n"
    "    location / { proxy_pass http://127.0.0.1:3052; }\n"
    "}\n"
)


class HubtelCallbackIngressTests(unittest.TestCase):
    def test_single_exact_path_and_hosted_hubtel_ip_only(self):
        output = module.validate(CANONICAL, SNIPPET)
        self.assertEqual(output.count(module.INCLUDE), 1)
        self.assertIn("allow 108.129.40.25;", SNIPPET)
        self.assertIn("deny all;", SNIPPET)
        self.assertIn("location = /api/v1/payments/providers/hubtel/events {", SNIPPET)
        self.assertIn("limit_except POST { deny all; }", SNIPPET)
        self.assertIn("proxy_set_header X-Forwarded-For $remote_addr;", SNIPPET)
        self.assertNotIn("$proxy_add_x_forwarded_for", SNIPPET)
        self.assertNotIn("$http_x_forwarded_for", SNIPPET)
        self.assertEqual(output.replace(module.INCLUDE, ""), CANONICAL)

    def test_unknown_upstreams_or_missing_host_refuse_changes(self):
        for unsafe in (
            CANONICAL.replace(":3049;", ":3027;"),
            CANONICAL.replace(":3052;", ":3037;"),
            CANONICAL.replace("portal.varietygroceries.com", "varietygroceries.com"),
            CANONICAL.replace(module.ANCHOR, ""),
        ):
            with self.subTest(unsafe=unsafe):
                with self.assertRaises(ValueError):
                    module.validate(unsafe, SNIPPET)

    def test_rejects_spoofable_or_open_ingress(self):
        for unsafe in (
            SNIPPET.replace("108.129.40.25", "0.0.0.0/0"),
            SNIPPET.replace("deny all;", "allow all;", 1),
            SNIPPET.replace("limit_except POST { deny all; }", ""),
            SNIPPET.replace("$remote_addr;", "$proxy_add_x_forwarded_for;", 1),
            SNIPPET.replace("proxy_pass http://127.0.0.1:3049;", "proxy_pass http://127.0.0.1:3027;"),
        ):
            with self.subTest(unsafe=unsafe[:120]):
                with self.assertRaises(ValueError):
                    module.validate(CANONICAL, unsafe)

    def setup_temp(self, base: Path):
        cfg = base / "canonical.conf"
        cfg.write_text(CANONICAL, encoding="utf8")
        src = base / "source.conf"
        src.write_text(SNIPPET, encoding="utf8")
        dest = base / "private-include.conf"
        backups = base / "backups"
        backups.mkdir(mode=0o700)
        return cfg, dest, backups, src

    def test_staged_apply_creates_backup_only_and_is_idempotent(self):
        with tempfile.TemporaryDirectory(prefix="vg-hubtel-ingress-test-") as folder:
            cfg, dest, backups, src = self.setup_temp(Path(folder))
            with patch.object(module, "command") as runner:
                result = module.apply(canonical=cfg, dest=dest, backups=backups, source=src)
                self.assertIn("INSTALLED", result)
                self.assertEqual(runner.call_count, 3)
                self.assertIn(module.INCLUDE, cfg.read_text(encoding="utf8"))
                self.assertEqual(dest.read_text(encoding="utf8"), SNIPPET)
                self.assertEqual(len(list(backups.iterdir())), 1)
                backup = list(backups.iterdir())[0]
                self.assertEqual(backup.read_text(encoding="utf8"), CANONICAL)
                self.assertEqual(os.stat(backup).st_mode & 0o777, 0o600)
                self.assertEqual(module.apply(canonical=cfg, dest=dest, backups=backups, source=src).split(":")[0], "ALREADY INSTALLED")
                self.assertEqual(runner.call_count, 3)

    def test_failed_nginx_syntax_check_rolls_back_exactly(self):
        with tempfile.TemporaryDirectory(prefix="vg-hubtel-ingress-fail-") as folder:
            cfg, dest, backups, src = self.setup_temp(Path(folder))
            actions = 0

            def reject_after_install(*argv):
                nonlocal actions
                actions += 1
                if actions == 2:
                    raise RuntimeError("Simulated nginx -t failed")

            with patch.object(module, "command", side_effect=reject_after_install):
                with self.assertRaises(RuntimeError):
                    module.apply(canonical=cfg, dest=dest, backups=backups, source=src)
            self.assertEqual(cfg.read_text(encoding="utf8"), CANONICAL)
            self.assertFalse(dest.exists())
            self.assertEqual(list(backups.iterdir())[0].read_text(encoding="utf8"), CANONICAL)


if __name__ == "__main__":
    unittest.main()
