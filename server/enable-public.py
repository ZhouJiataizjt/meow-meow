"""Open only the Meow API prefix. Preserve the existing shop reverse proxy."""
from pathlib import Path
from datetime import datetime
import re
import subprocess

p = Path('/etc/nginx/sites-available/course-environment')
original = p.read_text()
limit_file = Path('/etc/nginx/conf.d/meow-api-limits.conf')
old_limits = limit_file.read_text() if limit_file.exists() else None
replacement = '''    location ^~ /meow-api/ {
        client_max_body_size 2m;
        limit_req zone=meow_api burst=20 nodelay;
        limit_req_status 429;
        limit_conn meow_connections 8;
        proxy_pass http://127.0.0.1:8091/;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
        proxy_connect_timeout 3s;
        proxy_read_timeout 20s;
    }'''
updated, count = re.subn(r'    location \^~ /meow-api/ \{[\s\S]*?\n    \}', replacement, original)
if count != 1:
    raise SystemExit('Unexpected Meow route count; no changes made')
updated = updated.replace('# meow-map isolated API: private operations require SSH until HTTPS exists.', '# meow-map public API; shop routes unchanged.')
Path(str(p) + '.before-public-' + datetime.now().strftime('%Y%m%d%H%M%S')).write_text(original)
limit_file.write_text('limit_req_zone $binary_remote_addr zone=meow_api:1m rate=8r/s;\nlimit_conn_zone $binary_remote_addr zone=meow_connections:1m;\n')
p.write_text(updated)
if subprocess.run(['nginx', '-t']).returncode:
    p.write_text(original)
    if old_limits is None:
        limit_file.unlink()
    else:
        limit_file.write_text(old_limits)
    raise SystemExit('Nginx check failed, configuration restored')
subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
