#!/usr/bin/env python3
"""Retire only byte-verified, unreferenced Variety Groceries runtime snapshots."""
import argparse, fcntl, glob, hashlib, json, os, pathlib, re, shutil, subprocess, tarfile, tempfile, time
P=pathlib.Path
if not __debug__:
 raise RuntimeError("Safety checks require non-optimized Python")
ROOT=OPS=LOCK=REPO=CAPACITY=None
HEALTH_URLS=REFERENCE_ROOTS=SYMLINK_ROOTS=()
READY_URL=None
def configure():
 global ROOT,OPS,LOCK,REPO,CAPACITY,HEALTH_URLS,REFERENCE_ROOTS,SYMLINK_ROOTS,READY_URL
 def abs_path(key):
  p=P(os.environ[key])
  if not p.is_absolute() or p.resolve()!=p:
   raise ValueError("Expected canonical absolute path: "+key)
  return p
 ROOT=abs_path("VG_RUNTIME_ROOT")
 OPS=P(__file__).resolve().parent
 LOCK=str(abs_path("VG_SHARED_LOCK"))
 CAPACITY=str(abs_path("VG_CAPACITY_CHECK"))
 REPO=os.environ["VG_RELEASE_REPO"]
 if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",REPO):
  raise ValueError("Invalid repository")
 def values(key):
  v=json.loads(os.environ[key])
  if not isinstance(v,list) or not v or not all(isinstance(x,str) and x for x in v):
   raise ValueError("Expected nonempty array: "+key)
  return tuple(v)
 HEALTH_URLS=values("VG_HEALTH_URLS")
 READY_URL=os.environ["VG_READY_URL"]
 if READY_URL not in HEALTH_URLS or not all(x.startswith(("https://","http://127.0.0.1:")) for x in HEALTH_URLS):
  raise ValueError("Require readiness in explicit HTTPS/loopback health routes")
 REFERENCE_ROOTS=values("VG_REFERENCE_ROOTS")
 SYMLINK_ROOTS=values("VG_SYMLINK_ROOTS")
 if not all(P(x).is_absolute() and P(x).is_dir() for x in REFERENCE_ROOTS+SYMLINK_ROOTS):
  raise ValueError("Reference roots must be existing absolute directories")
 if not ROOT.is_dir() or ROOT==P("/") or not P(CAPACITY).is_file() or not P(LOCK).is_file():
  raise ValueError("Invalid runtime, capacity gate or shared lock")
def run(*a,**kw): return subprocess.check_output(a,text=True,timeout=kw.pop('timeout',60),**kw).strip()
def digest(f):
 h=hashlib.sha256()
 while b:=f.read(1024*1024): h.update(b)
 return h.hexdigest()
def marker(p):
 a=dict(l.split('=',1) for l in p.read_text().splitlines())
 assert set(a)=={'version','source_sha','archive_sha256'}
 assert re.fullmatch(r'v1\.0\.0-rc\.\d+',a['version']) and re.fullmatch('[a-f0-9]{40}',a['source_sha']) and re.fullmatch('[a-f0-9]{64}',a['archive_sha256'])
 return a
def same_markers(p):
 a=marker(p/'API_RELEASE'); assert a==marker(p/'STOREFRONT_RELEASE'); return a
def health():
 for u in HEALTH_URLS:
  code=run('curl','-fsS','--max-time','10','-o','/dev/null','-w','%{http_code}',u)
  assert code=='200',u
 assert json.loads(run('curl','-fsS','--max-time','10',READY_URL))['data']['database']=='up'
def refs(p):
 q=str(p)
 for f in glob.glob('/proc/[0-9]*/cwd')+glob.glob('/proc/[0-9]*/root')+glob.glob('/proc/[0-9]*/exe')+glob.glob('/proc/[0-9]*/fd/*'):
  try: s=os.readlink(f)
  except OSError: continue
  assert not (s==q or s.startswith(q+'/')), 'active process'
 for root in REFERENCE_ROOTS:
  for dp,ds,fs in os.walk(root,followlinks=False):
   for n in fs:
    x=P(dp)/n
    try:
     if x.is_file() and x.stat().st_size<2*1024*1024:
      assert q.encode() not in x.read_bytes(),'configuration reference'
    except FileNotFoundError: pass
 for root in (*SYMLINK_ROOTS,str(ROOT)):
  for x in P(root).iterdir():
   if x.is_symlink():
    s=str(x.resolve()); assert not (s==q or s.startswith(q+'/')),'application symlink'
 for l in P('/proc/self/mountinfo').read_text().splitlines():
  mount=l.split()[4]; assert not (mount==q or mount.startswith(q+'/')),'mounted filesystem'
def compare(p,a,tmp):
 release=json.loads(run('gh','release','view',a['version'],'--repo',REPO,'--json','targetCommitish,assets'))
 assert release['targetCommitish']==a['source_sha']
 asset=next(x for x in release['assets'] if x['name']=='runtime.tar.gz')
 assert asset['digest']=='sha256:'+a['archive_sha256']
 subprocess.run([CAPACITY,'artifact',str((asset['size']+1048575)//1048576)],check=True,stdout=subprocess.DEVNULL,timeout=30)
 subprocess.run(['gh','release','download',a['version'],'--repo',REPO,'--dir',str(tmp)],check=True,timeout=150)
 subprocess.run(['python3',str(OPS/'verify-github-runtime.py'),str(tmp),'--sha',a['source_sha'],'--version',a['version'],'--archive-sha256',a['archive_sha256']],check=True,timeout=90)
 seen=set(); mismatches=[]
 with tarfile.open(tmp/'runtime.tar.gz','r|gz') as t:
  for m in t:
   n=m.name.rstrip('/'); seen.add(n); x=p/n
   if m.isdir():
    if not x.is_dir() or x.is_symlink(): mismatches.append(n)
   elif m.issym():
    if not x.is_symlink() or os.readlink(x)!=m.linkname: mismatches.append(n)
   elif m.isfile():
    if not x.is_file() or x.is_symlink() or x.stat().st_size!=m.size: mismatches.append(n)
    else:
     with x.open('rb') as f:
      if digest(f)!=digest(t.extractfile(m)): mismatches.append(n)
 # No unrecognized local-only content. Explicitly recognized Next runtime cache
 # is disposable, but do not treat arbitrary files or upload paths as generated.
 extras=[]
 for dp,ds,fs in os.walk(p,followlinks=False):
  for n in ds+fs:
   x=P(dp)/n; r=str(x.relative_to(p))
   if r in seen or r in ('API_RELEASE','STOREFRONT_RELEASE'): continue
   if r in ('api/API_RELEASE','storefront/STOREFRONT_RELEASE') and x.is_file() and not x.is_symlink() and marker(x)==a: continue
   if r=='storefront/.next/cache' or r.startswith('storefront/.next/cache/'):
    if not x.is_symlink() and (x.is_dir() or x.is_file()): continue
   extras.append(r)
 print('COMPARE',p.name,'mismatches',len(mismatches),'extras',len(extras),flush=True)
 if mismatches or extras:
  print('HOLD_NAMES',json.dumps((mismatches+extras)[:12]),flush=True)
  raise ValueError('local files differ from verified archive')
def candidates(root,n,keep):
 return sorted((p for p in root.glob(".rc*-rollback") if re.fullmatch(r"\.rc\d+-rollback",p.name) and p!=keep and int(p.name[3:].split("-")[0])<n),key=lambda p:int(p.name[3:].split("-")[0]),reverse=True)
def main():
 configure()
 ap=argparse.ArgumentParser(); ap.add_argument('--apply',action='store_true'); ap.add_argument('--limit',type=int,default=2); args=ap.parse_args()
 assert 1<=args.limit<=9
 with open(LOCK,'a') as lock:
  try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:
   print('HOLD: shared deployment lock busy',flush=True); raise SystemExit(75)
  active=same_markers(ROOT); n=int(active['version'].split('.')[-1])
  keep=ROOT/('.rc%d-rollback'%n); rollback=same_markers(keep)
  assert int(rollback['version'].split('.')[-1])==n-1
  assert (keep/'api/apps/api/dist/src/main.js').is_file() and (keep/'storefront/server.js').is_file()
  subprocess.run(['diff','-qr',str(ROOT/'api/apps/api/prisma/migrations'),str(keep/'api/apps/api/prisma/migrations')],check=True,timeout=30)
  health()
  print('ACTIVE',active['version'],'KEEP',keep.name,rollback['version'],flush=True)
  pending=candidates(ROOT,n,keep)
  if pending:
   with tempfile.TemporaryDirectory(prefix="vg-retention-rollback-") as tmp: compare(keep,rollback,P(tmp))
  for p in pending[:args.limit]:
   try:
    assert p.is_dir() and not p.is_symlink() and p.resolve()==p
    a=same_markers(p); assert int(a['version'].split('.')[-1])<n-1
    refs(p)
    with tempfile.TemporaryDirectory(prefix='vg-retention-') as tmp: compare(p,a,P(tmp))
    assert same_markers(ROOT)==active and same_markers(keep)==rollback
    refs(p); health()
    size=int(run('du','-sx','-B1',str(p)).split()[0]); before=shutil.disk_usage('/').free
    if not args.apply: print('ELIGIBLE',p,size,flush=True); continue
    shutil.rmtree(p); assert not p.exists()
    after=shutil.disk_usage('/').free
    print('REMOVED',str(p),'allocated_bytes',size,'filesystem_free_delta',after-before,'version',a['version'],'source',a['source_sha'],flush=True)
    health(); print('HEALTH_OK',p.name,flush=True)
   except Exception as e:
    print('HOLD',p.name,type(e).__name__,str(e)[:180],flush=True)
    # Do not proceed if the service has become unhealthy.
    health()
if __name__=='__main__': main()

