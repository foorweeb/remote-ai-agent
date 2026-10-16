"""Install an official MongoDB 8.0 Community binary locally; no system changes."""
import hashlib,json,os,platform,shutil,tarfile,urllib.request
from pathlib import Path
if platform.system()!='Darwin':raise SystemExit('Install MongoDB Community for your OS, then set MONGOD_BIN.')
arch={'arm64':'arm64','x86_64':'x86_64'}.get(platform.machine())
metadata=json.load(urllib.request.urlopen('https://downloads.mongodb.org/current.json',timeout=30))
release=next(v for v in metadata['versions'] if v['version'].startswith('8.0.') and '-' not in v['version'])
download=next(d for d in release['downloads'] if d['target']=='macos' and d['arch']==arch and d['edition']=='base')['archive']
work=Path('work/mongo-install');work.mkdir(parents=True,exist_ok=True);archive=work/'server.tgz'
with urllib.request.urlopen(download['url'],timeout=60) as response,archive.open('wb') as output:shutil.copyfileobj(response,output)
if hashlib.sha256(archive.read_bytes()).hexdigest()!=download['sha256']:raise SystemExit('Official MongoDB checksum mismatch')
output=Path('.remote-mac/bin');output.mkdir(parents=True,exist_ok=True);os.chmod('.remote-mac',0o700);os.chmod(output,0o700)
with tarfile.open(archive) as tar:
 member=next(m for m in tar.getmembers() if m.name.endswith('/bin/mongod') and m.isfile())
 with tar.extractfile(member) as source,(output/'mongod.new').open('wb') as target:shutil.copyfileobj(source,target)
os.chmod(output/'mongod.new',0o700);os.replace(output/'mongod.new',output/'mongod')
print('Installed official MongoDB Community '+release['version']+' with verified SHA-256 in .remote-mac/bin/mongod')
