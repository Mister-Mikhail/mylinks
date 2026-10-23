<?php
define('MYLINKS_ICON_LIBRARY_ONLY',true);
require __DIR__.'/link-icon.php';require_once __DIR__.'/icon-access.php';
header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('Content-Type: application/json; charset=UTF-8');
$method=$_SERVER['REQUEST_METHOD']??'GET';
if($method==='POST') {
    $owner=icon_owner($_SERVER['HTTP_AUTHORIZATION']??'');
    if(!$owner){http_response_code(401);echo '{"error":"Owner authentication required"}';exit;}
    $raw=file_get_contents('php://input',false,null,0,8193);$body=strlen($raw)<=8192?json_decode($raw,true):null;$domains=$body['domains']??null;
    if(!is_array($domains)||count($domains)<1||count($domains)>40){http_response_code(400);exit;}
    foreach($domains as $host)if(!icon_valid_host($host)){http_response_code(400);exit;}
    $domains=array_values(array_unique($domains));
    if(!icon_owner_rate($owner,count($domains))){http_response_code(429);header('Retry-After: 60');exit;}
    asset_cache_cleanup();
    $key=icon_signing_key();if(!$key){http_response_code(503);exit;}
    $urls=array();foreach($domains as $host)$urls[$host]=icon_signed_url($host,$owner,$key);
    echo json_encode(array('urls'=>$urls,'expires'=>time()+600));exit;
}
if($method!=='GET'){http_response_code(405);header('Allow: GET, POST');exit;}
// Fail before DNS/ffmpeg/cache allocation for an unsigned visitor.
if(!isset($_GET['sig'])){http_response_code(401);echo '{"error":"Signed icon address required"}';exit;}
$key=icon_signing_key();
if(!$key||!icon_valid_signature($_GET,$key)){http_response_code(403);echo '{"error":"Invalid or expired icon address"}';exit;}
icon_send_png('domain:'.$_GET['domain'],$_GET['domain'],true);
