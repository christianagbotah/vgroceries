import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("prune_reviewed",Path(__file__).with_name("prune-reviewed-source-caches.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class RetentionTests(unittest.TestCase):
 def test_scope_rejects_other_project_and_symlink(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp).resolve()
   with patch.object(m,"BASES",(base,)):
    good=base/"vgroceries-old";good.mkdir();(good/".git").mkdir()
    other=base/"irexpro-old";other.mkdir();(other/".git").mkdir()
    alias=base/"vgroceries-alias";alias.symlink_to(good,target_is_directory=True)
    self.assertTrue(m.scope(good))
    self.assertFalse(m.scope(other))
    self.assertFalse(m.scope(alias))
 def test_sensitive_and_credential_names(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   self.assertFalse(m.suspicious(root))
   (root/".env.example").touch()
   self.assertFalse(m.suspicious(root))
   for name in [".env.production","database.dump","private.key","key.pem","customer.sqlite3","uploads"]:
    p=root/name;p.touch()
    self.assertTrue(m.suspicious(root),name)
    p.unlink()
 def test_path_boundaries_and_limits(self):
  self.assertTrue(m.inside("/a/b/c","/a/b"))
  self.assertFalse(m.inside("/a/bad","/a/b"))
  self.assertEqual(m.MIN_AGE,14*86400)
  self.assertLessEqual(m.MAX_PATHS,20)
  self.assertLessEqual(m.MAX_BYTES,6*1024**3)
  self.assertNotIn("data",m.CACHE_NAMES)
  self.assertNotIn("backups",m.CACHE_NAMES)

if __name__=="__main__":unittest.main()
