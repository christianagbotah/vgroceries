"""Database-free, offline tests for the read-only merchant access probe."""
import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import Mock

MODULE = Path(__file__).with_name("probe-hubtel-transaction-status.py")
spec = importlib.util.spec_from_file_location("hubtel_probe", MODULE)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

SAMPLE = {
    "HUBTEL_SALES_API_ID": "test-api-id-not-real",
    "HUBTEL_SALES_API_KEY": "test-api-key-not-real",
    "HUBTEL_COLLECTION_ACCOUNT_NUMBER": "123456789",
}


class Response:
    def __init__(self, status):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None


class ProbeTests(unittest.TestCase):
    def test_one_get_only_to_fixed_official_host_without_mutation(self):
        seen = []
        def opener(req, *, timeout):
            seen.append((req, timeout))
            return Response(200)
        status, state, code = probe.check(SAMPLE, opener=opener)
        self.assertEqual((status, code), (200, 0))
        self.assertEqual(state, "ENDPOINT_REACHABLE_PAYMENT_NOT_VERIFIED")
        self.assertEqual(len(seen), 1)
        req, timeout = seen[0]
        self.assertEqual(req.get_method(), "GET")
        self.assertTrue(req.full_url.startswith("https://api-txnstatus.hubtel.com/transactions/123456789/status?"))
        self.assertIn("clientReference=VG-IP-ACCESS-DIAGNOSTIC", req.full_url)
        self.assertEqual(timeout, 15)
        self.assertTrue(req.get_header("Authorization").startswith("Basic "))
        self.assertNotIn(SAMPLE["HUBTEL_SALES_API_KEY"], req.full_url)

    def test_403_does_not_claim_allowlisting_or_merchant_scope(self):
        def denied(req, *, timeout):
            raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, io.BytesIO(b"private-error"))
        self.assertEqual(
            probe.check(SAMPLE, opener=denied),
            (403, "ACCESS_DENIED_IP_OR_MERCHANT_SCOPE", 3),
        )

    def test_known_status_codes_never_claim_payment_success(self):
        for status, expected in (
            (401, "UNAUTHORIZED_CREDENTIALS_OR_SCOPE"),
            (404, "NOT_FOUND_ACCESS_NOT_PROVEN"),
            (500, "HTTP_ERROR_ACCESS_NOT_PROVEN"),
        ):
            with self.subTest(status=status):
                result = probe.check(SAMPLE, opener=lambda req, timeout: Response(status))
                self.assertEqual(result[0], status)
                self.assertEqual(result[1], expected)
                self.assertNotEqual(result[2], 0)

    def test_transport_failure_is_inconclusive(self):
        def failure(req, *, timeout):
            raise TimeoutError("some potentially sensitive network error")
        self.assertEqual(
            probe.check(SAMPLE, opener=failure),
            (None, "TRANSPORT_ERROR_ACCESS_NOT_PROVEN", 6),
        )

    def test_protected_env_parses_only_expected_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "api.env"
            path.write_text(
                "# private server config\n"
                "HUBTEL_SALES_API_ID='test-api-id-not-real'\n"
                'HUBTEL_SALES_API_KEY="test-api-key-not-real"\n'
                "HUBTEL_COLLECTION_ACCOUNT_NUMBER=123456789\n"
                "EXTRA_SECRET=must-not-appear\n"
            )
            path.chmod(0o640)
            self.assertEqual(probe.load_protected_credentials(path), SAMPLE)

    def test_refuses_public_or_missing_environment_and_partial_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "api.env"
            with self.assertRaises(probe.ProbeInputError):
                probe.load_protected_credentials(path)
            path.write_text("HUBTEL_SALES_API_KEY=private\n")
            path.chmod(0o644)
            with self.assertRaises(probe.ProbeInputError):
                probe.load_protected_credentials(path)
            path.chmod(0o600)
            with self.assertRaises(probe.ProbeInputError):
                probe.load_protected_credentials(path)

    def test_prints_only_operational_metadata_never_merchant_or_secret(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "api.env"
            path.write_text("".join(f"{key}={value}\n" for key, value in SAMPLE.items()))
            path.chmod(0o600)
            def denied(req, *, timeout):
                raise urllib.error.HTTPError(req.full_url, 403, "no", {}, io.BytesIO(b"account restricted"))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                code = probe.main(["--env-file", str(path)], opener=denied)
            self.assertEqual(code, 3)
            text = output.getvalue()
            for secret in list(SAMPLE.values()) + ["account restricted", str(path), "clientReference="]:
                self.assertNotIn(secret, text)
            self.assertIn('"http_status":403', text)
            self.assertIn('"payment_verified":false', text)
            self.assertIn('"refund_service_checked":false', text)

    def test_invalid_timeout_fails_closed_and_prints_no_secrets(self):
        self.assertRaises(probe.ProbeInputError, probe.check, SAMPLE, timeout=0)
        self.assertRaises(probe.ProbeInputError, probe.check, SAMPLE, timeout=31)


if __name__ == "__main__":
    unittest.main()
