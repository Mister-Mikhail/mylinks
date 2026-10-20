<?php
// Public website art only. No private profile/link identifier is accepted here.
define('MYLINKS_ICON_LIBRARY_ONLY',true);
require __DIR__.'/link-icon.php';
header('Cache-Control: no-store');header('Content-Type: text/plain; charset=UTF-8');
$host=strtolower(trim($_GET['domain']??''));
if(!icon_valid_host($host)){http_response_code(400);echo 'Invalid domain';exit;}
// Bounded per-origin work; a missing site is negatively cached for five minutes.
$rate=sys_get_temp_dir().'/mylinks-icon-rate-'.hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown');$lock=@fopen($rate,'c+');
if($lock&&flock($lock,LOCK_EX)){$r=json_decode(stream_get_contents($lock),true);$now=time();$r=is_array($r)&&($r['at']??0)>$now-60?$r:array('at'=>$now,'count'=>0);$r['count']++;rewind($lock);ftruncate($lock,0);fwrite($lock,json_encode($r));flock($lock,LOCK_UN);fclose($lock);if($r['count']>120){http_response_code(429);header('Retry-After: 60');exit;}}
icon_send_png('domain:'.$host,$host,true);
