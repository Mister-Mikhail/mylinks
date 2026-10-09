<?php
define('MYLINKS_PREVIEW_LIBRARY_ONLY', true);
require __DIR__ . '/share-profile.php';

// Always return a real PNG, including failures and profiles made private.
function preview_image_fallback() {
    header('Content-Type: image/png');
    readfile(__DIR__ . '/share-default.png');
    exit;
}

function preview_avatar_bytes($profile) {
    $path = implode('/', array_map('rawurlencode', explode('/', $profile['avatar_path'])));
    $result = preview_api('/storage/v1/object/sign/avatars/' . $path, array('expiresIn' => 60));
    if (!isset($result['signedURL']) || strpos($result['signedURL'], '/object/sign/avatars/') !== 0) return null;
    $config = require __DIR__ . '/preview-config.php';
    $curl = curl_init($config['url'] . '/storage/v1' . $result['signedURL']);
    $bytes = '';
    curl_setopt_array($curl, array(
        CURLOPT_CONNECTTIMEOUT => 2, CURLOPT_TIMEOUT => 5,
        CURLOPT_WRITEFUNCTION => function ($curl, $chunk) use (&$bytes) {
            if (strlen($bytes) + strlen($chunk) > 8 * 1024 * 1024) return 0;
            $bytes .= $chunk;
            return strlen($chunk);
        },
    ));
    $ok = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    return $ok !== false && $status === 200 ? $bytes : null;
}

function preview_image_render($bytes) {
    $info = @getimagesizefromstring($bytes);
    if (!$info || $info[0] * $info[1] > 16000000) return null;
    $avatar = @imagecreatefromstring($bytes);
    $canvas = @imagecreatefrompng(__DIR__ . '/share-default.png');
    if (!$avatar || !$canvas) return null;
    $background = imagecolorallocate($canvas,17,22,30);
    imagefilledrectangle($canvas,75,70,570,560,$background);
    $side = min(imagesx($avatar),imagesy($avatar));
    imagecopyresampled($canvas,$avatar,90,95,(int)((imagesx($avatar)-$side)/2),(int)((imagesy($avatar)-$side)/2),440,440,$side,$side);
    ob_start();
    imagepng($canvas,null,6);
    $png = ob_get_clean();
    unset($avatar);
    unset($canvas);
    return $png;
}

if (!defined('MYLINKS_PREVIEW_IMAGE_LIBRARY_ONLY')) {
    header('Content-Type: image/png');
    header('Cache-Control: no-cache, max-age=0');
    $handle = preview_handle(isset($_GET['handle']) ? $_GET['handle'] : null);
    $profile = preview_profile($handle);
    if (!$profile || empty($profile['avatar_path']) || !function_exists('imagecreatefromstring')) preview_image_fallback();
    // Cache only image bytes; publication is checked through RLS on every request.
    $key = hash('sha256',$profile['avatar_path'] . $profile['updated_at']);
    $cache = sys_get_temp_dir() . '/mylinks-preview-' . $key . '.png';
    if (is_file($cache) && filemtime($cache) > time()-86400) { readfile($cache); exit; }
    $bytes = preview_avatar_bytes($profile);
    $png = $bytes ? preview_image_render($bytes) : null;
    if (!$png) preview_image_fallback();
    $temporary = @tempnam(sys_get_temp_dir(),'mylinks-preview-');
    if ($temporary) {
        if (@file_put_contents($temporary,$png) !== false) @rename($temporary,$cache);
        if (is_file($temporary)) @unlink($temporary);
    }
    echo $png;
}
