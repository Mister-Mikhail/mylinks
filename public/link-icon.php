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
function icon_send_png($key,$host,$private=false) {
 $file=icon_cache_file($key);
 $old=is_file($file)?file_get_contents($file):null;
 if($old && substr($old,0,8)!=="\x89PNG\r\n\x1a\n")$old=null;
 $png=$old?:icon_cached($key,$host);
 if(!$png){http_response_code(404);header('Content-Type: text/plain; charset=UTF-8');header('Cache-Control: no-store');echo 'Icon unavailable';return;}
 header('Content-Type: image/png');header('X-Content-Type-Options: nosniff');header_remove('ETag');header_remove('Last-Modified');
 header('Cache-Control: '.($private?'private':'public').', max-age=300, must-revalidate');header('Content-Length: '.strlen($png));echo $png;
 if($old&&filemtime($file)<time()-21600){if(function_exists('fastcgi_finish_request'))fastcgi_finish_request();else{if(ob_get_level())@ob_flush();flush();}icon_cached($key,$host);}
}

if (!defined('MYLINKS_ICON_LIBRARY_ONLY')) {
    header('X-Content-Type-Options: nosniff');header('Content-Type: text/plain; charset=UTF-8');header('Cache-Control: no-store');
    $handle=preview_handle($_GET['handle'] ?? null); $id=$_GET['id'] ?? ''; $hash=$_GET['hash'] ?? '';
    if (!$handle || !preg_match('/^[a-f0-9-]{36}$/D',$id) || !preg_match('/^[a-f0-9]{12}$/D',$hash)) { http_response_code(404); exit; }
    // The short-lived anon/RLS bundle checks publication, moderation and visibility.
    $host=icon_snapshot_from_bundle(preview_bundle($handle),$id,$hash);
    if (!$host) { http_response_code(404); header('Cache-Control: no-store'); exit; }
    // Reuse a last good pre-v2 snapshot without making the visitor wait.
    $snapshotKey=$id.':'.$hash;$key='domain:'.$host;$file=icon_cache_file($key);
    $previous=icon_cache_file($snapshotKey);
    $legacy=is_file($previous)?$previous:sys_get_temp_dir().'/mylinks-link-icon-'.hash('sha256',$snapshotKey).'.png';
    if(!is_file($file)&&is_file($legacy)&&substr(file_get_contents($legacy,false,null,0,8),0,8)==="\x89PNG\r\n\x1a\n"){$temporary=@tempnam(dirname($file),'icon-import-');if($temporary){@copy($legacy,$temporary);@chmod($temporary,0600);@touch($temporary,filemtime($legacy));@rename($temporary,$file);if(is_file($temporary))@unlink($temporary);}}
    icon_send_png($key,$host);
}
