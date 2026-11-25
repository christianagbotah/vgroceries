#!/usr/bin/env python3
"""Bounded cache-only retention. No source, release, backup or data deletion.
A root-owned manifest pins reviewed Git source commits. Default is audit.
"""
import argparse, fcntl, json, os, re, shutil, stat, subprocess, time
from pathlib import Path

BASES=tuple(Path(p) for p in ('/home/lightworld/dev','/home/lightworld/src','/home/lightworld/workspaces','/tmp','/var/tmp'))
PREFIXES=('vgroceries-','vg-')
CACHE_NAMES=('node_modules','.next','.turbo','apps/api/node_modules','apps/api/dist','packages/contracts/dist','packages/contracts/node_modules')
MAX_PATHS=20
MAX_BYTES=6*1024**3
MIN_AGE=14*86400
LOCK=Path('/run/lock/lightworld-deploy/heavy-deploy.lock')
REPO='christianagbotah/vgroceries'
def cmd(*args):
 return subprocess.run(args,check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=90).stdout
def scope(root):
 return root.parent in BASES and root.name.startswith(PREFIXES) and root.resolve()==root and (root/'.git').exists()
def inside(p,r):
 return p==r or p.startswith(r.rstrip('/')+'/')
def suspicious(path):
 for dirname,dirs,files in os.walk(path,followlinks=False):
  for n in dirs+files:
   low=n.lower()
   if low in ('.git','uploads','product-media','backups','credentials.json','private.key','id_rsa','id_ed25519') or (low.startswith('.env') and not low.endswith(('.example','.sample','.template'))) or low.endswith(('.pem','.key','.p12','.pfx','.jks','.keystore','.dump','.backup','.sqlite','.sqlite3')):
    return True
 return False
def process_refs():
 result=[]
 for p in Path('/proc').glob('[0-9]*'):
  try:
   for item in ('cwd','exe','root'):
    result.append(os.readlink(p/item))
   result.extend((p/'cmdline').read_bytes().decode(errors='replace').split('\0'))
   for fd in (p/'fd').iterdir():
    try:result.append(os.readlink(fd))
    except OSError:pass
   for line in (p/'maps').read_text(errors='replace').splitlines():
    if '/' in line:result.append(line[line.index('/'):])
  except OSError:pass
 return result
def configured_refs():
 result=[]
 for base in (Path('/etc/systemd/system'),Path('/usr/local/apps/nginx/etc/conf.d')):
  for p in base.iterdir():
   if not ('varietygroceries' in p.name or p.name.startswith('vg-')):continue
   for f in ([p] if p.is_file() else list(p.glob('*.conf')) if p.is_dir() else []):
    try:result.append(f.read_text(errors='replace'))
    except OSError:pass
 for s in ('varietygroceries-api','varietygroceries-media-worker','varietygroceries-notifications','varietygroceries-portal','varietygroceries-portal-canonical','vg-pos-staging-api','vg-pos-staging-web','vg-pos-staging-postgres','vg-pos-staging-backup','vg-hubtel-owner-pilot','vg-l4-test-postgres-20261105'):
  for p in ('WorkingDirectory','RootDirectory','ReadWritePaths'):
   value=cmd('systemctl','show',s+'.service','-p',p,'--value').strip()
   result.append(value)
   if value.startswith('/') and os.path.exists(value):result.append(os.path.realpath(value))
 return result
def link_refs(roots):
 # No follow of symlinks, no traversal into independent data/media/backup dirs.
 bases=(*BASES,Path('/home/lightworld/releases'),Path('/home/lightworld/webapps'),Path('/home/lightworld/apps'))
 project=[]
 for base in bases:
  if not base.is_dir():continue
  for p in base.iterdir():
   if p.name.startswith(('varietygroceries','vgroceries','vg-')) and p.is_dir():
    if not p.is_symlink():project.append(p)
 project=sorted(set(str(p) for p in project))
 if not project:return []
 args=['find','-P',*project,'-xdev','(','-type','d','(','-name','.git','-o','-name','data','-o','-name','backups','-o','-name','uploads','-o','-name','product-media','-o','-name','sock',')','-prune',')','-o','-type','l','-print0']
 res=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=240)
 if res.returncode:raise RuntimeError('Incomplete symlink inventory')
 refs=[]
 for raw in res.stdout.split(b'\0'):
  if not raw:continue
  link=os.fsdecode(raw);dest=os.path.realpath(link)
  if any(inside(dest,str(r)) or inside(str(r),dest) for r in roots):refs.append((link,dest))
 return refs
def safe_manifest(p):
 st=p.stat()
 if p.is_symlink() or st.st_uid!=0 or st.st_mode&0o022:raise RuntimeError('Review manifest must be root-owned and non-writable by others')
 rows=json.loads(p.read_text())
 if not isinstance(rows,list) or len(rows)>20:raise RuntimeError('Invalid review manifest')
 return rows
def main():
 parser=argparse.ArgumentParser()
 parser.add_argument('--manifest',type=Path,required=True)
 parser.add_argument('--apply',action='store_true')
 args=parser.parse_args()
 with LOCK.open('a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:print('HOLD: shared maintenance lock busy');return 10
  rows=safe_manifest(args.manifest)
  roots=[]
  for row in rows:
   root=Path(row['root']);sha=row['sha']
   if not scope(root) or not re.fullmatch('[0-9a-f]{40}',sha):raise RuntimeError('Invalid source scope')
   if any((root/n).is_dir() and not (root/n).is_symlink() for n in CACHE_NAMES):roots.append(root)
  if not roots:print('No reviewed generated caches remain');return 0
  remote=set(line.split()[0] for line in cmd('git','ls-remote','--heads','--tags','https://github.com/'+REPO+'.git').splitlines() if line)
  refs=configured_refs()+process_refs()
  links=link_refs(roots)
  removed=0;total=0
  for row in rows:
   root=Path(row['root']);sha=row['sha'];r=str(root)
   if root not in roots:continue
   # Remote identity and exact reachable branch/tag are required, not stale local refs.
   origin=cmd('git','-C',r,'config','--get','remote.origin.url').strip()
   if not (origin.endswith('/'+REPO+'.git') or origin.endswith('/'+REPO) or origin.endswith(':'+REPO+'.git') or origin.endswith(':'+REPO)):print('SKIP remote mismatch',r);continue
   if sha not in remote or cmd('git','-C',r,'rev-parse','HEAD').strip()!=sha or cmd('git','-C',r,'status','--porcelain','--untracked-files=normal').strip():
    print('SKIP unpreserved or changed source',r);continue
   if time.time()-int(cmd("git","-C",r,"show","-s","--format=%ct","HEAD").strip())<MIN_AGE:
    print('SKIP recent source tree',r);continue
   if any(r in s for s in refs):print('SKIP active or configured root',r);continue
   for name in CACHE_NAMES:
    path=root/name;p=str(path)
    if removed>=MAX_PATHS:break
    if not path.is_dir() or path.is_symlink() or path.resolve()!=path or os.path.ismount(path):continue
    if time.time()-path.stat().st_mtime<MIN_AGE:continue
    if subprocess.run(['git','-C',r,'check-ignore','-q',name]).returncode!=0 or cmd('git','-C',r,'ls-files','--',name).strip():continue
    if any(not inside(src,r) and (inside(dst,p) or inside(p,dst)) for src,dst in links):print('SKIP external link',p);continue
    if suspicious(path):print('SKIP possible private data',p);continue
    size=int(cmd('du','-sx','-B1','--',p).split()[0])
    if total+size>MAX_BYTES:print('SKIP batch limit',p);continue
    if any(r in s for s in process_refs()):print('SKIP new active reference',r);break
    print(('REMOVE' if args.apply else 'CANDIDATE'),size,p,sha,flush=True)
    if args.apply:
     shutil.rmtree(path)
     if path.exists():raise RuntimeError('Cache remains after deletion')
    total+=size;removed+=1
  print('SUMMARY',('removed' if args.apply else 'eligible'),removed,'bytes',total)
 return 0
if __name__=='__main__':raise SystemExit(main())
