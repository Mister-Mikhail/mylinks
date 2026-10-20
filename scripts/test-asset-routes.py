"""Exercise the shipped .htaccess in Apache/PHP, including poisoned validators."""
import base64, hashlib, json, os, pathlib, shutil, subprocess, tempfile, time, urllib.request, urllib.error

with tempfile.TemporaryDirectory(prefix='mylinks-apache-') as temp:
    root = pathlib.Path(temp)
    root.chmod(0o755)
    doc = root / 'site'
    shutil.copytree('dist', doc)
    cache = root / 'tmp'
    cache.mkdir(mode=0o777)
    uid, gid = os.getuid(), os.getgid()
    assert uid != 0, 'Run fixture as an unprivileged user'
    ident = '00000000-0000-4000-8000-000000000002'
    url = 'https://example.com/page'
    digest = hashlib.md5(url.encode()).hexdigest()[:12]
    bundle = {'profile': {'id': ident, 'handle': 'fixture-user', 'is_published': True, 'display_name': 'Fixture'}, 'links': [{'id':ident,'profile_id':ident,'url':url,'is_visible':True}], 'contacts': []}
    fixture = root / 'bundle.json'
    fixture.write_text(json.dumps(bundle))
    mock = root / 'mock.php'
    mock.write_text("<?php $GLOBALS['MYLINKS_PREVIEW_API_TEST']=function($path){$b=json_decode(file_get_contents("+repr(str(fixture))+"),true);if(strpos($path,'/profiles?')!==false)return $b['profile']['is_published']?array($b['profile']):array();if(strpos($path,'/profile_links?')!==false)return $b['links'];return array();};")
    wrapper = root / 'php-cgi'
    wrapper.write_text('#!/bin/sh\nexport TMPDIR='+str(cache)+'\nexec '+shutil.which('php-cgi')+' -d auto_prepend_file='+str(mock)+'\n')
    wrapper.chmod(0o755)
    private = doc / '.private-assets/link-icons'
    private.mkdir(parents=True)
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')
    (private / (hashlib.sha256(b'domain:example.com').hexdigest()+'.png')).write_bytes(png)
    modules = ['mpm_prefork','authz_core','authz_host','access_compat','dir','mime','rewrite','headers','env','setenvif','alias','actions','cgi']
    conf = root / 'httpd.conf'
    conf.write_text('\n'.join(['ServerRoot /etc/apache2','ServerName localhost','Listen 127.0.0.1:4180',f'PidFile {root}/httpd.pid',f'ErrorLog {root}/error.log','LogLevel warn',f'User #{uid}',f'Group #{gid}', 'TypesConfig /etc/mime.types',*[f'LoadModule {m}_module /usr/lib/apache2/modules/mod_{m}.so' for m in modules],f'DocumentRoot "{doc}"',f'<Directory "{doc}">','AllowOverride All','Require all granted','Options +ExecCGI','AddHandler mylinks-php .php','Action mylinks-php /test-php-cgi','</Directory>',f'ScriptAlias /test-php-cgi "{wrapper}"',f'<Directory "{root}">','Require all granted','Options +ExecCGI','</Directory>']))
    proc = subprocess.Popen(['apache2','-f',str(conf),'-DFOREGROUND'],start_new_session=True)
    def get(path, headers=None, redirects=True):
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args): return None
        opener = urllib.request.build_opener() if redirects else urllib.request.build_opener(NoRedirect())
        req=urllib.request.Request('http://127.0.0.1:4180'+path,headers={'X-Forwarded-Proto':'https',**(headers or {})})
        try:r=opener.open(req,timeout=8)
        except urllib.error.HTTPError as err:r=err
        return r.status,r.headers,r.read()
    try:
        for _ in range(50):
            try:
                if get('/')[0]==200:break
            except OSError:pass
            time.sleep(.1)
        status, headers, body = get('/')
        assert status==200 and b'<html' in body.lower(),(status,body[:500])
        assert 'no-store' in headers['Cache-Control'] and not headers.get('ETag') and not headers.get('Last-Modified'),dict(headers)
        validators={'If-None-Match':'"795-65e39242efa24"','If-Modified-Since':'Wed, 21 Oct 2099 07:28:00 GMT'}
        assert get('/',validators)[0]==200
        for path in ['/link-icon/bad.png','/avatar/bad.png','/avatar/fixture-user/00000000-560.webp','/share-image/bad.png','/i/v2/bad.png','/profile-image.php/bad','/profile-image.php','/profile-image.php?handle=fixture-user&asset=11111111-1111-4111-8111-111111111111.webp','/site-icon.php/bad','/icons/missing.png','/i/v2/fixture-user/'+ident+'/000000000000.png']:
            status,h,b=get(path,validators)
            assert status==404 and 'html' not in h.get('Content-Type','') and 'no-store' in h.get('Cache-Control',''),(path,status,dict(h),b[:100])
        new='/i/v2/fixture-user/'+ident+'/'+digest+'.png'
        for _ in range(2):
            status,h,b=get(new,validators)
            assert status==200 and h['Content-Type']=='image/png' and b==png and not h.get('ETag'),(status,dict(h),b[:200])
        status,h,b=get(new.replace('/i/v2/','/link-icon/'),redirects=False)
        assert status==301 and h['Location'].endswith(new),(status,dict(h))
        # Expired bundle revalidates publication, while the stored bitmap survives.
        p=cache/('mylinks-public-profile-'+hashlib.sha256(b'fixture-user').hexdigest()+'.json')
        os.utime(p,(0,0))
        assert get(new)[0]==200
        bundle['profile']['is_published']=False;fixture.write_text(json.dumps(bundle));os.utime(p,(0,0))
        assert get(new)[0]==404
        assert get('/.private-assets/link-icons/anything.png')[0] in [403,404]
        print('Apache: service 404s, old→new 301, poisoned validators, PNG, expired bundle and private profile passed')
    except BaseException:
        print((root/'error.log').read_text())
        raise
    finally:
        proc.terminate();proc.wait(timeout=5)
