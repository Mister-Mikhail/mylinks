<?php
define('MYLINKS_PREVIEW_LIBRARY_ONLY', true);
require __DIR__ . '/share-profile.php';

function avatar_fingerprint($profile) {
    $source = implode('|', array($profile['avatar_path'] ?? '', $profile['avatar_master_path'] ?? '', $profile['avatar_poster_path'] ?? ''));
    $hash = 2166136261;
    for ($i = 0; $i < strlen($source); $i++) $hash = (($hash ^ ord($source[$i])) * 16777619) & 0xffffffff;
    return sprintf('%08x', $hash);
}

function avatar_asset_details($profile, $hash, $size, $poster, $extension) {
    if (!$profile || empty($profile['is_published']) || empty($profile['avatar_path']) || !hash_equals(avatar_fingerprint($profile), $hash)) return null;
    $video = ($profile['avatar_media'] ?? '') === 'video';
    if ($extension !== ($poster || !$video ? 'webp' : 'mp4')) return null;
    if ($poster && !$video) return null;
    $path = $size === '1000' ? ($profile['avatar_master_path'] ?? null) : ($poster ? ($profile['avatar_poster_path'] ?? null) : $profile['avatar_path']);
    if ($poster && $size === '1000') $path = $profile['avatar_master_path'] ?? null;
    if (!$path || !preg_match('#^' . preg_quote($profile['id'] ?? '', '#') . '/[A-Za-z0-9._-]+$#D', $path)) return null;
    return array('path'=>$path, 'type'=>$poster || !$video ? 'image/webp' : 'video/mp4', 'renderPoster'=>$poster && $size === '1000');
}

function avatar_asset_download($path) {
    $encoded = implode('/', array_map('rawurlencode', explode('/', $path)));
    $signed = preview_api('/storage/v1/object/sign/avatars/' . $encoded, array('expiresIn'=>60));
    if (!isset($signed['signedURL']) || strpos($signed['signedURL'], '/object/sign/avatars/') !== 0) return null;
    $config = require __DIR__ . '/preview-config.php';
    $curl = curl_init($config['url'] . '/storage/v1' . $signed['signedURL']);
    $bytes = '';
    curl_setopt_array($curl, array(CURLOPT_RETURNTRANSFER=>false,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>15,
        CURLOPT_FOLLOWLOCATION=>false,CURLOPT_HTTPHEADER=>array('apikey: ' . $config['key']),
        CURLOPT_WRITEFUNCTION=>function ($curl,$chunk) use (&$bytes) { if (strlen($bytes)+strlen($chunk)>6*1024*1024) return 0; $bytes.=$chunk; return strlen($chunk); }));
    $ok = curl_exec($curl); $status = curl_getinfo($curl,CURLINFO_HTTP_CODE); curl_close($curl);
    return $ok && $status===200 ? $bytes : null;
}

function avatar_asset_poster($bytes) {
    if (!function_exists('proc_open') || !is_executable('/usr/bin/ffmpeg') || !is_executable('/usr/bin/timeout')) return null;
    $source = @tempnam(sys_get_temp_dir(),'mylinks-video-');
    $result = @tempnam(sys_get_temp_dir(),'mylinks-poster-');
    if (!$source || !$result) return null;
    file_put_contents($source,$bytes);
    $args = array('/usr/bin/timeout','15s','/usr/bin/ffmpeg','-nostdin','-v','error','-y','-ss','0.15','-i',$source,'-frames:v','1','-vf','scale=1000:1000:flags=lanczos','-c:v','libwebp','-quality','84','-f','webp',$result);
    $process = proc_open(implode(' ',array_map('escapeshellarg',$args)),array(0=>array('pipe','r'),1=>array('pipe','w'),2=>array('pipe','w')),$pipes);
    $image = null;
    if (is_resource($process)) { fclose($pipes[0]); stream_get_contents($pipes[1]); fclose($pipes[1]); stream_get_contents($pipes[2]); fclose($pipes[2]); if (proc_close($process)===0 && filesize($result)<3*1024*1024) $image=file_get_contents($result); }
    @unlink($source); @unlink($result);
    return $image;
}

if (!defined('MYLINKS_AVATAR_LIBRARY_ONLY')) {
    header('X-Content-Type-Options: nosniff');
    $handle = preview_handle($_GET['handle'] ?? null);
    $hash = $_GET['hash'] ?? ''; $size = $_GET['size'] ?? ''; $poster = ($_GET['poster'] ?? '') === 'poster'; $extension = $_GET['extension'] ?? '';
    $profile = $handle && preg_match('/^[a-f0-9]{8}$/D',$hash) && in_array($size,array('560','1000'),true) ? preview_profile($handle) : null;
    $detail = avatar_asset_details($profile,$hash,$size,$poster,$extension);
    if (!$detail) { http_response_code(404); header('Cache-Control: no-store'); exit; }
    $key = hash('sha256',$detail['path'] . '|' . $size . '|' . ($poster ? 'poster' : 'media'));
    $cache = sys_get_temp_dir() . '/mylinks-avatar-cache-' . $key . '.' . $extension;
    if (!is_file($cache)) {
        $lock = fopen($cache . '.lock','c');
        if (!$lock) { http_response_code(503); exit; }
        flock($lock,LOCK_EX);
        if (!is_file($cache)) {
            $bytes = avatar_asset_download($detail['path']);
            if ($bytes && $detail['renderPoster']) $bytes = avatar_asset_poster($bytes);
            $valid = $detail['type'] === 'image/webp' ? substr($bytes ?? '',0,4)==='RIFF' && substr($bytes ?? '',8,4)==='WEBP' : substr($bytes ?? '',4,4)==='ftyp';
            if ($valid) { $temporary = @tempnam(sys_get_temp_dir(),'mylinks-avatar-write-'); if ($temporary) { file_put_contents($temporary,$bytes); @rename($temporary,$cache); if (is_file($temporary)) @unlink($temporary); } }
        }
        flock($lock,LOCK_UN); fclose($lock);
    }
    if (!is_file($cache)) { http_response_code(502); header('Cache-Control: no-store'); exit; }
    header('Content-Type: ' . $detail['type']);
    header('Content-Length: ' . filesize($cache));
    header('Cache-Control: public, max-age=31536000, immutable');
    readfile($cache);
}
