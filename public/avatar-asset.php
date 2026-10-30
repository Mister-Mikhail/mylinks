<?php
define('MYLINKS_PREVIEW_LIBRARY_ONLY', true);
require __DIR__ . '/share-profile.php';
require_once __DIR__ . '/asset-cache.php';

function avatar_asset_range($range, $total) {
    if (!is_string($range) || !preg_match('/^bytes=(\d+)-(\d*)$/D', $range, $parts) || $total < 1) return null;
    $start = (int) $parts[1];
    $end = $parts[2] === '' ? $total - 1 : (int) $parts[2];
    if ($start >= $total || $end < $start) return null;
    return array($start, min($end, $total - 1));
}

function avatar_asset_serve($path, $type, $range = null) {
    $total = filesize($path);
    header('Accept-Ranges: bytes');
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Type: ' . $type);
    if ($range !== null) {
        $bounds = avatar_asset_range($range, $total);
        if (!$bounds) {
            http_response_code(416);
            header('Content-Range: bytes */' . $total);
            header('Content-Length: 0');
            return;
        }
        list($start, $end) = $bounds;
        http_response_code(206);
        header('Content-Range: bytes ' . $start . '-' . $end . '/' . $total);
    } else { $start = 0; $end = $total - 1; }
    header('Content-Length: ' . ($end - $start + 1));
    $file = fopen($path, 'rb');
    if (!$file) return;
    fseek($file, $start);
    $remaining = $end - $start + 1;
    while ($remaining > 0 && !feof($file)) {
        $chunk = fread($file, min(65536, $remaining));
        if ($chunk === false || $chunk === '') break;
        echo $chunk;
        $remaining -= strlen($chunk);
    }
    fclose($file);
}

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
    $ffmpeg=is_executable('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : (is_executable('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : null);
    $timeout=is_executable('/usr/bin/timeout') ? '/usr/bin/timeout' : (is_executable('/usr/local/bin/timeout') ? '/usr/local/bin/timeout' : null);
    if (!function_exists('proc_open') || !$ffmpeg || !$timeout) return null;
    $source = @tempnam(sys_get_temp_dir(),'mylinks-video-');
    $result = @tempnam(sys_get_temp_dir(),'mylinks-poster-');
    if (!$source || !$result) return null;
    file_put_contents($source,$bytes);
    $args = array($timeout,'15s',$ffmpeg,'-nostdin','-v','error','-y','-ss','0.15','-i',$source,'-frames:v','1','-vf','scale=1000:-2:flags=lanczos','-c:v','libwebp','-quality','84','-f','webp',$result);
    $process = proc_open(implode(' ',array_map('escapeshellarg',$args)),array(0=>array('pipe','r'),1=>array('pipe','w'),2=>array('pipe','w')),$pipes);
    $image = null;
    if (is_resource($process)) { fclose($pipes[0]); stream_get_contents($pipes[1]); fclose($pipes[1]); stream_get_contents($pipes[2]); fclose($pipes[2]); if (proc_close($process)===0 && filesize($result)<3*1024*1024) $image=file_get_contents($result); }
    @unlink($source); @unlink($result);
    return $image;
}

if (!defined('MYLINKS_AVATAR_LIBRARY_ONLY')) {
    header('X-Content-Type-Options: nosniff');
    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: no-store');
    $handle = preview_handle($_GET['handle'] ?? null);
    $hash = $_GET['hash'] ?? ''; $size = $_GET['size'] ?? ''; $poster = ($_GET['poster'] ?? '') === 'poster'; $extension = $_GET['extension'] ?? '';
    $bundle = $handle && preg_match('/^[a-f0-9]{8}$/D',$hash) && in_array($size,array('560','1000'),true) ? preview_bundle($handle) : null;
    $profile = $bundle['profile'] ?? null;
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
            if ($valid) { $temporary = @tempnam(sys_get_temp_dir(),'mylinks-avatar-write-'); if ($temporary) { file_put_contents($temporary,$bytes); if (@rename($temporary,$cache)) asset_cache_cleanup(); if (is_file($temporary)) @unlink($temporary); } }
        }
        flock($lock,LOCK_UN); fclose($lock);
    }
    if (!is_file($cache)) { http_response_code(502); header('Cache-Control: no-store'); exit; }
    avatar_asset_serve($cache, $detail['type'], $_SERVER['HTTP_RANGE'] ?? null);
}
