import os, sqlite3, json, uuid, secrets
from datetime import datetime, timezone
from pathlib import Path
try:
    from pymongo import MongoClient
except ImportError:
    MongoClient = None


def now(): return datetime.now(timezone.utc).isoformat()
def uid(): return str(uuid.uuid4())

def token_code(): return secrets.token_hex(4).upper()

class Store:
    def __init__(self):
        self.mongo = None; self.db = None
        uri=os.getenv('MONGODB_URI','').strip()
        if uri:
            if MongoClient is None: raise RuntimeError('MONGODB_URI configurato ma pymongo non installato')
            self.mongo=MongoClient(uri,serverSelectionTimeoutMS=5000,connectTimeoutMS=5000)
            self.db=self.mongo[os.getenv('MONGODB_DB','gymapp')]
            self.db.command('ping')
            self._ensure_mongo_indexes()
        else:
            self.path=Path(os.getenv('SQLITE_PATH','./gymapp.db')).resolve(); self.path.parent.mkdir(parents=True,exist_ok=True)
            self.conn=sqlite3.connect(self.path,check_same_thread=False); self.conn.row_factory=sqlite3.Row; self._init_sqlite()
    def _ensure_mongo_indexes(self):
        self.db.users.create_index('email', unique=True, name='users_email_unique')
        self.db.routines.create_index([('user_id', 1), ('updated_at', -1)], name='routines_user_updated')
        self.db.sessions.create_index([('user_id', 1), ('started_at', -1)], name='sessions_user_started')
        self.db.measurements.create_index([('user_id', 1), ('recorded_at', -1)], name='measurements_user_recorded')
        self.db.shares.create_index('code', unique=True, name='shares_code_unique')
        self.db.shares.create_index('created_at', name='shares_created_at')

    def _init_sqlite(self):
        self.conn.executescript('''
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,theme TEXT DEFAULT 'system',accent TEXT DEFAULT '#8b5cf6',created_at TEXT NOT NULL,height_cm REAL,weight_kg REAL,notes TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS routines(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,folder TEXT DEFAULT 'Le mie schede',description TEXT DEFAULT '',days_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,routine_id TEXT,routine_name TEXT,started_at TEXT NOT NULL,duration_min INTEGER DEFAULT 0,notes TEXT DEFAULT '',sets_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS shares(code TEXT PRIMARY KEY,routine_json TEXT NOT NULL,owner_id TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS measurements(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,recorded_at TEXT NOT NULL,weight_kg REAL,height_cm REAL,body_fat REAL,waist_cm REAL,chest_cm REAL,arm_cm REAL,thigh_cm REAL,notes TEXT DEFAULT '');
        ''')
        # Safe migrations for DBs created by older builds.
        for col,typ in [('height_cm','REAL'),('weight_kg','REAL'),('notes','TEXT DEFAULT \'\'')]:
            try: self.conn.execute(f'ALTER TABLE users ADD COLUMN {col} {typ}')
            except sqlite3.OperationalError: pass
        try: self.conn.execute('ALTER TABLE sessions ADD COLUMN routine_name TEXT')
        except sqlite3.OperationalError: pass
        self.conn.commit()
    def _doc(self,row):
        if row is None:return None
        if isinstance(row,sqlite3.Row): return dict(row)
        d=dict(row); d.pop('_id',None); return d
    def user_by_email(self,email):
        email=email.lower().strip()
        if self.mongo:return self._doc(self.db.users.find_one({'email':email}))
        return self._doc(self.conn.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone())
    def user_by_id(self,x):
        if self.mongo:return self._doc(self.db.users.find_one({'id':x}))
        return self._doc(self.conn.execute('SELECT * FROM users WHERE id=?',(x,)).fetchone())
    def create_user(self,email,password_hash,name,role='user'):
        d={'id':uid(),'email':email.lower().strip(),'password_hash':password_hash,'name':name.strip(),'role':role,'theme':'system','accent':'#8b5cf6','created_at':now(),'height_cm':None,'weight_kg':None,'notes':''}
        if self.mongo:self.db.users.insert_one(d)
        else:self.conn.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?)',(d['id'],d['email'],d['password_hash'],d['name'],role,d['theme'],d['accent'],d['created_at'],None,None,''));self.conn.commit()
        return d
    def update_user_settings(self,uid_,theme,accent):
        if self.mongo:self.db.users.update_one({'id':uid_},{'$set':{'theme':theme,'accent':accent}})
        else:self.conn.execute('UPDATE users SET theme=?,accent=? WHERE id=?',(theme,accent,uid_));self.conn.commit()
    def update_profile(self,uid_,data):
        allowed={k:data.get(k) for k in ['name','height_cm','weight_kg','notes'] if k in data}
        if self.mongo:self.db.users.update_one({'id':uid_},{'$set':allowed})
        else:
            fields=[]; vals=[]
            for k,v in allowed.items(): fields.append(f'{k}=?'); vals.append(v)
            if fields:self.conn.execute(f"UPDATE users SET {','.join(fields)} WHERE id=?",(*vals,uid_));self.conn.commit()
        return self.user_by_id(uid_)
    def update_password(self,uid_,ph):
        if self.mongo:self.db.users.update_one({'id':uid_},{'$set':{'password_hash':ph}})
        else:self.conn.execute('UPDATE users SET password_hash=? WHERE id=?',(ph,uid_));self.conn.commit()
    def list_users(self):
        if self.mongo:return [self._doc(x) for x in self.db.users.find({}, {'password_hash':0}).sort('name',1)]
        return [self._doc(x) for x in self.conn.execute('SELECT id,email,name,role,theme,accent,created_at,height_cm,weight_kg,notes FROM users ORDER BY name').fetchall()]
    def routines(self,uid_):
        if self.mongo:return [self._doc(x) for x in self.db.routines.find({'user_id':uid_}).sort('updated_at',-1)]
        out=[self._doc(x) for x in self.conn.execute('SELECT * FROM routines WHERE user_id=? ORDER BY updated_at DESC',(uid_,)).fetchall()]
        for x in out:x['days']=json.loads(x.pop('days_json'))
        return out
    def get_routine(self,rid):
        if self.mongo:return self._doc(self.db.routines.find_one({'id':rid}))
        x=self._doc(self.conn.execute('SELECT * FROM routines WHERE id=?',(rid,)).fetchone())
        if x:x['days']=json.loads(x.pop('days_json'))
        return x
    def save_routine(self,user_id,data,rid=None):
        rid=rid or uid(); old=self.get_routine(rid) if rid else None; created=old.get('created_at') if old else now()
        d={'id':rid,'user_id':user_id,'name':str(data.get('name','Nuova scheda')).strip(),'folder':str(data.get('folder','Le mie schede')).strip(),'description':data.get('description',''),'days':data.get('days',[]),'created_at':created,'updated_at':now()}
        if self.mongo:
            self.db.routines.update_one({'id':rid,'user_id':user_id},{'$set':d},upsert=True)
        else:self.conn.execute('INSERT OR REPLACE INTO routines VALUES(?,?,?,?,?,?,?,?)',(rid,user_id,d['name'],d['folder'],d['description'],json.dumps(d['days'],ensure_ascii=False),d['created_at'],d['updated_at']));self.conn.commit()
        return d
    def delete_routine(self,uid_,rid):
        if self.mongo:self.db.routines.delete_one({'id':rid,'user_id':uid_})
        else:self.conn.execute('DELETE FROM routines WHERE id=? AND user_id=?',(rid,uid_));self.conn.commit()
    def save_session(self,uid_,data):
        sid=uid(); routine=self.get_routine(data.get('routine_id')) if data.get('routine_id') else None
        d={'id':sid,'user_id':uid_,'routine_id':data.get('routine_id'),'routine_name':routine.get('name') if routine else data.get('routine_name','Allenamento'),'started_at':data.get('started_at') or now(),'duration_min':int(data.get('duration_min',0)),'notes':data.get('notes',''),'sets':data.get('sets',[])}
        if self.mongo:self.db.sessions.insert_one(d)
        else:self.conn.execute('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)',(sid,uid_,d['routine_id'],d['routine_name'],d['started_at'],d['duration_min'],d['notes'],json.dumps(d['sets'])));self.conn.commit()
        return d
    def sessions(self,uid_,limit=200):
        if self.mongo:return [self._doc(x) for x in self.db.sessions.find({'user_id':uid_}).sort('started_at',-1).limit(limit)]
        out=[self._doc(x) for x in self.conn.execute('SELECT * FROM sessions WHERE user_id=? ORDER BY started_at DESC LIMIT ?',(uid_,limit)).fetchall()]
        for x in out:x['sets']=json.loads(x.pop('sets_json'))
        return out
    def create_share(self,owner,routine):
        code=token_code(); d={'code':code,'routine_json':routine,'owner_id':owner,'created_at':now()}
        if self.mongo:self.db.shares.insert_one(d)
        else:self.conn.execute('INSERT INTO shares VALUES(?,?,?,?)',(code,json.dumps(routine,ensure_ascii=False),owner,d['created_at']));self.conn.commit()
        return code
    def get_share(self,code):
        if self.mongo:return self._doc(self.db.shares.find_one({'code':code.upper()}))
        d=self._doc(self.conn.execute('SELECT * FROM shares WHERE code=?',(code.upper(),)).fetchone())
        if d:d['routine_json']=json.loads(d['routine_json'])
        return d
    def add_measurement(self,uid_,data):
        d={'id':uid(),'user_id':uid_,'recorded_at':data.get('recorded_at',now()),'weight_kg':data.get('weight_kg'),'height_cm':data.get('height_cm'),'body_fat':data.get('body_fat'),'waist_cm':data.get('waist_cm'),'chest_cm':data.get('chest_cm'),'arm_cm':data.get('arm_cm'),'thigh_cm':data.get('thigh_cm'),'notes':data.get('notes','')}
        if self.mongo:self.db.measurements.insert_one(d)
        else:self.conn.execute('INSERT INTO measurements VALUES(?,?,?,?,?,?,?,?,?,?,?)',(d['id'],uid_,d['recorded_at'],d['weight_kg'],d['height_cm'],d['body_fat'],d['waist_cm'],d['chest_cm'],d['arm_cm'],d['thigh_cm'],d['notes']));self.conn.commit()
        return d
    def measurements(self,uid_,limit=100):
        if self.mongo:return [self._doc(x) for x in self.db.measurements.find({'user_id':uid_}).sort('recorded_at',-1).limit(limit)]
        return [self._doc(x) for x in self.conn.execute('SELECT * FROM measurements WHERE user_id=? ORDER BY recorded_at DESC LIMIT ?',(uid_,limit)).fetchall()]
