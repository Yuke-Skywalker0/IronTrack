from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from backend.app.main import app

with TestClient(app) as client:
    assert client.get('/health').status_code == 200
    login = client.post('/api/auth/login', json={'email':'luca@mail.com','password':'123'})
    assert login.status_code == 200, login.text
    token = login.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}
    for path in ['/api/me','/api/routines','/api/sessions','/api/stats','/api/measurements','/api/admin/users']:
        assert client.get(path, headers=headers).status_code == 200
    routine = client.post('/api/routines', headers=headers, json={
        'name':'Smoke Test','folder':'Test','description':'',
        'days':[{'name':'Day 1','exercises':[{'name':'Bench Press','sets':3,'reps':'8-10','rir':1}]}]
    })
    assert routine.status_code == 200, routine.text
    rid = routine.json()['id']
    assert client.post(f'/api/routines/{rid}/duplicate', headers=headers).status_code == 200
    session = client.post('/api/sessions', headers=headers, json={
        'routine_id':rid,'duration_min':45,
        'sets':[{'exercise_id':'bench','exercise_name':'Bench Press','set_number':1,'weight':80,'reps':8,'rir':1}]
    })
    assert session.status_code == 200, session.text
    assert client.get('/api/stats', headers=headers).json()['sets'] >= 1

print('IronTrack smoke test: OK')
