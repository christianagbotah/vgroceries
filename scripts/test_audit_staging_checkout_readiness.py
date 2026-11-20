"""Offline regression tests: no real merchant, checkout, or network requests."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

script = Path(__file__).with_name("audit-staging-checkout-readiness.py")
spec = importlib.util.spec_from_file_location("vg_checkout_probe", script)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)

HEADERS = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store"}
ORIGIN = "https://portal.varietygroceries.com"
URL = ORIGIN + mod.PATH


def payload(available=True, mode="production"):
    return json.dumps({"ok": True, "data": {"electronicAvailable": available, "mode": mode}}).encode()


class FakeResponse:
    status = 200

    def __init__(self, body=payload(), url=URL, headers=None):
        self._body = body
        self._url = url
        self.headers = headers if headers is not None else HEADERS

    def geturl(self):
        return self._url

    def read(self, count):
        return self._body[:count]

    def __enter__(self):
        return self

    def __exit__(self, *unused):
        return False


class CheckoutAvailabilityProbeTest(unittest.TestCase):
    def test_exact_production_response_marks_contract_only_not_launch_approval(self):
        response = mod.inspect_response(200, HEADERS, payload(True))
        self.assertEqual(response.code, 0)
        self.assertIn("NOT a payment, refund, or launch approval", response.message)

    def test_explicit_disabled_response_is_no_go(self):
        response = mod.inspect_response(200, HEADERS, payload(False))
        self.assertEqual(response.code, 3)
        self.assertIn("NO-GO", response.message)

    def test_missing_route_and_auth_gate_fail_closed(self):
        for status in (301, 401, 403, 404, 500):
            with self.subTest(status=status):
                self.assertEqual(mod.inspect_response(status, HEADERS, payload()).code, 4)

    def test_never_accepts_demo_schema_extra_fields_or_ambiguous_status(self):
        variants = [
            payload(True, "demo"),
            b'{"ok":true,"data":{"electronicAvailable":"true","mode":"production"}}',
            b'{"ok":true,"data":{"electronicAvailable":true,"mode":"production","merchantKey":"SECRET"}}',
            b'{"ok":true,"data":{"electronicAvailable":true}}',
            b'{"ok":false,"data":{"electronicAvailable":true,"mode":"production"}}',
            b"not-json",
            b"{" + b"X" * mod.MAX_BODY,
        ]
        for body in variants:
            with self.subTest(body=body[:65]):
                self.assertEqual(mod.inspect_response(200, HEADERS, body).code, 4)

    def test_prevent_caching_and_non_json(self):
        self.assertEqual(mod.inspect_response(200, {"Content-Type": "application/json"}, payload()).code, 4)
        self.assertEqual(mod.inspect_response(200, {"Cache-Control": "no-store", "Content-Type": "text/html"}, payload()).code, 4)

    def test_https_origin_rejects_misleading_urls(self):
        self.assertEqual(mod.endpoint_from_origin(ORIGIN), URL)
        for origin in ("http://portal.varietygroceries.com", "https://user:password@portal.varietygroceries.com",
                       "https://portal.varietygroceries.com/admin", "https://portal.varietygroceries.com/?x=1",
                       "https://portal.varietygroceries.com/#fragment"):
            with self.subTest(origin=origin):
                with self.assertRaises(ValueError):
                    mod.endpoint_from_origin(origin)

    def test_probe_is_read_only_no_body_or_credentials(self):
        with patch.object(mod, "build_opener") as factory:
            factory.return_value.open.return_value = FakeResponse()
            outcome = mod.probe(ORIGIN, 3)
        self.assertEqual(outcome.code, 0)
        self.assertIsInstance(factory.call_args.args[0], mod.NoRedirect)
        request = factory.return_value.open.call_args.args[0]
        self.assertEqual(request.get_method(), "GET")
        self.assertEqual(request.full_url, URL)
        self.assertIsNone(request.data)
        self.assertNotIn("Authorization", request.headers)

    def test_redirect_and_network_errors_cannot_pass(self):
        self.assertIsNone(mod.NoRedirect().redirect_request(None, None, 302, "Found", {}, ORIGIN + "/login"))
        with patch.object(mod, "build_opener") as factory:
            factory.return_value.open.return_value = FakeResponse(url=ORIGIN + "/login")
            self.assertEqual(mod.probe(ORIGIN, 3).code, 4)
            factory.return_value.open.side_effect = HTTPError(URL, 302, "Redirect", {}, None)
            self.assertEqual(mod.probe(ORIGIN, 3).code, 4)
            factory.return_value.open.side_effect = HTTPError(URL, 404, "Missing", {}, None)
            self.assertEqual(mod.probe(ORIGIN, 3).code, 4)
            factory.return_value.open.side_effect = URLError("blocked")
            self.assertEqual(mod.probe(ORIGIN, 3).code, 4)


if __name__ == "__main__":
    unittest.main()
