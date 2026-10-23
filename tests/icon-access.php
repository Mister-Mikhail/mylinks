<?php
$root=sys_get_temp_dir().'/mylinks-access-test-'.bin2hex(random_bytes(8));
define('MYLINKS_ICON_CACHE_DIR',$root.'/icons');
define('MYLINKS_ICON_LIBRARY_ONLY',true);
require __DIR__.'/../public/link-icon.php';require __DIR__.'/../public/icon-access.php';
function access_check($value,$message){if(!$value)throw new Exception($message);}
register_shutdown_function(function()use($root){foreach(glob($root.'/icons/*')?:array() as $p)@unlink($p);@rmdir($root.'/icons');foreach(glob($root.'/*')?:array() as $p)@unlink($p);@rmdir($root);});
$key=icon_signing_key();access_check(strlen($key)===32&&icon_signing_key()===$key,'Signing key must persist');
access_check((fileperms($root.'/icon-signing.key')&0777)===0600,'Signing key permissions');
$now=time();parse_str(parse_url(icon_signed_url('example.com','owner-a',$key,$now),PHP_URL_QUERY),$q);
access_check(icon_valid_signature($q,$key,$now),'Valid owner signature rejected');
foreach(array('domain'=>'other.example.com','owner'=>str_repeat('0',32),'expires'=>$now-1,'sig'=>str_repeat('0',64)) as $name=>$value){$bad=$q;$bad[$name]=$value;access_check(!icon_valid_signature($bad,$key,$now),'Tampered '.$name.' accepted');}
access_check(!icon_valid_signature($q,$key,$now+601),'Expired signature accepted');
$bad=$q;$bad['domain']=array('example.com');access_check(!icon_valid_signature($bad,$key,$now),'Array input accepted');
$id='00000000-0000-4000-8000-000000000091';$calls=array();
$GLOBALS['MYLINKS_PREVIEW_API_TEST']=function($path,$body,$token)use($id,&$calls){$calls[]=$path;if($token!=='valid.owner.signature')return null;return $path==='/auth/v1/user'?array('id'=>$id):array(array('id'=>$id));};
access_check(icon_owner('Bearer forged.owner.signature')===null,'Forged JWT accepted');
access_check(icon_owner('Bearer valid.owner.signature')===$id,'Verified profile owner rejected');
access_check(in_array('/auth/v1/user',$calls,true),'Auth must verify token');
$GLOBALS['MYLINKS_PREVIEW_API_TEST']=function($path)use($id){return $path==='/auth/v1/user'?array('id'=>$id):array();};
access_check(icon_owner('Bearer valid.owner.signature')===null,'User without own profile accepted');
$old=icon_cache_file('old');file_put_contents($old,'old');touch($old,$now-31*86400);
$hot=icon_cache_file('hot');file_put_contents($hot,'hot');touch($hot,$now-31*86400);icon_cache_access($hot);$mtime=filemtime($hot);
icon_cache_cleanup(null,true);access_check(!is_file($old)&&is_file($hot),'Inactive cache must expire; hot old bitmap must survive');
access_check(filemtime($hot)===$mtime,'Access must not reset refresh timestamp');
foreach(glob(icon_cache_dir().'/*') as $p)if(is_file($p))unlink($p);
$paths=array();for($i=0;$i<4;$i++){$p=icon_cache_file('capacity-'.$i);file_put_contents($p,str_repeat('x',8));touch($p,$now-100+$i);$paths[]=$p;}
access_check(icon_cache_maintenance(function()use($now){return icon_cache_prune(null,0,0,$now,2,16);}), 'Capacity cleanup failed');
access_check(count(glob(icon_cache_dir().'/*.png'))===2&&!is_file($paths[0])&&!is_file($paths[1]),'LRU count/byte budget not enforced');
$busy=icon_cache_file('busy');file_put_contents($busy,'x');$lock=fopen($busy.'.lock','c');flock($lock,LOCK_EX);touch($busy,$now-31*86400);touch($busy.'.lock',$now-31*86400);
icon_cache_cleanup(null,true);access_check(is_file($busy),'Cleanup removed an active writer');flock($lock,LOCK_UN);fclose($lock);
echo "Icon owner authentication, HMAC tampering/expiry, 30-day access cleanup, LRU count/bytes and active locks passed\n";
