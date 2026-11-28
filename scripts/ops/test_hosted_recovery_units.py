import configparser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "deploy" / "systemd"

class HostedRecoveryUnitTests(unittest.TestCase):
    def parse(self, suffix):
        p = configparser.ConfigParser(interpolation=None, strict=False)
        p.optionxform = str
        path = UNITS / ("varietygroceries-hosted-payment-recovery." + suffix)
        p.read(path)
        return p, path.read_text()

    def test_service_has_explicit_approval_and_default_off(self):
        p, raw = self.parse("service")
        self.assertEqual(p["Unit"]["ConditionPathExists"], "/etc/varietygroceries/hosted-recovery.approved")
        self.assertEqual(p["Service"]["Environment"], "HUBTEL_HOSTED_RECONCILIATION_WORKER_ENABLED=false")
        self.assertEqual([l for l in raw.splitlines() if l.startswith("EnvironmentFile=")], [
            "EnvironmentFile=/etc/varietygroceries/api.env",
            "EnvironmentFile=/etc/varietygroceries/hosted-recovery.env",
        ])
        self.assertNotIn("[Install]", raw)
        self.assertEqual(p["Service"]["Type"], "oneshot")
        self.assertEqual(p["Service"]["ExecStart"], "/usr/bin/node dist/scripts/recover-hosted-payments.js")

    def test_unit_is_bounded_and_hardened(self):
        p, _ = self.parse("service")
        s = p["Service"]
        self.assertNotEqual(s["User"], "root")
        self.assertEqual(s["TimeoutStartSec"], "15min")
        self.assertEqual(s["NoNewPrivileges"], "true")
        self.assertEqual(s["ProtectSystem"], "strict")
        self.assertEqual(s["ProtectHome"], "read-only")
        self.assertNotIn("Restart", s)

    def test_timer_is_completion_relative_and_no_replay(self):
        p, _ = self.parse("timer")
        t = p["Timer"]
        self.assertEqual(t["OnUnitInactiveSec"], "1min")
        self.assertEqual(t["Persistent"], "false")
        self.assertEqual(t["Unit"], "varietygroceries-hosted-payment-recovery.service")
        self.assertNotIn("OnCalendar", t)
        self.assertNotIn("OnUnitActiveSec", t)

if __name__ == "__main__":
    unittest.main()
