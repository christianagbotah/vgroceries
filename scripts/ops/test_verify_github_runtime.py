import hashlib
import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("verifier", pathlib.Path(__file__).with_name("verify-github-runtime.py"))
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
SHA = "a" * 40
VERSION = "v1.0.0-rc.1"


class RuntimeVerification(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = pathlib.Path(self.tmp.name)

    def package(self, extra=(), omit=()):
        files = set(v.REQUIRED_FILES) - set(omit)
        dirs = set(v.REQUIRED_DIRS) - set(omit)
        for name in files | dirs:
            dirs.update(p.as_posix() for p in pathlib.PurePosixPath(name).parents if p.as_posix() != ".")
        with tarfile.open(self.path / "runtime.tar.gz", "w:gz") as archive:
            for name in sorted(dirs):
                m = tarfile.TarInfo(name)
                m.type = tarfile.DIRTYPE
                archive.addfile(m)
            for name in sorted(files):
                m = tarfile.TarInfo(name)
                m.size = 1
                archive.addfile(m, io.BytesIO(b"x"))
            for name, kind, target in extra:
                m = tarfile.TarInfo(name)
                m.type = kind
                m.linkname = target
                archive.addfile(m)
        for name, value in {"source-sha.txt": SHA, "version.txt": VERSION, "format.txt": "vgroceries-runtime-v1"}.items():
            (self.path / name).write_text(value + "\n", encoding="ascii")
        hashes = {name: v.digest(self.path / name) for name in v.ASSETS}
        (self.path / "SHA256SUMS").write_text("".join(hashes[name] + "  " + name + "\n" for name in sorted(hashes)), encoding="ascii")
        return hashes["runtime.tar.gz"]

    def test_valid_relative_contract_link(self):
        archive_hash = self.package([("api/apps/api/node_modules/contracts", tarfile.SYMTYPE, "../../../packages/contracts")])
        count, _ = v.validate(self.path, SHA, VERSION, archive_hash)
        self.assertGreater(count, 0)

    def test_tampering(self):
        h = self.package()
        (self.path / "runtime.tar.gz").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            v.validate(self.path, SHA, VERSION, h)

    def test_wrong_trusted_digest(self):
        self.package()
        with self.assertRaisesRegex(ValueError, "trusted release"):
            v.validate(self.path, SHA, VERSION, "0"*64)

    def test_wrong_commit(self):
        h = self.package()
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            v.validate(self.path, "b"*40, VERSION, h)

    def test_manifest_path_injection(self):
        h = self.package()
        with (self.path / "SHA256SUMS").open("a") as stream:
            stream.write("0"*64 + "  ../../etc/passwd\n")
        with self.assertRaisesRegex(ValueError, "invalid checksum"):
            v.validate(self.path, SHA, VERSION, h)

    def test_traversal_absolute_duplicate_and_secret(self):
        for name in ("api/../../etc/passwd", "/etc/passwd", "storefront/server.js", "storefront/.env"):
            with self.subTest(name=name):
                h = self.package([(name, tarfile.REGTYPE, "")])
                with self.assertRaises(ValueError):
                    v.validate(self.path, SHA, VERSION, h)

    def test_cross_component_and_absolute_symlink(self):
        for target in ("../api", "/etc", "../../etc", "missing"):
            with self.subTest(target=target):
                h = self.package([("storefront/link", tarfile.SYMTYPE, target)])
                with self.assertRaises(ValueError):
                    v.validate(self.path, SHA, VERSION, h)

    def test_symlink_parent_and_cycle(self):
        for extra in [
            [("storefront/link", tarfile.SYMTYPE, "."), ("storefront/link/evil", tarfile.REGTYPE, "")],
            [("storefront/a", tarfile.SYMTYPE, "b"), ("storefront/b", tarfile.SYMTYPE, "a")],
        ]:
            h = self.package(extra)
            with self.assertRaises(ValueError):
                v.validate(self.path, SHA, VERSION, h)

    def test_missing_api(self):
        h = self.package(omit=["api/apps/api/dist/src/main.js"])
        with self.assertRaisesRegex(ValueError, "missing runtime file"):
            v.validate(self.path, SHA, VERSION, h)


if __name__ == "__main__":
    unittest.main()
