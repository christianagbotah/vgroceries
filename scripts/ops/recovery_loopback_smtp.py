#!/usr/bin/python3
"""Bounded sendmail-compatible adapter for the hardened Variety Groceries service.

Use the already-authorized loopback SMTP service; do not acquire OS privilege,
write to the mail spool, change relay policy, or log recipients/message bodies.
"""
import os
import re
import smtplib
import sys
from email import policy
from email.parser import BytesParser

MAX_BYTES = 64 * 1024
ADDRESS = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

def address(value):
    return isinstance(value, str) and ADDRESS.fullmatch(value) is not None

def deliver(args, raw, sender, smtp_factory=smtplib.SMTP):
    if not address(sender) or args != ["-t", "-i", "-f", sender]:
        raise ValueError("unsupported invocation")
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError("invalid message size")
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    if msg.defects or any(msg.get_all(h) for h in ("Cc", "Bcc", "Resent-To", "Resent-Cc", "Resent-Bcc", "Sender")):
        raise ValueError("unsupported message headers")
    for name in ("From", "To", "Subject"):
        if len(msg.get_all(name, [])) != 1 or msg[name].defects:
            raise ValueError("invalid header")
    frm, to = msg["From"].addresses, msg["To"].addresses
    if len(frm) != 1 or frm[0].addr_spec != sender or len(to) != 1 or not address(to[0].addr_spec):
        raise ValueError("invalid envelope")
    with smtp_factory("127.0.0.1", 25, timeout=8) as smtp:
        if smtp.sendmail(sender, [to[0].addr_spec], raw):
            raise RuntimeError("SMTP recipient rejected")

def main():
    try:
        deliver(sys.argv[1:], sys.stdin.buffer.read(MAX_BYTES + 1),
                os.environ.get("PASSWORD_RESET_FROM", "").strip())
    except Exception:
        # Do not include addresses, message text, SMTP replies or reset links.
        print("Variety Groceries SMTP transport rejected or unavailable", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
