<?php
define('MYLINKS_PREVIEW_LIBRARY_ONLY', true);
require __DIR__ . '/share-profile.php';

// Always return a real PNG, including failures and profiles made private.
function preview_image_fallback($reason) {
    header('Content-Type: image/png');
    header('X-Mylinks-Preview: fallback-' . $reason);
    readfile(__DIR__ . '/share-default.png');
    exit;
}

function preview_avatar_bytes($profile) {
    $path = implode('/', array_map('rawurlencode', explode('/', (!empty($profile['avatar_poster_path']) ? $profile['avatar_poster_path'] : $profile['avatar_path']))));
    $result = preview_api('/storage/v1/object/sign/avatars/' . $path, array('expiresIn' => 3600));
    if (!isset($result['signedURL']) || strpos($result['signedURL'], '/object/sign/avatars/') !== 0) { header('X-Mylinks-Avatar-Fetch: sign-failed'); return null; }
    $config = require __DIR__ . '/preview-config.php';
    $curl = curl_init($config['url'] . '/storage/v1' . $result['signedURL']);
    $bytes = '';
    curl_setopt_array($curl, array(
        CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 12,
        CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
        CURLOPT_USERAGENT => 'mylinks.bar preview image',
        CURLOPT_HTTPHEADER => array('apikey: ' . $config['key'], 'Accept: image/*'),
        CURLOPT_WRITEFUNCTION => function ($curl, $chunk) use (&$bytes) {
            if (strlen($bytes) + strlen($chunk) > 8 * 1024 * 1024) return 0;
            $bytes .= $chunk;
            return strlen($chunk);
        },
    ));
    if (defined('CURLOPT_PROTOCOLS_STR')) {
        curl_setopt($curl,CURLOPT_PROTOCOLS_STR,'https');
        curl_setopt($curl,CURLOPT_REDIR_PROTOCOLS_STR,'https');
    } else {
        curl_setopt($curl,CURLOPT_PROTOCOLS,CURLPROTO_HTTPS);
        curl_setopt($curl,CURLOPT_REDIR_PROTOCOLS,CURLPROTO_HTTPS);
    }
    $ok = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    header('X-Mylinks-Avatar-Fetch: http-' . $status);
    curl_close($curl);
    return $ok !== false && $status === 200 ? $bytes : null;
}

function preview_image_render_gd($bytes, $shape = 'round') {
    if (!function_exists('imagecreatefromstring')) return null;
    $info = @getimagesizefromstring($bytes);
    if (!$info || $info[0] * $info[1] > 16000000) return null;
    $avatar = @imagecreatefromstring($bytes);
    $canvas = @imagecreatefrompng(__DIR__ . '/share-default.png');
    if (!$avatar || !$canvas) return null;
    $background = imagecolorallocate($canvas,17,22,30);
    imagefilledrectangle($canvas,75,70,570,560,$background);
    $aspect = $shape === 'full' ? 0.8 : 1.0;
    $cropWidth = min(imagesx($avatar), imagesy($avatar)*$aspect);
    $cropHeight = $cropWidth/$aspect;
    imagecopyresampled($canvas,$avatar,90,$shape === 'full' ? 40 : 95,(int)((imagesx($avatar)-$cropWidth)/2),(int)((imagesy($avatar)-$cropHeight)/2),440,(int)(440/$aspect),(int)$cropWidth,(int)$cropHeight);
    ob_start();
    imagepng($canvas,null,6);
    $png = ob_get_clean();
    unset($avatar);
    unset($canvas);
    return $png;
}

function preview_image_render_imagick($bytes, $shape = 'round') {
    if (!class_exists('Imagick')) return null;
    try {
        Imagick::setResourceLimit(Imagick::RESOURCETYPE_MEMORY,64*1024*1024);
        Imagick::setResourceLimit(Imagick::RESOURCETYPE_MAP,64*1024*1024);
        Imagick::setResourceLimit(Imagick::RESOURCETYPE_DISK,0);
        $avatar = new Imagick();
        $avatar->readImageBlob($bytes);
        if ($avatar->getImageWidth()*$avatar->getImageHeight()>16000000) return null;
        $avatar->setIteratorIndex(0);
        $avatar = $avatar->getImage();
        $avatar->cropThumbnailImage(440,$shape === 'full' ? 550 : 440);
        $canvas = new Imagick(__DIR__ . '/share-default.png');
        $draw = new ImagickDraw();
        $draw->setFillColor('#11161e');
        $draw->rectangle(75,70,570,560);
        $canvas->drawImage($draw);
        $canvas->compositeImage($avatar,Imagick::COMPOSITE_OVER,90,$shape === 'full' ? 40 : 95);
        $canvas->setImageFormat('png');
        return $canvas->getImageBlob();
    } catch (Exception $error) { return null; }
}

function preview_image_render($bytes, $shape = 'round') {
    // Do not pass arbitrary formats (e.g. SVG) to an image delegate.
    $raster = substr($bytes,0,8)==="\x89PNG\r\n\x1a\n" || substr($bytes,0,3)==="\xff\xd8\xff"
        || (substr($bytes,0,4)==='RIFF' && substr($bytes,8,4)==='WEBP');
    if (!$raster) return null;
    $png = preview_image_render_gd($bytes,$shape);
    if ($png) { header('X-Mylinks-Preview-Engine: gd'); return $png; }
    $png = preview_image_render_imagick($bytes,$shape);
    if ($png) header('X-Mylinks-Preview-Engine: imagick');
    return $png;
}

if (!defined('MYLINKS_PREVIEW_IMAGE_LIBRARY_ONLY')) {
    header('Content-Type: image/png');
    header('Cache-Control: no-cache, max-age=0');
    $handle = preview_handle(isset($_GET['handle']) ? $_GET['handle'] : null);
    $profile = preview_profile($handle);
    if (!$profile || empty($profile['avatar_path'])) preview_image_fallback('profile');
    if (!function_exists('imagecreatefromstring') && !class_exists('Imagick')) preview_image_fallback('engine');
    // Cache only image bytes; publication is checked through RLS on every request.
    $key = hash('sha256','png-v3' . ($profile['avatar_shape'] ?? 'round') . $profile['avatar_path'] . $profile['updated_at']);
    $cache = sys_get_temp_dir() . '/mylinks-preview-' . $key . '.png';
    if (is_file($cache) && filemtime($cache) > time()-86400) { header('X-Mylinks-Preview: avatar-cached'); readfile($cache); exit; }
    $bytes = preview_avatar_bytes($profile);
    $png = $bytes ? preview_image_render($bytes,$profile['avatar_shape'] ?? 'round') : null;
    if (!$png) preview_image_fallback($bytes ? 'decode' : 'download');
    $temporary = @tempnam(sys_get_temp_dir(),'mylinks-preview-');
    if ($temporary) {
        if (@file_put_contents($temporary,$png) !== false) @rename($temporary,$cache);
        if (is_file($temporary)) @unlink($temporary);
    }
    header('X-Mylinks-Preview: avatar');
    echo $png;
}
