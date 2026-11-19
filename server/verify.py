"""Run on the server. Temporary users/files are removed even after a failed assertion."""
import concurrent.futures
import json
import secrets
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import os
BASE = os.environ.get('MEOW_VERIFY_BASE', 'http://127.0.0.1:8091')
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
    check(request('/cats/' + cat_id, 'PUT', {'name': 'stolen'}, other)[0] == 403, 'cross-account update denied')
    check(request('/cats/' + cat_id, 'DELETE', token=other)[0] == 403, 'cross-account delete denied')
    check(request('/cats/search?q=' + cat_id)[0] == 401, 'cat search requires login')
    found = request('/cats/search?q=' + cat_id, token=other)[1]['items']
    check(any(row['id'] == cat_id for row in found), 'search another users cat by global ID')
    check(all('notes' not in row for row in found), 'search hides creator notes')
    check(request('/records', 'POST', {'cat_id': 'missing-cat'}, other)[0] == 400, 'missing cat association rejected')
    status, shared_record = request('/map_records', 'POST', {'title': 'Shared cat observation', 'cat_id': cat_id, 'lat': 23.05, 'lng': 113.4}, other)
    check(status == 201 and shared_record['cat_id'] == cat_id, 'another user observes the same cat')
    collected = request('/cats', token=other)[1]
    check(len(collected) == 1 and collected[0]['id'] == cat_id and not collected[0]['is_mine'], 'observed shared cat enters personal cat list')
    check('notes' not in collected[0], 'shared cat hides creator notes')
    check(request('/cats/' + cat_id, 'DELETE', token=token)[0] == 409, 'creator cannot delete a cat with others observations')

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
    # An avatar becomes public only while its cat is linked to an observation.
    check(request('/cats/' + cat_id, 'PUT', {'name': 'Avatar verification', 'avatar': image['url']}, token)[0] == 200, 'set uploaded cat avatar')
    check(request(image['url'])[1] == png, 'linked cat avatar readable without login')
    check(request(image['url'], token=other)[1] == png, 'linked cat avatar readable by another account')
    check(request('/cats', token=other)[1][0]['avatar'] == image['url'], 'shared cat avatar synchronizes to observer')
    public_items = request('/map_records')[1]['items']
    check(any(row['id'] == map_record['id'] and row.get('cat_avatar') == image['url'] for row in public_items), 'public map returns uploaded cat avatar')
    check(request('/cats/' + cat_id, 'PUT', {'name': 'Avatar verification', 'avatar': 'builtin:cat'}, token)[0] == 200, 'switch back to built-in cat avatar')
    check(request(image['url'])[0] == 401, 'replaced avatar is no longer public')
    import http.client
    connection = http.client.HTTPConnection(urllib.parse.urlparse(BASE).hostname, urllib.parse.urlparse(BASE).port, timeout=10)
    connection.putrequest('POST', '/uploads')
    connection.putheader('Authorization', 'Bearer ' + token)
    connection.putheader('Content-Length', str(2 * 1024 * 1024 + 1))
    connection.endheaders()
    check(connection.getresponse().status == 413, 'oversize upload rejected before buffering')
    connection.close()
    public_shared = [row for row in request('/map_records')[1]['items'] if row['id'] == shared_record['id']]
    check(public_shared[0]['cat_id'] == cat_id and public_shared[0]['cat_name'] == 'Avatar verification', 'public shared sighting resolves canonical cat and latest name')
    check(request('/cats/' + cat_id, 'PUT', {'name': 'Shared cat new name'}, token)[0] == 200, 'creator updates shared cat')
    check(request('/cats', token=other)[1][0]['name'] == 'Shared cat new name', 'shared cat updates synchronize to observers')
    check(request('/map_records/' + shared_record['id'], 'DELETE', token=other)[0] == 200, 'delete own shared observation')
    check(request('/cats', token=other)[1] == [], 'removing final observation removes cat from personal list')
    check(request('/cats/' + cat_id, 'DELETE', token=token)[0] == 200, 'delete cat')
    check(not request('/records', token=token)[1][0].get('cat_id'), 'deleted cat unlinked')
    status, twin_a = request('/cats', 'POST', {'id': 'same-local-id', 'name': 'Twin-cat'}, token)
    check(status == 201, 'create first historical-style local cat ID')
    status, twin_b = request('/cats', 'POST', {'id': 'same-local-id', 'name': 'Twin-cat'}, other)
    check(status == 201 and twin_a['id'] != twin_b['id'], 'same local IDs across creators remain distinct')
    matches = request('/cats/search?q=Twin-cat', token=other)[1]['items']
    check(len(matches) == 2, 'same-name cats stay distinct for manual identification')
    status, twin_record = request('/records', 'POST', {'cat_id': twin_a['id'], 'location': 'Verification'}, other)
    check(status == 201, 'associate a foreign cat despite same local ID')
    check(request('/cats/' + twin_a['id'], 'PUT', {'name': 'tamper'}, other)[0] == 403, 'foreign ID cannot edit a same-local-ID own cat')
    check(request('/cats/' + twin_b['id'], 'DELETE', token=other)[0] == 200, 'delete own same-local-ID cat')
    check(request('/records', token=other)[1][0]['cat_id'] == twin_a['id'], 'deleting same-local-ID own cat retains foreign association')
    check(request('/records/' + twin_record['id'], 'DELETE', token=other)[0] == 200, 'clean up twin observation')
    check(request('/cats/' + twin_a['id'], 'DELETE', token=token)[0] == 200, 'clean up twin cat')
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
