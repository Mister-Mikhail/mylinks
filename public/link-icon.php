<?php
if (!defined('MYLINKS_PREVIEW_LIBRARY_ONLY')) define('MYLINKS_PREVIEW_LIBRARY_ONLY', true);
require_once __DIR__ . '/share-profile.php';
require_once __DIR__ . '/asset-cache.php';

function icon_snapshot_from_bundle($bundle, $id, $hash) {
    if (empty($bundle['profile']['is_published']) || !is_array($bundle['links'] ?? null)) return null;
    foreach ($bundle['links'] as $row) {
        if (($row['id'] ?? null) === $id) return icon_snapshot_details($row, $hash);
    }
    return null;
}

function icon_snapshot_details($row, $hash) {
    if (!$row || empty($row['is_visible']) || !isset($row['url'], $row['id']) || !hash_equals(substr(md5($row['url']), 0, 12), $hash)) return null;
    $host = parse_url($row['url'], PHP_URL_HOST);
    if (!$host || !preg_match('/^[a-z0-9.-]+$/iD', $host)) return null;
    return strtolower(preg_replace('/^www\./i', '', $host));
}

require_once __DIR__.'/favicon-fetch.php';
function icon_snapshot_fetch($host) { return icon_collect($host); }
function icon_send_png($key,$host,$private=false,$publicPath=null) {
 $file=icon_cache_file($key);$version=$private?null:($_GET['v']??null);
 if($version!==null&&(!is_string($version)||!preg_match('/^[a-f0-9]{64}$/D',$version))){http_response_code(404);return;}
 $versionFile=$version?icon_cache_file('content:'.$host.':'.$version):null;
 $png=$versionFile&&is_file($versionFile)?file_get_contents($versionFile):null;
 if($png&&(!hash_equals(hash('sha256',$png),$version)||substr($png,0,8)!=="\x89PNG\r\n\x1a\n"))$png=null;
 $old=is_file($file)?file_get_contents($file):null;
 if($old&&substr($old,0,8)!=="\x89PNG\r\n\x1a\n")$old=null;
 $png=$png?:($old?:icon_cached($key,$host));
 if(!$png||($version&&!hash_equals(hash('sha256',$png),$version))){http_response_code(404);header('Content-Type: text/plain; charset=UTF-8');header('Cache-Control: no-store');echo 'Icon unavailable';return;}
 $digest=hash('sha256',$png);$contentFile=icon_cache_file('content:'.$host.':'.$digest);
 icon_cache_access($versionFile?:$file);icon_cache_cleanup($versionFile?:$file);
 header('Content-Type: image/png');header('X-Content-Type-Options: nosniff');header_remove('Last-Modified');header_remove('ETag');
 if(!$private&&!$version&&$publicPath&&(is_file($contentFile)||icon_cache_store($contentFile,$png))){
  header('Cache-Control: public, max-age=300, must-revalidate');header('Location: '.$publicPath.'?v='.$digest,true,302);header('Content-Length: 0');
 }else{
  header('ETag: "'.$digest.'"');header('Cache-Control: '.($private?'private, max-age=300, must-revalidate':($version?'public, max-age=31536000, immutable':'public, max-age=300, must-revalidate')));
  if(trim($_SERVER['HTTP_IF_NONE_MATCH']??'')==='"'.$digest.'"')http_response_code(304);
  else{header('Content-Length: '.strlen($png));echo $png;}
 }
 if($old&&!$version&&filemtime($file)<time()-21600){if(function_exists('fastcgi_finish_request'))fastcgi_finish_request();else{if(ob_get_level())@ob_flush();flush();}icon_cached($key,$host);}
}

if (!defined('MYLINKS_ICON_LIBRARY_ONLY')) {
    header('X-Content-Type-Options: nosniff');header('Content-Type: text/plain; charset=UTF-8');header('Cache-Control: no-store');
    $handle=preview_handle($_GET['handle'] ?? null); $id=$_GET['id'] ?? ''; $hash=$_GET['hash'] ?? '';
    // QSA preserves the content version only; route identity always comes from the path.
    $routePath=parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH);
    if(is_string($routePath)&&strpos($routePath,'/i/v2/')===0){
      if(!preg_match('#^/i/v2/([a-z0-9][a-z0-9._-]{1,28}[a-z0-9])/([a-f0-9-]{36})/([a-f0-9]{12})\.png$#D',$routePath,$route)){http_response_code(404);exit;}
      $handle=preview_handle($route[1]);$id=$route[2];$hash=$route[3];
    }
    if (!$handle || !preg_match('/^[a-f0-9-]{36}$/D',$id) || !preg_match('/^[a-f0-9]{12}$/D',$hash)) { http_response_code(404); exit; }
    // The short-lived anon/RLS bundle checks publication, moderation and visibility.
    $host=icon_snapshot_from_bundle(preview_bundle($handle),$id,$hash);
    if (!$host) { http_response_code(404); header('Cache-Control: no-store'); exit; }
    // Reuse a last good pre-v2 snapshot without making the visitor wait.
    $snapshotKey=$id.':'.$hash;$key='domain:'.$host;$file=icon_cache_file($key);
    $previous=icon_cache_file($snapshotKey);
    $legacy=is_file($previous)?$previous:sys_get_temp_dir().'/mylinks-link-icon-'.hash('sha256',$snapshotKey).'.png';
    if(!is_file($file)&&is_file($legacy)&&substr(file_get_contents($legacy,false,null,0,8),0,8)==="\x89PNG\r\n\x1a\n") { if(icon_cache_store($file,file_get_contents($legacy))) @touch($file,filemtime($legacy)); }
    icon_send_png($key,$host,false,'/i/v2/'.$handle.'/'.$id.'/'.$hash.'.png');
}
