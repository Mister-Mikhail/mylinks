"""Actual PHP endpoint: unauthorized calls do no collection; editor gets expiring URLs."""
import hashlib, json, os, pathlib, shutil, struct, subprocess, tempfile, time, urllib.request, urllib.error, urllib.parse
# SVG brands need ffmpeg; the quick suite (no apt install) uses a raster brand.
FFMPEG=any(os.access(p,os.X_OK) for p in ('/usr/bin/ffmpeg','/usr/local/bin/ffmpeg'))
if not FFMPEG and os.environ.get('CI_SUITE')=='full':raise SystemExit('ffmpeg with librsvg is required for the full suite')
DOMAIN='youtube.com' if FFMPEG else 'tiktok.com'
with tempfile.TemporaryDirectory(prefix='mylinks-site-icon-') as tmp:
    root=pathlib.Path(tmp);doc=root/'site';doc.mkdir()
    for p in pathlib.Path('public').glob('*.php'):shutil.copy(p,doc/p.name)
    shutil.copytree('public/icons',doc/'icons')
    owner='00000000-0000-4000-8000-000000000091'
    mock=root/'mock.php'
    mock.write_text("<?php $GLOBALS['MYLINKS_PREVIEW_API_TEST']=function($path,$body,$token){$id='"+owner+"';if($path==='/auth/v1/user')return $token==='fixture.owner.signature'?array('id'=>$id):null;if(strpos($path,'/profile_links?')!==false)return array(array('id'=>$id,'profile_id'=>$id,'url'=>'https://"+DOMAIN+"','is_visible'=>true));if(strpos($path,'/profile_contacts?')!==false)return array();if(strpos($path,'handle=eq.fixture-user')!==false)return array(array('id'=>$id,'handle'=>'fixture-user','is_published'=>true));return $token==='fixture.owner.signature'?array(array('id'=>$id)):null;};")
    router=root/'router.php'
    router.write_text("<?php require "+repr(str(mock))+";$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(preg_match('#^/i/v2/([^/]+)/([^/]+)/([^/.]+)\\.png$#',$path,$m)){$_GET['handle']=$m[1];$_GET['id']=$m[2];$_GET['hash']=$m[3];require "+repr(str(doc/'link-icon.php'))+";return true;}return false;")

    rate=root/'tmp';rate.mkdir()
    env={**os.environ,'TMPDIR':str(rate)}
    proc=subprocess.Popen(['php','-d','auto_prepend_file='+str(mock),'-S','127.0.0.1:4182','-t',str(doc),str(router)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    def request(path,body=None,token=None,redirects=True,extra_headers=None):
        data=None if body is None else json.dumps(body).encode()
        headers={'Content-Type':'application/json',**(extra_headers or {})}
        if token:headers['Authorization']='Bearer '+token
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args):return None
        opener=urllib.request.build_opener() if redirects else urllib.request.build_opener(NoRedirect())
        try:r=opener.open(urllib.request.Request('http://127.0.0.1:4182'+path,data=data,headers=headers),timeout=12)
        except urllib.error.HTTPError as e:r=e
        return r.status,r.headers,r.read()
    try:
        for _ in range(50):
            try:
                if request('/site-icon.php?domain=youtube.com')[0]==401:break
            except OSError:time.sleep(.1)
        status,h,_=request('/site-icon.php?domain=youtube.com');assert status==401 and 'no-store' in h['Cache-Control']
        assert request('/site-icon.php',{'domains':[DOMAIN]})[0]==401
        assert request('/site-icon.php',{'domains':[DOMAIN]},'forged.owner.signature')[0]==401
        assert not (doc/'.private-assets').exists(),'Unsigned callers allocated persistent cache'
        assert request('/site-icon.php',{'domains':['localhost']},'fixture.owner.signature')[0]==400
        status,h,body=request('/site-icon.php',{'domains':[DOMAIN]},'fixture.owner.signature');assert status==200,(status,body)
        result=json.loads(body);path=result['urls'][DOMAIN];assert owner not in path and result['expires']<=time.time()+601
        status,h,png=request(path);assert status==200 and h['Content-Type']=='image/png',(status,png[:100])
        assert struct.unpack('>II',png[16:24])==(128,128)
        assert request(path.replace('domain='+DOMAIN,'domain=example.com'))[0]==403
        assert request(path.replace('sig=','sig=0'))[0]==403
        q=urllib.parse.parse_qs(urllib.parse.urlsplit(path).query);q['expires']=['1700000000']
        assert request('/site-icon.php?'+urllib.parse.urlencode(q,doseq=True))[0]==403
        assert request('/site-icon.php',{'domains':[DOMAIN]*41},'fixture.owner.signature')[0]==400
        for _ in range(3):assert request('/site-icon.php',{'domains':[DOMAIN]},'fixture.owner.signature')[0]==200
        ratefile=next(rate.glob('mylinks-icon-owner-*'));ratefile.write_text(json.dumps({'at':int(time.time()),'count':120}))
        assert request('/site-icon.php',{'domains':[DOMAIN]},'fixture.owner.signature')[0]==429
        public='/i/v2/fixture-user/'+owner+'/'+hashlib.md5(('https://'+DOMAIN).encode()).hexdigest()[:12]+'.png'
        status,h,_=request(public,redirects=False);assert status==302,(status,dict(h))
        versioned=h['Location'];assert '?v=' in versioned
        status,h,original=request(versioned);assert status==200 and 'immutable' in h['Cache-Control'] and '31536000' in h['Cache-Control']
        assert hashlib.sha256(original).hexdigest()==versioned.split('?v=')[1]
        etag=h['ETag'];assert request(versioned,extra_headers={'If-None-Match':etag})[0]==304
        changed=original+b'new-content'
        current=doc/'.private-assets/link-icons'/(hashlib.sha256(('domain:'+DOMAIN).encode()).hexdigest()+'.png')
        current.write_bytes(changed)
        assert request(versioned)[2]==original,'Immutable version changed after domain refresh'
        status,h,_=request(public,redirects=False);assert status==302 and h['Location']!=versioned
        print('PHP endpoint: unsigned/forged rejection, owner signing, 128px image, tampering, expiry and per-owner limit passed')
    finally:proc.terminate();proc.wait(timeout=5)
