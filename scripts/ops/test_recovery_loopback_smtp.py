import unittest
from unittest.mock import MagicMock
from recovery_loopback_smtp import deliver, MAX_BYTES

SENDER = "sender@example.test"
ARGS = ["-t", "-i", "-f", SENDER]
MESSAGE = b"From: Variety Groceries <sender@example.test>\r\nTo: <recipient@example.test>\r\nSubject: Test\r\n\r\nExample\r\n"

class TransportTest(unittest.TestCase):
    def test_uses_loopback_and_exact_envelope(self):
        factory = MagicMock()
        smtp = factory.return_value.__enter__.return_value
        smtp.sendmail.return_value = {}
        deliver(ARGS, MESSAGE, SENDER, factory)
        factory.assert_called_once_with("127.0.0.1", 25, timeout=8)
        smtp.sendmail.assert_called_once_with(SENDER, ["recipient@example.test"], MESSAGE)

    def test_rejects_invalid_messages_before_smtp(self):
        factory = MagicMock()
        for args, raw in [(ARGS + ["extra"], MESSAGE), (ARGS, b"x"*(MAX_BYTES+1)), (ARGS, MESSAGE.replace(b"Subject:", b"Bcc: other@example.test\r\nSubject:")), (ARGS, MESSAGE.replace(b"recipient@example.test", b"recipient@example.test>, <other@example.test")), (ARGS, MESSAGE.replace(b"sender@example.test", b"other@example.test"))]:
            with self.subTest(raw=raw[:80]):
                with self.assertRaises(ValueError):
                    deliver(args, raw, SENDER, factory)
        factory.assert_not_called()

    def test_smtp_rejection_is_failure(self):
        factory = MagicMock()
        factory.return_value.__enter__.return_value.sendmail.return_value = {"recipient@example.test": (550, b"rejected")}
        with self.assertRaises(RuntimeError):
            deliver(ARGS, MESSAGE, SENDER, factory)

if __name__ == "__main__":
    unittest.main()
