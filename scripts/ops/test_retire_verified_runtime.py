import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location("retention",Path(__file__).with_name("retire-verified-runtime.py"))
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

class RetentionTests(unittest.TestCase):
 def test_candidates_exclude_active_rollback_and_stage(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   for name in (".rc9-rollback",".rc10-rollback",".rc11-rollback",".rc12-rollback",".rc13-rollback",".rc12-stage",".rc4-candidate.xyz"):
    (root/name).mkdir()
   self.assertEqual([p.name for p in r.candidates(root,12,root/".rc12-rollback")],[".rc11-rollback",".rc10-rollback",".rc9-rollback"])
 def test_markers_must_match(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   m="version=v1.0.0-rc.16\nsource_sha="+"a"*40+"\narchive_sha256="+"b"*64+"\n"
   (root/"API_RELEASE").write_text(m)
   (root/"STOREFRONT_RELEASE").write_text(m)
   self.assertEqual(r.same_markers(root)["version"],"v1.0.0-rc.16")
   (root/"STOREFRONT_RELEASE").write_text(m.replace("rc.16","rc.15"))
   with self.assertRaises(AssertionError): r.same_markers(root)
 def test_invalid_markers_fail_closed(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/"API_RELEASE"
   p.write_text("version=../../bad\nsource_sha="+"a"*40+"\narchive_sha256="+"b"*64+"\n")
   with self.assertRaises(AssertionError): r.marker(p)
 def test_missing_config_fails_closed(self):
  with patch.dict("os.environ",{},clear=True):
   with self.assertRaises(KeyError): r.configure()
if __name__=="__main__": unittest.main()
