"""Run on the server. Temporary users/files are removed even after a failed assertion."""
import concurrent.futures
import json
import secrets
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'http://127.0.0.1:8091'
users, uploads = [], []
checks = 0

def request(route, method='GET', data=None, token=None, raw=False):
    headers = {}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if data is not None:
        data = data if raw else json.dumps(data).encode()
        headers['Content-Type'] = 'application/octet-stream' if raw else 'application/json'
    req = urllib.request.Request(BASE + route, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            content = response.read()
            return response.status, json.loads(content) if 'json' in response.headers.get('Content-Type', '') else content
    except urllib.error.HTTPError as error:
        return error.code, error.read()

def check(condition, name):
    global checks
    assert condition, name
    checks += 1
    print('PASS:', name)

try:
    check(request('/health')[0] == 200, 'database health')
    check(request('/cats')[0] == 401, 'anonymous access denied')
    password = secrets.token_urlsafe(24)
    accounts = []
    for index in range(2):
        email = 'verify-' + secrets.token_hex(12) + '@example.invalid'
        status, account = request('/auth/register', 'POST', {'email': email, 'password': password})
        check(status == 200, 'register test account')
        users.append(account['user']['id'])
        accounts.append(account)
    first, second = accounts
    token, other = first['token'], second['token']
    check(request('/auth/login', 'POST', {'email': first['user']['email'], 'password': password + 'wrong'})[0] == 401, 'wrong password rejected')
    status, login = request('/auth/login', 'POST', {'email': first['user']['email'], 'password': password})
    check(status == 200, 'login')
    check(request('/auth/me', token=token)[0] == 401, 'old session revoked')
    token = login['token']
    status, cat = request('/cats', 'POST', {'name': '验证猫咪', 'notes': '中文 UTF-8'}, token)
    check(status == 201, 'create cat')
    cat_id = cat['id']
    check(request('/cats', token=other)[1] == [], 'account list isolation')
    check(request('/cats/' + cat_id, 'PUT', {'name': 'stolen'}, other)[0] == 404, 'cross-account update denied')
    check(request('/cats/' + cat_id, 'DELETE', token=other)[0] == 404, 'cross-account delete denied')
    check(request('/records', 'POST', {'cat_id': cat_id}, other)[0] == 400, 'cross-account cat association denied')
    for kind, payload in [('records', {'location': '测试校园', 'cat_id': cat_id}), ('map_records', {'title': '验证观察', 'lat': 23.05, 'lng': 113.4, 'cat_id': cat_id})]:
        status, record = request('/' + kind, 'POST', payload, token)
        check(status == 201, 'create ' + kind)
        record['title'] = 'updated'
        check(request('/' + kind + '/' + record['id'], 'PUT', record, token)[0] == 200, 'update ' + kind)
        if kind == 'records':
            ordinary_record = record
    map_record = record
    public = request('/map_records')[1]['items']
    shared = next(row for row in public if row['id'] == map_record['id'] and row['user_id'] == first['user']['id'])
    check(shared['cat_name'] == '验证猫咪' and 'email' not in json.dumps(shared) and 'notes' not in shared, 'anonymous map with safe projection')
    check(request('/records', token=other)[1] == [], 'author management list remains scoped')
    public_observations = request('/observations')[1]['items']
    shared_ordinary = next(row for row in public_observations if row['kind'] == 'records' and row['user_id'] == first['user']['id'] and row['id'] == ordinary_record['id'])
    check(shared_ordinary['location'] == '测试校园' and shared_ordinary['cat_name'] == '验证猫咪' and 'email' not in shared_ordinary, 'ordinary observations readable without login')
    check(any(row['kind'] == 'map_records' and row['id'] == map_record['id'] for row in public_observations), 'public list includes map sightings')
    check(request('/records/' + ordinary_record['id'], 'PUT', {'location': '不允许'}, other)[0] == 404, 'another user cannot edit a public observation')
    check(request('/records/' + ordinary_record['id'], 'DELETE', token=other)[0] == 404, 'another user cannot delete a public observation')
    check(request('/map_records/' + map_record['id'], 'DELETE', token=other)[0] == 404, 'public map cannot be deleted by another user')
    social = '/social/' + first['user']['id'] + '/' + map_record['id']
    check(request(social + '/like', 'PUT')[0] == 401, 'anonymous like rejected')
    check(request(social + '/like', 'PUT', token=other)[0] == 200, 'another user likes observation')
    check(request(social + '/like', 'PUT', token=other)[0] == 200, 'like request is idempotent')
    state = request(social + '/interactions', token=other)[1]
    check(state['likes'] == 1 and state['is_liked'], 'unique like and current-user state')
    check(request(social + '/interactions')[1]['likes'] == 1, 'anonymous interactions readable')
    status, comment = request(social + '/comments', 'POST', {'content': '<script>中文评论</script>'}, other)
    check(status == 201, 'create comment')
    check(request(social + '/comments', 'POST', {'content': '  '}, other)[0] == 400, 'empty comment rejected')
    check(request('/comments/' + comment['id'], 'DELETE', token=token)[0] == 404, 'comment can only be deleted by its author')
    check(request('/comments/' + comment['id'], 'DELETE', token=other)[0] == 200, 'author deletes comment')
    check(request(social + '/like', 'DELETE', token=other)[0] == 200, 'unlike')
    check(request(social + '/interactions')[1]['likes'] == 0, 'unlike count')
    check(request('/map_records', 'POST', {'lat': 999, 'lng': 0}, token)[0] == 400, 'invalid coordinates rejected')
    check(request('/uploads', 'POST', b'<svg>test</svg>', token, True)[0] == 400, 'active image content rejected')
    # Valid one-pixel PNG, no user image involved.
    import base64
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V0AAAAASUVORK5CYII=')
    status, image = request('/uploads', 'POST', png, token, True)
    check(status == 201, 'image upload')
    uploads.append(image['id'])
    check(request(image['url'], token=token)[1] == png, 'image download')
    check(request(image['url'], token=other)[0] == 404, 'image ownership')
    ordinary_record['images'] = [image['url']]
    check(request('/records/' + ordinary_record['id'], 'PUT', ordinary_record, token)[0] == 200, 'attach photo to ordinary observation')
    check(request(image['url'])[1] == png, 'ordinary observation photo readable without login')
    ordinary_record['images'] = []
    check(request('/records/' + ordinary_record['id'], 'PUT', ordinary_record, token)[0] == 200, 'remove ordinary observation photo')
    map_record['images'] = [image['url']]
    check(request('/map_records/' + map_record['id'], 'PUT', map_record, token)[0] == 200, 'attach photo to public map')
    check(request(image['url'])[1] == png, 'public map photo readable without login')
    check(request('/map_records', 'POST', {'lat': 23, 'lng': 113, 'images': [image['url']]}, other)[0] == 400, 'cannot attach another users upload')
    map_record['images'] = []
    check(request('/map_records/' + map_record['id'], 'PUT', map_record, token)[0] == 200, 'remove photo from public map')
    check(request(image['url'])[0] == 401, 'unreferenced photo no longer public')
    import http.client
    connection = http.client.HTTPConnection('127.0.0.1', 8091, timeout=10)
    connection.putrequest('POST', '/uploads')
    connection.putheader('Authorization', 'Bearer ' + token)
    connection.putheader('Content-Length', str(2 * 1024 * 1024 + 1))
    connection.endheaders()
    check(connection.getresponse().status == 413, 'oversize upload rejected before buffering')
    connection.close()
    check(request('/cats/' + cat_id, 'DELETE', token=token)[0] == 200, 'delete cat')
    check(not request('/records', token=token)[1][0].get('cat_id'), 'deleted cat unlinked')
    # Small, bounded burst, never a destructive stress test on a shared host.
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        codes = list(executor.map(lambda _: request('/health')[0], range(40)))
    check(all(code in [200, 503] for code in codes), '40 health requests at concurrency 4')
    print('Bounded burst duration:', round(time.monotonic() - started, 2), 'seconds')
    check(request('/auth/logout', 'POST', {}, token)[0] == 200, 'logout')
    check(request('/auth/me', token=token)[0] == 401, 'logout revokes token')
    print('TOTAL PASS:', checks)
finally:
    for user_id in users:
        # IDs are generated by this run, not a pattern matching existing users.
        assert len(user_id) == 36 and all(c in '0123456789abcdef-' for c in user_id)
        subprocess.run(['mysql', 'meow_map', '-e', "DELETE FROM users WHERE id='%s'" % user_id], check=True, stdout=subprocess.DEVNULL)
    for upload_id in uploads:
        Path('/var/lib/meow-map/uploads', upload_id).unlink(missing_ok=True)
