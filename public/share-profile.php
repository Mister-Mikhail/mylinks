<?php
// Only published, moderation-approved data is read with the public Supabase key.
function preview_api($path, $body = null) {
    $configPath = __DIR__ . '/preview-config.php';
    if (!is_file($configPath) || !function_exists('curl_init')) return null;
    $config = require $configPath;
    $curl = curl_init($config['url'] . $path);
    curl_setopt_array($curl, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_HTTPHEADER => array('apikey: ' . $config['key'], 'Content-Type: application/json'),
    ));
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POST, true);
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $raw = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    return $raw !== false && $status >= 200 && $status < 300 ? json_decode($raw, true) : null;
}

function preview_handle($value) {
    return is_string($value) && preg_match('/^[a-z0-9][a-z0-9-]{2,29}$/D', $value)
        && !in_array($value, array('admin','auth','p','assets','icons','sounds','fonts','share-image')) ? $value : null;
}

function preview_profile($handle) {
    if (!$handle) return null;
    $rows = preview_api('/rest/v1/profiles?select=handle,display_name,bio,avatar_path,is_published,updated_at&handle=eq.' . rawurlencode($handle) . '&is_published=eq.true&limit=1');
    return is_array($rows) && isset($rows[0]) && !empty($rows[0]['is_published']) ? $rows[0] : null;
}

function preview_html($html, $profile, $handle) {
    $escape = function ($value) { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); };
    $url = 'https://mylinks.bar/' . rawurlencode($handle);
    $title = $profile ? (trim($profile['display_name']) ?: $handle) . ' — mylinks.bar' : 'mylinks.bar — все ссылки в одном месте';
    $description = $profile ? (trim($profile['bio']) ?: 'Все ссылки ' . (trim($profile['display_name']) ?: $handle) . ' в одном месте.') : 'mylinks.bar — одна ссылка для всего, чем вы делитесь.';
    $image = $profile && !empty($profile['avatar_path'])
        ? 'https://mylinks.bar/share-image/' . rawurlencode($handle) . '.' . substr(hash('sha256', $profile['avatar_path'] . $profile['updated_at']),0,12) . '.png'
        : 'https://mylinks.bar/share-default.png';
    $html = preg_replace('/<title>.*?<\/title>/s', '<title>' . $escape($title) . '</title>', $html);
    $html = preg_replace('/<meta name="description"[^>]*\/>/', '<meta name="description" content="' . $escape($description) . '" />', $html);
    $meta = "\n" . '<link rel="canonical" href="' . $escape($url) . '" />';
    foreach (array('og:type'=>'website','og:site_name'=>'mylinks.bar','og:locale'=>'ru_RU','og:title'=>$title,'og:description'=>$description,'og:url'=>$url,'og:image'=>$image,'og:image:secure_url'=>$image,'og:image:type'=>'image/png','og:image:width'=>'1200','og:image:height'=>'630','og:image:alt'=>$profile ? $profile['display_name'] : 'mylinks.bar') as $key=>$value) {
        $meta .= "\n" . '<meta property="' . $key . '" content="' . $escape($value) . '" />';
    }
    $meta .= "\n" . '<meta name="twitter:card" content="summary_large_image" />';
    foreach (array('title'=>$title,'description'=>$description,'image'=>$image) as $key=>$value) {
        $meta .= "\n" . '<meta name="twitter:' . $key . '" content="' . $escape($value) . '" />';
    }
    if (!$profile) $meta .= "\n" . '<meta name="robots" content="noindex" />';
    return str_replace('</head>', $meta . "\n</head>", $html);
}

if (!defined('MYLINKS_PREVIEW_LIBRARY_ONLY')) {
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-cache, max-age=0');
    $handle = preview_handle(isset($_GET['handle']) ? $_GET['handle'] : null);
    $html = file_get_contents(__DIR__ . '/index.html');
    if (!$handle) { http_response_code(404); echo $html; }
    else { echo preview_html($html, preview_profile($handle), $handle); }
}
