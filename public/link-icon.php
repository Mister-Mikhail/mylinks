<?php
if (!defined('MYLINKS_PREVIEW_LIBRARY_ONLY')) define('MYLINKS_PREVIEW_LIBRARY_ONLY', true);
require_once __DIR__ . '/share-profile.php';

function icon_snapshot_details($row, $hash) {
    if (!$row || empty($row['is_visible']) || !isset($row['url'], $row['id']) || !hash_equals(substr(md5($row['url']), 0, 12), $hash)) return null;
    $host = parse_url($row['url'], PHP_URL_HOST);
    if (!$host || !preg_match('/^[a-z0-9.-]+$/iD', $host)) return null;
    return strtolower(preg_replace('/^www\./i', '', $host));
}

function icon_snapshot_fetch($host) {
    if (!function_exists('curl_init')) return null;
    $config = require __DIR__ . '/preview-config.php';
    $curl = curl_init($config['url'] . '/functions/v1/favicon?domain=' . rawurlencode($host) . '&raster=1');
    curl_setopt_array($curl, array(CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>12,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_HTTPHEADER=>array('apikey: ' . $config['key'])));
    $bytes = curl_exec($curl); $status = curl_getinfo($curl,CURLINFO_HTTP_CODE); curl_close($curl);
    if ($status !== 200 || !is_string($bytes) || strlen($bytes)>262144) return null;
    $image=function_exists('imagecreatefromstring') ? @imagecreatefromstring($bytes) : false;
    if ($image) {
        $target=imagecreatetruecolor(64,64);
        imagealphablending($target,false); imagesavealpha($target,true);
        imagefill($target,0,0,imagecolorallocatealpha($target,0,0,0,127));
        imagecopyresampled($target,$image,0,0,0,0,64,64,imagesx($image),imagesy($image));
        ob_start(); imagepng($target,null,7); $png=ob_get_clean();
        imagedestroy($image); imagedestroy($target);
        return $png;
    }
    $ffmpeg=is_executable('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : (is_executable('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : null);
    $timeout=is_executable('/usr/bin/timeout') ? '/usr/bin/timeout' : (is_executable('/usr/local/bin/timeout') ? '/usr/local/bin/timeout' : null);
    if (!$ffmpeg || !$timeout || !function_exists('proc_open')) return null;
    $source=tempnam(sys_get_temp_dir(),'mylinks-icon-source-'); $target=tempnam(sys_get_temp_dir(),'mylinks-icon-png-');
    if (!$source || !$target) return null;
    file_put_contents($source,$bytes);
    $args=array($timeout,'8s',$ffmpeg,'-nostdin','-v','error','-y','-i',$source,'-frames:v','1','-vf','scale=64:64:flags=lanczos','-f','image2','-vcodec','png',$target);
    $process=proc_open(implode(' ',array_map('escapeshellarg',$args)),array(0=>array('pipe','r'),1=>array('pipe','w'),2=>array('pipe','w')),$pipes);
    $png=null;
    if (is_resource($process)) { fclose($pipes[0]); stream_get_contents($pipes[1]); fclose($pipes[1]); stream_get_contents($pipes[2]); fclose($pipes[2]); if (proc_close($process)===0 && filesize($target)<262144) $png=file_get_contents($target); }
    @unlink($source); @unlink($target);
    return $png && substr($png,0,8)==="\x89PNG\r\n\x1a\n" ? $png : null;
}

if (!defined('MYLINKS_ICON_LIBRARY_ONLY')) {
    header('X-Content-Type-Options: nosniff');
    $id=$_GET['id'] ?? ''; $hash=$_GET['hash'] ?? '';
    if (!preg_match('/^[a-f0-9-]{36}$/D',$id) || !preg_match('/^[a-f0-9]{12}$/D',$hash)) { http_response_code(404); exit; }
    // Anon RLS checks publication, link visibility and moderation on every asset request.
    $rows=preview_api('/rest/v1/profile_links?select=id,url,is_visible&is_visible=eq.true&id=eq.' . rawurlencode($id) . '&limit=1');
    $host=is_array($rows) && isset($rows[0]) ? icon_snapshot_details($rows[0],$hash) : null;
    if (!$host) { http_response_code(404); header('Cache-Control: no-store'); exit; }
    $cache=sys_get_temp_dir() . '/mylinks-link-icon-' . hash('sha256',$id . ':' . $hash) . '.png';
    if (!is_file($cache)) {
        $lock=fopen($cache . '.lock','c');
        if ($lock) {
            flock($lock,LOCK_EX);
            if (!is_file($cache)) {
                $png=icon_snapshot_fetch($host);
                if ($png) { $temporary=tempnam(sys_get_temp_dir(),'mylinks-icon-write-'); if ($temporary) { file_put_contents($temporary,$png); rename($temporary,$cache); } }
            }
            flock($lock,LOCK_UN); fclose($lock);
        }
    }
    if (!is_file($cache)) { http_response_code(404); header('Cache-Control: no-store'); exit; }
    header('Content-Type: image/png'); header('Content-Length: ' . filesize($cache));
    header('Cache-Control: public, max-age=31536000, immutable'); readfile($cache);
}
