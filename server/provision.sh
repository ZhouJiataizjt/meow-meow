#!/bin/bash
set -euo pipefail
# Run as root on the target host after copying this directory. No shop restarts.
cd /srv/projects/meow-map/server
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
if (( available < 409600 )); then echo 'STOP: less than 400 MiB available'; exit 1; fi
systemctl is-active --quiet mysql
systemctl is-active --quiet nginx
if ! command -v node >/dev/null; then
    systemd-run --quiet --wait --pipe --unit=meow-node-install \
      -p MemoryMax=256M -p CPUQuota=50% \
      /usr/bin/apt-get install -y --no-install-recommends nodejs
fi
id meow-api >/dev/null 2>&1 || useradd --system --home /var/lib/meow-map --shell /usr/sbin/nologin meow-api
install -d -o root -g meow-api -m 750 /etc/meow-map
install -d -o meow-api -g meow-api -m 700 /var/lib/meow-map/uploads
mysql < schema.sql
python3 - <<'PY'
import json, secrets, subprocess, os
from pathlib import Path
p = Path('/etc/meow-map/config.json')
if not p.exists():
    password = secrets.token_hex(32)
    sql = "CREATE USER IF NOT EXISTS 'meow_app'@'localhost' IDENTIFIED BY '%s' WITH MAX_USER_CONNECTIONS 2; GRANT SELECT,INSERT,UPDATE,DELETE ON meow_map.* TO 'meow_app'@'localhost';" % password
    subprocess.run(['mysql'], input=sql, text=True, check=True, stdout=subprocess.DEVNULL)
    p.write_text(json.dumps({'port':8091,'uploadDir':'/var/lib/meow-map/uploads','database':{'host':'localhost','socketPath':'/var/run/mysqld/mysqld.sock','user':'meow_app','password':password,'database':'meow_map'}}))
    os.chmod(p, 0o640)
PY
chown root:meow-api /etc/meow-map/config.json
install -m 644 meow-api.service /etc/systemd/system/meow-api.service
systemctl daemon-reload
systemctl enable --now meow-api
install -m 644 meow-memory-guard.service meow-memory-guard.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now meow-memory-guard.timer
for attempt in {1..15}; do
    if curl -fsS http://127.0.0.1:8091/health >/dev/null; then break; fi
    sleep 1
done
curl -fsS http://127.0.0.1:8091/health
python3 - <<'PY'
from pathlib import Path
from datetime import datetime
p=Path('/etc/nginx/sites-available/course-environment')
s=p.read_text()
if 'location ^~ /meow-api/' not in s:
    backup=Path(str(p)+'.before-meow-'+datetime.now().strftime('%Y%m%d%H%M%S'))
    backup.write_text(s)
    section='''    # meow-map isolated API: private operations require SSH until HTTPS exists.
    location = /meow-api/health {
        proxy_pass http://127.0.0.1:8091/health;
        proxy_connect_timeout 2s;
        proxy_read_timeout 5s;
    }
    location ^~ /meow-api/ {
        default_type application/json;
        return 403 '{"error":"Use SSH tunnel until HTTPS is configured"}';
    }
'''
    if '    location / {' not in s: raise SystemExit('Unexpected Nginx layout; no changes made')
    p.write_text(s.replace('    location / {',section+'    location / {',1))
    import subprocess
    if subprocess.run(['nginx','-t']).returncode:
        p.write_text(s)
        raise SystemExit('Nginx validation failed; original restored')
PY
nginx -t
systemctl reload nginx
python3 enable-public.py
systemctl is-active meow-api tomcat9 mysql nginx
systemctl show meow-api -p MemoryCurrent -p MemoryMax -p MemoryHigh -p CPUQuotaPerSecUSec -p NRestarts
free -m
curl -s -o /dev/null -w 'shop HTTP %{http_code}\n' http://127.0.0.1/products
