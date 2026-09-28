import os,json
from datetime import datetime,timezone,timedelta
from contextlib import asynccontextmanager
from typing import Optional
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI,Depends,HTTPException,Header,Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
except ImportError:
    google_id_token=None; google_requests=None
import secrets
from pydantic import BaseModel,Field,EmailStr
from .db import Store
from .security import hash_password,verify_password,create_token,decode_token,hash_token

load_dotenv(); store=Store()
LOCAL_EXERCISES=[]
try:
    with open(os.path.join(os.path.dirname(__file__),'exercises_local.json'),encoding='utf-8') as f: LOCAL_EXERCISES=json.load(f)
except Exception: LOCAL_EXERCISES=[]


def ensure_admin():
    email=os.getenv('ADMIN_EMAIL','luca@mail.com').strip().lower(); pw=os.getenv('ADMIN_PASSWORD','123')
    if not store.user_by_email(email): store.create_user(email,hash_password(pw),'Luca','admin')

@asynccontextmanager
async def lifespan(app):
    if os.getenv('ENVIRONMENT','development')=='production':
        secret=os.getenv('JWT_SECRET','')
        admin_pw=os.getenv('ADMIN_PASSWORD','')
        if len(secret)<32 or secret in {'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET','dev-secret-change-me'}:
            raise RuntimeError('JWT_SECRET deve essere un segreto casuale di almeno 32 caratteri in produzione')
        if len(admin_pw)<10 or admin_pw=='123':
            raise RuntimeError('ADMIN_PASSWORD deve essere cambiata e avere almeno 10 caratteri in produzione')
        if not os.getenv('MONGODB_URI','').strip():
            raise RuntimeError('MONGODB_URI è obbligatorio in produzione')
    ensure_admin(); yield
app=FastAPI(title='IronTrack API',version='2.15.0',lifespan=lifespan)
origins=[x.strip() for x in os.getenv('FRONTEND_ORIGIN','http://localhost:5500,http://127.0.0.1:5500').split(',') if x.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_origin_regex=r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$' if os.getenv('ENVIRONMENT','development')!='production' else None,allow_credentials=True,allow_methods=['*'],allow_headers=['*'])

class Login(BaseModel): email:EmailStr; password:str
class Register(BaseModel): email:EmailStr; password:str=Field(min_length=8); name:str=Field(min_length=1,max_length=80)
class RoutineIn(BaseModel): name:str; folder:str='Le mie schede'; description:str=''; days:list=Field(default_factory=list)
class SessionIn(BaseModel): routine_id:Optional[str]=None; routine_name:str='Allenamento'; started_at:Optional[str]=None; duration_min:int=0; notes:str=''; sets:list=Field(default_factory=list)
class SettingsIn(BaseModel): theme:str='system'; accent:str='#8b5cf6'
class PasswordIn(BaseModel): current_password:str; new_password:str=Field(min_length=8)
class ResetRequest(BaseModel): email:EmailStr
class ResetPasswordIn(BaseModel): token:str=Field(min_length=20); new_password:str=Field(min_length=8)
class GoogleLogin(BaseModel): credential:str=Field(min_length=20)
class ChildIn(BaseModel): email:EmailStr; password:str=Field(min_length=6); name:str
class ProfileIn(BaseModel): name:str=Field(min_length=1,max_length=80); height_cm:Optional[float]=None; weight_kg:Optional[float]=None; notes:str=''
class MeasurementIn(BaseModel): recorded_at:Optional[str]=None; weight_kg:Optional[float]=None; height_cm:Optional[float]=None; body_fat:Optional[float]=None; waist_cm:Optional[float]=None; chest_cm:Optional[float]=None; arm_cm:Optional[float]=None; thigh_cm:Optional[float]=None; notes:str=''
class AIIn(BaseModel): goal:str='ipertrofia'; days:int=Field(3,ge=1,le=7); duration:int=Field(75,ge=20,le=180); level:str='intermedio'; focus:list[str]=Field(default_factory=list); equipment:list[str]=Field(default_factory=lambda:['palestra completa']); constraints:str=''; body_notes:str=''

def safe_user(u): return {k:u.get(k) for k in ['id','email','name','role','theme','accent','created_at','height_cm','weight_kg','notes']}
def current_user(authorization:str=Header(default='')):
    if not authorization.startswith('Bearer '):raise HTTPException(401,'Token mancante')
    try:
        u=store.user_by_id(decode_token(authorization[7:])['sub'])
        if not u:raise ValueError()
        return u
    except Exception:raise HTTPException(401,'Token non valido o scaduto')
def admin_required(user=Depends(current_user)):
    if user['role']!='admin':raise HTTPException(403,'Solo super admin')
    return user

def public_exercise(x):
    if not isinstance(x,dict):return x
    name=x.get('name','Esercizio'); eid=x.get('exerciseId') or x.get('id')
    body_parts=x.get('bodyParts') or ([x.get('bodyPart')] if x.get('bodyPart') else [])
    targets=x.get('targetMuscles') or ([x.get('target')] if x.get('target') else [])
    equipment=x.get('equipments') or ([x.get('equipment')] if x.get('equipment') else [])
    instructions=x.get('instructions') or x.get('steps') or []
    overview=x.get('overview') or x.get('description') or x.get('summary') or ''
    if isinstance(overview,list): overview=' '.join(str(v) for v in overview)
    return {**x,'id':eid,'exerciseId':eid,'name':name,
      'imageUrl':x.get('imageUrl') or x.get('image') or x.get('gifUrl'),'gifUrl':x.get('gifUrl') or x.get('imageUrl'),'videoUrl':x.get('videoUrl'),
      'targetMuscles':targets,'bodyParts':body_parts,'equipments':equipment,'secondaryMuscles':x.get('secondaryMuscles') or [],
      'instructions':instructions,'overview':overview,'description':overview,'exerciseTips':x.get('exerciseTips') or x.get('tips') or [],
      'variations':x.get('variations') or [],'keywords':x.get('keywords') or [],'exerciseType':x.get('exerciseType') or x.get('category') or '',
      'gender':x.get('gender') or '','difficulty':x.get('difficulty') or '','relatedExerciseIds':x.get('relatedExerciseIds') or []}

@app.get('/health')
def health():
    db_ok=True
    if store.mongo:
        try: store.db.command('ping')
        except Exception: db_ok=False
    if not db_ok: raise HTTPException(503,'Database non raggiungibile')
    return {'ok':True,'service':'irontrack-api','version':'2.14.1','time':datetime.now(timezone.utc).isoformat(),'database':'mongodb' if store.mongo else 'sqlite','database_ok':db_ok}
@app.post('/api/auth/login')
def login(body:Login):
    u=store.user_by_email(body.email)
    if not u or not verify_password(body.password,u['password_hash']):raise HTTPException(401,'Email o password non corretti')
    return {'access_token':create_token(u['id'],u['email'],u['role']),'user':safe_user(u)}
@app.post('/api/auth/register')
def register(body:Register):
    if store.user_by_email(body.email):raise HTTPException(409,'Email già registrata')
    u=store.create_user(body.email,hash_password(body.password),body.name);return {'access_token':create_token(u['id'],u['email'],u['role']),'user':safe_user(u)}

@app.post('/api/auth/google')
def google_login(body:GoogleLogin):
    client_id=os.getenv('GOOGLE_CLIENT_ID','').strip()
    if not client_id: raise HTTPException(503,'Login Google non configurato. Imposta GOOGLE_CLIENT_ID su backend e client ID nel frontend.')
    if google_id_token is None or google_requests is None: raise HTTPException(503,'Google Auth non disponibile sul server')
    try:
        info=google_id_token.verify_oauth2_token(body.credential, google_requests.Request(), client_id)
        email=(info.get('email') or '').lower().strip(); name=(info.get('name') or email.split('@')[0]).strip()
        if not email or not info.get('email_verified'): raise ValueError('Email Google non verificata')
    except Exception:
        raise HTTPException(401,'Credenziali Google non valide')
    u=store.upsert_google_user(email,name)
    return {'access_token':create_token(u['id'],u['email'],u['role']),'user':safe_user(u)}

def esc_html(value):
    return str(value).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('\"','&quot;')

@app.post('/api/auth/request-reset')
async def request_reset(body:ResetRequest):
    # Always return the same public message to avoid leaking account existence.
    u=store.user_by_email(body.email)
    response={'ok':True,'message':"Se l'account esiste, riceverai un link per reimpostare la password."}
    if not u: return response
    raw=secrets.token_urlsafe(48); store.invalidate_auth_tokens(u['id'],'password_reset')
    expires=(datetime.now(timezone.utc)+timedelta(minutes=30)).isoformat(); store.create_auth_token(u['id'],hash_token(raw),'password_reset',expires)
    base=os.getenv('PUBLIC_BASE_URL','').strip().rstrip('/')
    if not base: base='http://localhost:8001'
    link=f'{base}/?reset={raw}'
    resend_key=os.getenv('RESEND_API_KEY','').strip(); sender=os.getenv('EMAIL_FROM','').strip()
    if resend_key and sender:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r=await client.post('https://api.resend.com/emails',headers={'Authorization':f'Bearer {resend_key}','Content-Type':'application/json'},json={'from':sender,'to':[u['email']],'subject':'Reimposta la password di IronTrack','html':f'<p>Ciao {esc_html(u.get("name") or "")}!</p><p>Hai richiesto di reimpostare la password di IronTrack.</p><p><a href="{link}">Reimposta la password</a></p><p>Il link scade tra 30 minuti.</p>'}); r.raise_for_status()
        except Exception:
            # Do not reveal mail provider errors to callers.
            pass
    elif os.getenv('ENVIRONMENT','development')!='production':
        response['debug_token']=raw
    return response

@app.post('/api/auth/reset-password')
def reset_password(body:ResetPasswordIn):
    row=store.get_auth_token(hash_token(body.token),'password_reset')
    if not row or row.get('used_at'): raise HTTPException(400,'Link non valido o già utilizzato')
    try: expired=datetime.fromisoformat(row['expires_at']) <= datetime.now(timezone.utc)
    except Exception: expired=True
    if expired: raise HTTPException(400,'Link scaduto')
    consumed=store.consume_auth_token(hash_token(body.token),'password_reset')
    if not consumed: raise HTTPException(400,'Link non valido o già utilizzato')
    u=store.user_by_id(consumed['user_id'])
    if not u: raise HTTPException(400,'Account non trovato')
    store.update_password(u['id'],hash_password(body.new_password))
    return {'ok':True,'message':'Password aggiornata. Ora puoi accedere.'}
@app.get('/api/me')
def me(user=Depends(current_user)):return safe_user(user)
@app.patch('/api/me/profile')
def profile(body:ProfileIn,user=Depends(current_user)):return safe_user(store.update_profile(user['id'],body.model_dump()))
@app.patch('/api/me/settings')
def settings(body:SettingsIn,user=Depends(current_user)):
    if body.theme not in ['system','light','dark'] or not body.accent.startswith('#') or len(body.accent)!=7:raise HTTPException(400,'Impostazioni non valide')
    store.update_user_settings(user['id'],body.theme,body.accent);return {'ok':True,'theme':body.theme,'accent':body.accent}
@app.post('/api/auth/change-password')
def change_password(body:PasswordIn,user=Depends(current_user)):
    if not verify_password(body.current_password,user['password_hash']):raise HTTPException(400,'Password attuale non corretta')
    store.update_password(user['id'],hash_password(body.new_password));return {'ok':True}

@app.get('/api/routines')
def routines(user=Depends(current_user)):return store.routines(user['id'])
@app.post('/api/routines')
def create_routine(body:RoutineIn,user=Depends(current_user)):return store.save_routine(user['id'],body.model_dump())
@app.put('/api/routines/{rid}')
def update_routine(rid:str,body:RoutineIn,user=Depends(current_user)):
    r=store.get_routine(rid)
    if not r or r['user_id']!=user['id']:raise HTTPException(404,'Scheda non trovata')
    return store.save_routine(user['id'],body.model_dump(),rid)
@app.delete('/api/routines/{rid}')
def delete_routine(rid:str,user=Depends(current_user)):
    r=store.get_routine(rid)
    if not r or r['user_id']!=user['id']:raise HTTPException(404,'Scheda non trovata')
    store.delete_routine(user['id'],rid);return {'ok':True}
@app.post('/api/routines/{rid}/duplicate')
def duplicate(rid:str,user=Depends(current_user)):
    r=store.get_routine(rid)
    if not r or r['user_id']!=user['id']:raise HTTPException(404,'Scheda non trovata')
    return store.save_routine(user['id'],{'name':r['name']+' (copia)','folder':r.get('folder','Le mie schede'),'description':r.get('description',''),'days':r.get('days',[])})
@app.post('/api/routines/{rid}/share')
def share(rid:str,user=Depends(current_user)):
    r=store.get_routine(rid)
    if not r or r['user_id']!=user['id']:raise HTTPException(404,'Scheda non trovata')
    return {'code':store.create_share(user['id'],r)}
@app.post('/api/routines/import/{code}')
def import_share(code:str,user=Depends(current_user)):
    s=store.get_share(code)
    if not s:raise HTTPException(404,'Codice non trovato')
    r=s['routine_json'];return store.save_routine(user['id'],{'name':r.get('name','Scheda importata'),'folder':'Importate','description':r.get('description',''),'days':r.get('days',[])})

@app.get('/api/sessions')
def sessions(user=Depends(current_user)):return store.sessions(user['id'])
@app.post('/api/sessions')
def save_session(body:SessionIn,user=Depends(current_user)):return store.save_session(user['id'],body.model_dump())
@app.get('/api/stats')
def stats(user=Depends(current_user)):
    ss=store.sessions(user['id']); total_sets=0; volume=0; best=0; by_ex={}
    for s in ss:
        for x in s.get('sets',[]):
            w=float(x.get('weight') or 0); reps=int(x.get('reps') or 0); total_sets+=1; volume+=w*reps; best=max(best,w)
            key=x.get('exercise_id') or x.get('exercise_name') or 'Esercizio'; by_ex.setdefault(key,{'name':x.get('exercise_name',key),'volume':0,'best':0,'reps':0,'sets':0}); by_ex[key]['volume']+=w*reps;by_ex[key]['best']=max(by_ex[key]['best'],w);by_ex[key]['reps']+=reps;by_ex[key]['sets']+=1
    top=sorted(by_ex.values(),key=lambda z:z['volume'],reverse=True)[:8]
    return {'workouts':len(ss),'sets':total_sets,'volume':round(volume,1),'best_weight':best,'top_exercises':top}

@app.get('/api/progression')
def progression(user=Depends(current_user)):
    """Return per-exercise PRs and a conservative next-session suggestion."""
    sessions=store.sessions(user['id'])
    by={}
    for sess in sessions:
        started=sess.get('started_at') or ''
        for x in sess.get('sets',[]):
            try: w=float(x.get('weight') or 0); reps=int(x.get('reps') or 0)
            except Exception: continue
            if w<=0 or reps<=0: continue
            key=x.get('exercise_id') or x.get('exercise_name') or 'Esercizio'
            name=x.get('exercise_name') or key
            by.setdefault(key,{'exercise_id':x.get('exercise_id'),'name':name,'sets':[]})['sets'].append({
                'weight':w,'reps':reps,'rir':x.get('rir'),'date':started
            })
    out=[]
    for key,v in by.items():
        rows=sorted(v['sets'],key=lambda z:z['date'])
        best=max(rows,key=lambda z:(z['weight'],z['reps']))
        last=rows[-1]
        recent=rows[-8:]
        avg_reps=round(sum(x['reps'] for x in recent)/len(recent),1)
        # Conservative double-progression suggestion based on recent work.
        if last['reps']>=12 and last['weight']>0:
            suggested=last['weight']+2.5; action='increase'
        elif last['reps']>=8:
            suggested=last['weight']; action='maintain'
        else:
            suggested=last['weight']; action='repeat'
        out.append({
            'exercise_id':v['exercise_id'],'name':v['name'],'pr_weight':best['weight'],'pr_reps':best['reps'],
            'last_weight':last['weight'],'last_reps':last['reps'],'last_rir':last['rir'],
            'average_reps':avg_reps,'sessions_sets':len(rows),'suggested_weight':suggested,'action':action,
            'last_date':last['date']
        })
    out.sort(key=lambda z:z['name'].lower())
    return {'exercises':out,'total_prs':len(out),'updated_at':datetime.now(timezone.utc).isoformat()}


@app.get('/api/progression/overview')
def progression_overview(user=Depends(current_user)):
    """Training intelligence overview: workload, frequency, estimated strength and actionable insights."""
    ss=store.sessions(user['id'])
    now=datetime.now(timezone.utc)
    parsed=[]
    for s in ss:
        try: dt=datetime.fromisoformat((s.get('started_at') or '').replace('Z','+00:00'))
        except Exception: continue
        if dt.tzinfo is None: dt=dt.replace(tzinfo=timezone.utc)
        sets=[]
        for x in s.get('sets',[]):
            try:
                w=float(x.get('weight') or 0); reps=int(x.get('reps') or 0); rir=float(x.get('rir')) if x.get('rir') is not None else None
            except Exception: continue
            if w>0 and reps>0: sets.append({'weight':w,'reps':reps,'rir':rir,'exercise_id':x.get('exercise_id'),'name':x.get('exercise_name') or 'Esercizio'})
        parsed.append((dt,sets))
    parsed.sort(key=lambda z:z[0])
    def volume(days=None):
        cutoff=now-timedelta(days=days) if days else None
        return round(sum(x['weight']*x['reps'] for dt,sets in parsed if not cutoff or dt>=cutoff for x in sets),1)
    workouts7=sum(1 for dt,_ in parsed if dt>=now-timedelta(days=7))
    workouts30=sum(1 for dt,_ in parsed if dt>=now-timedelta(days=30))
    active_dates={dt.date() for dt,_ in parsed if dt>=now-timedelta(days=30)}
    streak=0
    cursor=now.date()
    if cursor not in active_dates: cursor=cursor-timedelta(days=1)
    while cursor in active_dates:
        streak+=1; cursor-=timedelta(days=1)
    # Per-exercise estimated 1RM (Epley) and recent trend.
    by={}
    for dt,sets in parsed:
        for x in sets:
            key=x['exercise_id'] or x['name']; e=by.setdefault(key,{'name':x['name'],'id':x['exercise_id'],'rows':[]})
            e['rows'].append({'date':dt.isoformat(),'weight':x['weight'],'reps':x['reps'],'rir':x['rir'],'e1rm':x['weight']*(1+x['reps']/30)})
    ex=[]
    for e in by.values():
        rows=e['rows']; rows.sort(key=lambda z:z['date']); recent=rows[-10:]; best=max(rows,key=lambda z:z['e1rm'])
        first=recent[0]['e1rm']; last=recent[-1]['e1rm']; change=round(((last-first)/first*100),1) if first else 0
        ex.append({'exercise_id':e['id'],'name':e['name'],'estimated_1rm':round(best['e1rm'],1),'recent_1rm':round(last,1),'trend_pct':change,'sets':len(rows),'last_date':rows[-1]['date']})
    ex.sort(key=lambda z:z['sets'],reverse=True)
    avg_rir=[]
    for _,sets in parsed[-10:]: avg_rir += [x['rir'] for x in sets if x['rir'] is not None]
    avg_rir=round(sum(avg_rir)/len(avg_rir),1) if avg_rir else None
    insights=[]
    if workouts7==0: insights.append({'type':'attention','title':'Riparti con la costanza','text':'Non risultano allenamenti negli ultimi 7 giorni.'})
    elif workouts7<2: insights.append({'type':'neutral','title':'Frequenza bassa','text':f'{workouts7} allenamento negli ultimi 7 giorni.'})
    else: insights.append({'type':'positive','title':'Buona continuità','text':f'{workouts7} allenamenti negli ultimi 7 giorni.'})
    v7=volume(7); v30=volume(30)
    if v30 and v7>v30/4*1.5: insights.append({'type':'attention','title':'Carico recente elevato','text':'Il volume dell’ultima settimana è sensibilmente sopra la media settimanale del periodo di 30 giorni.'})
    elif v30 and v7>0: insights.append({'type':'neutral','title':'Volume sotto controllo','text':f'{v7:,.0f} kg negli ultimi 7 giorni su {v30:,.0f} kg negli ultimi 30.'})
    if avg_rir is not None:
        insights.append({'type':'neutral','title':'RIR medio','text':f'{avg_rir} RIR medio nelle ultime serie registrate.'})
    return {'workouts_7d':workouts7,'workouts_30d':workouts30,'volume_7d':v7,'volume_30d':v30,'streak_days':streak,'average_rir':avg_rir,'exercises':ex[:12],'insights':insights,'updated_at':now.isoformat()}


@app.get('/api/training-engine')
def training_engine(routine_id: Optional[str] = Query(None), user=Depends(current_user)):
    """Generate transparent next-session recommendations from the user's own recent training data."""
    ss=store.sessions(user['id'])
    routines=store.routines(user['id'])
    selected=None
    if routine_id:
        selected=next((r for r in routines if r.get('id')==routine_id),None)
    if not selected and routines:
        selected=routines[0]
    targets=[]
    if selected:
        for day in selected.get('days',[]):
            for e in day.get('exercises',[]):
                targets.append({'exercise_id':e.get('exerciseId') or e.get('id'),'name':e.get('name') or 'Esercizio','sets':int(e.get('sets') or 3),'reps':str(e.get('reps') or '8-12'),'rir':e.get('rir',1)})
    history={}
    for sess in ss:
        for x in sess.get('sets',[]):
            key=x.get('exercise_id') or x.get('exercise_name')
            if not key: continue
            try: w=float(x.get('weight') or 0); reps=int(x.get('reps') or 0); rir=float(x.get('rir')) if x.get('rir') is not None and x.get('rir')!='' else None
            except Exception: continue
            if w>0 and reps>0: history.setdefault(key,[]).append({'weight':w,'reps':reps,'rir':rir,'date':sess.get('started_at') or ''})
    def bounds(rep):
        m=__import__('re').search(r'(\d+)\s*(?:-|–|to)\s*(\d+)',str(rep))
        if m:return int(m.group(1)),int(m.group(2))
        n=int(__import__('re').search(r'\d+',str(rep)).group()) if __import__('re').search(r'\d+',str(rep)) else 8
        return n,n
    recommendations=[]
    for t in targets:
        key=t['exercise_id'] or t['name']; rows=history.get(key,[])
        if not rows:
            recommendations.append({**t,'action':'start','suggested_weight':0,'target_reps':t['reps'],'confidence':'new','reason':'Nessuno storico: registra la prima esposizione per costruire una progressione.'}); continue
        rows=sorted(rows,key=lambda z:z['date']); recent=rows[-6:]; last=rows[-1]; mn,mx=bounds(t['reps'])
        avg_rir=sum(r['rir'] for r in recent if r['rir'] is not None)/max(1,len([r for r in recent if r['rir'] is not None]))
        recent_reps=sum(r['reps'] for r in recent)/len(recent)
        weight=last['weight']; step=2.5 if weight<60 else 5.0
        if recent_reps>=mx and (last['rir'] is None or last['rir']<=2):
            action='increase'; suggested=weight+step; reason=f'Hai raggiunto il limite alto ({mx} reps) con margine adeguato.'
        elif recent_reps<mn:
            action='reduce'; suggested=max(step,weight-step); reason=f'La media recente è sotto il minimo ({mn} reps): riduci il carico e ricostruisci le reps.'
        else:
            action='maintain'; suggested=weight; reason=f'Resta nel range {mn}-{mx} e prova ad aggiungere 1 rep prima di aumentare il carico.'
        if last['rir'] is not None and last['rir']<=0 and action=='increase':
            action='maintain'; suggested=weight; reason='Ultima serie molto vicina al cedimento: mantieni il carico e consolida.'
        recommendations.append({**t,'action':action,'suggested_weight':round(suggested,1),'target_reps':t['reps'],'recent_average_reps':round(recent_reps,1),'recent_average_rir':round(avg_rir,1) if any(r['rir'] is not None for r in recent) else None,'last_weight':weight,'last_reps':last['reps'],'confidence':'high' if len(recent)>=3 else 'medium','reason':reason})
    return {'routine':selected.get('name') if selected else None,'routine_id':selected.get('id') if selected else None,'recommendations':recommendations,'method':'double_progression + recent RIR','generated_at':datetime.now(timezone.utc).isoformat()}

@app.get('/api/measurements')
def measurements(user=Depends(current_user)):return store.measurements(user['id'])
@app.post('/api/measurements')
def add_measurement(body:MeasurementIn,user=Depends(current_user)):
    d=store.add_measurement(user['id'],body.model_dump());
    if d.get('weight_kg') is not None: store.update_profile(user['id'],{'weight_kg':d['weight_kg'],'height_cm':d.get('height_cm')})
    return d

@app.get('/api/admin/users')
def admin_users(user=Depends(admin_required)):return store.list_users()
@app.post('/api/admin/children')
def create_child(body:ChildIn,user=Depends(admin_required)):
    if store.user_by_email(body.email):raise HTTPException(409,'Email già esistente')
    u=store.create_user(body.email,hash_password(body.password),body.name,'user');return safe_user(u)
@app.get('/api/admin/users/{uid}')
def admin_user(uid:str,user=Depends(admin_required)):
    u=store.user_by_id(uid)
    if not u:raise HTTPException(404,'Profilo non trovato')
    return safe_user(u)
@app.get('/api/admin/users/{uid}/routines')
def child_routines(uid:str,user=Depends(admin_required)):
    if not store.user_by_id(uid):raise HTTPException(404,'Profilo non trovato')
    return store.routines(uid)
@app.post('/api/admin/users/{uid}/routines')
def admin_create_routine(uid:str,body:RoutineIn,user=Depends(admin_required)):
    if not store.user_by_id(uid):raise HTTPException(404,'Profilo non trovato')
    return store.save_routine(uid,body.model_dump())
@app.put('/api/admin/users/{uid}/routines/{rid}')
def admin_update_routine(uid:str,rid:str,body:RoutineIn,user=Depends(admin_required)):
    r=store.get_routine(rid)
    if not r or r['user_id']!=uid:raise HTTPException(404,'Scheda non trovata')
    return store.save_routine(uid,body.model_dump(),rid)
@app.get('/api/admin/users/{uid}/sessions')
def admin_sessions(uid:str,user=Depends(admin_required)):
    if not store.user_by_id(uid):raise HTTPException(404,'Profilo non trovato')
    return store.sessions(uid)

async def exercisedb_request(path,params=None):
    base=os.getenv('EXERCISEDB_BASE_URL','https://oss.exercisedb.dev/api/v1').rstrip('/')
    async with httpx.AsyncClient(timeout=float(os.getenv('EXERCISEDB_TIMEOUT','12'))) as client:
        try:
            r=await client.get(f'{base}{path}',params=params);r.raise_for_status();return r.json()
        except Exception as e:raise HTTPException(502,f'ExerciseDB non raggiungibile: {e}')

def _local_matches(q='',bodyPart='',equipment='',target=''):
    q=q.strip().lower(); bp=bodyPart.strip().lower(); eq=equipment.strip().lower(); tg=target.strip().lower()
    def ok(x):
        hay=' '.join([x.get('name',''),x.get('overview',''),x.get('description',''),' '.join(x.get('keywords',[]))]).lower()
        return (not q or q in hay) and (not bp or any(bp==str(v).lower() for v in x.get('bodyParts',[]))) and (not eq or any(eq in str(v).lower() for v in x.get('equipments',[]))) and (not tg or any(tg in str(v).lower() for v in x.get('targetMuscles',[])+x.get('secondaryMuscles',[])))
    return [x for x in LOCAL_EXERCISES if ok(x)]

@app.get('/api/exercises')
async def exercises(q:str='',bodyPart:str='',equipment:str='',target:str='',limit:int=48,offset:int=0,user=Depends(current_user)):
    limit=min(max(limit,1),100); offset=max(offset,0)
    remote=[]; remote_ok=True
    remote_limit=max(1,limit-12)
    p={'limit':remote_limit,'offset':offset}
    if q:p['search']=q
    if bodyPart:p['bodyPart']=bodyPart
    if equipment:p['equipment']=equipment
    if target:p['target']=target
    try:
        d=await exercisedb_request('/exercises',p)
        remote=d.get('data',[]) if isinstance(d,dict) else (d if isinstance(d,list) else [])
        remote=[public_exercise(x) for x in remote]
    except HTTPException:
        remote_ok=False
    local=_local_matches(q,bodyPart,equipment,target)
    # A small curated slice is mixed into every page so the app is not dependent on one provider.
    local_page=local[(offset//max(remote_limit,1))*12:(offset//max(remote_limit,1))*12+12]
    seen={str(x.get('id') or x.get('exerciseId')) for x in remote}
    page=remote+[x for x in local_page if str(x.get('id') or x.get('exerciseId')) not in seen]
    if not page and local and not remote_ok:
        page=local[offset:offset+limit]
    return {'data':page[:limit],'count_estimate':1500+len(LOCAL_EXERCISES),'hasMore':len(page)>=min(limit,remote_limit),'sources':{'exercisedb':remote_ok,'irontrack_curated':bool(local)}}

@app.get('/api/exercises/{exercise_id}')
async def exercise(exercise_id:str,user=Depends(current_user)):
    local=next((x for x in LOCAL_EXERCISES if str(x.get('id') or x.get('exerciseId'))==exercise_id),None)
    if local:return public_exercise(local)
    return public_exercise(await exercisedb_request('/exercises/'+exercise_id))

@app.get('/api/exercises-meta/{kind}')
async def exercise_meta(kind:str,user=Depends(current_user)):
    if kind not in {'bodyparts','equipment','targets'}:raise HTTPException(400,'Filtro non valido')
    try: d=await exercisedb_request('/'+kind)
    except HTTPException: d=[]
    remote=d.get('data',[]) if isinstance(d,dict) else (d if isinstance(d,list) else [])
    if kind=='bodyparts': local=sorted({v for x in LOCAL_EXERCISES for v in x.get('bodyParts',[])})
    elif kind=='equipment': local=sorted({v for x in LOCAL_EXERCISES for v in x.get('equipments',[])})
    else: local=sorted({v for x in LOCAL_EXERCISES for v in x.get('targetMuscles',[])})
    vals=[]; seen=set()
    for item in list(remote)+local:
        name=item.get('name') if isinstance(item,dict) else item
        if name and str(name).lower() not in seen: seen.add(str(name).lower()); vals.append({'name':name})
    return vals


def local_ai_plan(b:AIIn):
    pools={'petto':['Barbell Bench Press','Incline Dumbbell Press','Cable Crossover'],'schiena':['Lat Pulldown','Seated Cable Row','Chest Supported Row'],'spalle':['Dumbbell Shoulder Press','Dumbbell Lateral Raise','Cable Rear Delt Fly'],'glutei':['Barbell Hip Thrust','Romanian Deadlift','Cable Glute Kickback'],'gambe':['Leg Press','Romanian Deadlift','Leg Curl'],'braccia':['Barbell Curl','Triceps Pushdown','Incline Dumbbell Curl'],'core':['Cable Crunch','Hanging Leg Raise','Plank']}
    focus=' '.join(b.focus).lower();chosen=[]
    for k,v in pools.items():
        if k in focus:chosen+=v
    if not chosen:chosen=['Barbell Bench Press','Lat Pulldown','Dumbbell Shoulder Press','Romanian Deadlift','Cable Crunch']
    days=[]
    for i in range(b.days):days.append({'name':f'Giorno {i+1}','exercises':[{'name':n,'sets':4 if j==0 else 3,'reps':'6-10' if j==0 else '8-12','rest':150 if j<2 else 90,'rir':'1-2'} for j,n in enumerate(chosen[:5])]})
    return {'name':f'AI {b.goal.title()} · {b.days} giorni','description':'Bozza locale: configura AI_BASE_URL/AI_API_KEY/AI_MODEL per usare un provider AI reale.','days':days}
@app.post('/api/ai/workout')
async def ai_workout(body:AIIn,user=Depends(current_user)):
    base,key,model=[os.getenv(k,'').strip() for k in ['AI_BASE_URL','AI_API_KEY','AI_MODEL']]
    if not all([base,key,model]):return {'provider':'local-fallback','plan':local_ai_plan(body)}
    prompt=f"Create a practical gym program as JSON only. Goal={body.goal}; days={body.days}; duration={body.duration}; level={body.level}; focus={body.focus}; equipment={body.equipment}; constraints={body.constraints}; body_notes={body.body_notes}. Return {{name,description,days:[{{name,exercises:[{{name,sets,reps,rest,rir}}]}}]}}. Do not diagnose medical conditions."
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r=await client.post(base.rstrip('/')+'/chat/completions',headers={'Authorization':f'Bearer {key}'},json={'model':model,'messages':[{'role':'system','content':'You are a fitness programming assistant. Output valid JSON only.'},{'role':'user','content':prompt}],'temperature':0.3});r.raise_for_status();c=r.json()['choices'][0]['message']['content'].strip();c=c.removeprefix('```json').removesuffix('```').strip();return {'provider':'ai','plan':json.loads(c)}
    except Exception as e:raise HTTPException(502,f'AI non disponibile: {e}')

if __name__=='__main__':
    import uvicorn;uvicorn.run('app.main:app',host='127.0.0.1',port=int(os.getenv('PORT','8001')),reload=False)

# Local-first single-origin frontend: serving the PWA from FastAPI eliminates local CORS/port mismatch issues.
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend'))
if os.path.isdir(FRONTEND_DIR):
    app.mount('/', StaticFiles(directory=FRONTEND_DIR, html=True), name='frontend')
