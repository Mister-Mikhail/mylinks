<?php
// Only published, moderation-approved data is read with the public Supabase key.
function preview_api($path, $body = null, $authorization = null) {
    if (isset($GLOBALS['MYLINKS_PREVIEW_API_TEST'])) return call_user_func($GLOBALS['MYLINKS_PREVIEW_API_TEST'], $path, $body, $authorization);
    $configPath = __DIR__ . '/preview-config.php';
    if (!is_file($configPath) || !function_exists('curl_init')) return null;
    $config = require $configPath;
    $curl = curl_init($config['url'] . $path);
    $headers = array('apikey: ' . $config['key'], 'Content-Type: application/json');
    if ($authorization) $headers[] = 'Authorization: Bearer ' . $authorization;
    curl_setopt_array($curl, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_HTTPHEADER => $headers,
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
    return is_string($value) && preg_match('/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/D', $value)
        && !in_array($value, array('admin','auth','p','assets','icons','sounds','fonts','share-image')) ? $value : null;
}

function preview_profile($handle) {
    if (!$handle) return null;
    $rows = preview_api('/rest/v1/profiles?select=id,handle,display_name,bio,avatar_path,avatar_master_path,avatar_poster_path,avatar_media,is_published,updated_at&handle=eq.' . rawurlencode($handle) . '&is_published=eq.true&limit=1');
    return is_array($rows) && isset($rows[0]) && !empty($rows[0]['is_published']) ? $rows[0] : null;
}

function preview_cache_path($handle) {
    return sys_get_temp_dir() . '/mylinks-public-profile-' . hash('sha256', $handle) . '.json';
}

function preview_public_icon_path($handle, $path) {
    if (!is_string($path) || !preg_match('#^/link-icon/([a-f0-9-]{36})/([a-f0-9]{12})\.png$#D', $path, $parts)) return null;
    return '/link-icon/' . $handle . '/' . $parts[1] . '/' . $parts[2] . '.png';
}

function preview_bundle($handle) {
    if (!$handle) return null;
    $cache = preview_cache_path($handle);
    if (is_file($cache) && filemtime($cache) > time() - 30) {
        $saved = json_decode(file_get_contents($cache), true);
        if (is_array($saved) && !empty($saved['profile']['is_published'])) return $saved;
    }
    // The publishable key has no user JWT: all three reads are subject to anon RLS and moderation.
    $fields = 'id,handle,display_name,bio,name_font,name_font_size,name_color,bio_font,bio_font_size,bio_color,handle_font,handle_font_size,handle_color,avatar_url,avatar_path,avatar_master_path,avatar_poster_path,avatar_media,avatar_crop,background_preset,background_style,background_image_path,background_overlay,background_position_x,background_position_y,background_zoom,link_layout,link_font,link_font_size,link_color,background_primary,background_secondary,card_preset,card_radius,card_border_width,card_opacity,card_padding,avatar_shape,avatar_size,avatar_scale,is_published,show_qr,qr_size,created_at,updated_at';
    $rows = preview_api('/rest/v1/profiles?select=' . $fields . '&handle=eq.' . rawurlencode($handle) . '&is_published=eq.true&limit=1');
    if (!is_array($rows) || !isset($rows[0]) || empty($rows[0]['is_published'])) return null;
    $profile = $rows[0];
    if (!empty($profile['avatar_path']) || (isset($profile['avatar_url']) && strpos($profile['avatar_url'], '/storage/v1/object/sign/') !== false)) $profile['avatar_url'] = null;
    $id = $profile['id'];
    if (!is_string($id) || !preg_match('/^[a-f0-9-]{36}$/D', $id)) return null;
    $links = preview_api('/rest/v1/profile_links?select=*&profile_id=eq.' . rawurlencode($id) . '&is_visible=eq.true&order=position.asc');
    $contacts = preview_api('/rest/v1/profile_contacts?select=*&profile_id=eq.' . rawurlencode($id) . '&is_visible=eq.true&order=position.asc');
    if (!is_array($links) || !is_array($contacts)) return null;
    // Explicit filtering also protects against a future RLS policy accidentally becoming permissive.
    $links = array_values(array_filter($links, function ($row) use ($id) { return is_array($row) && ($row['profile_id'] ?? null) === $id && !empty($row['is_visible']); }));
    $contacts = array_values(array_filter($contacts, function ($row) use ($id) { return is_array($row) && ($row['profile_id'] ?? null) === $id && !empty($row['is_visible']); }));
    $bundle = array('profile'=>$profile,'links'=>$links,'contacts'=>$contacts);
    $temporary = @tempnam(sys_get_temp_dir(), 'mylinks-profile-write-');
    if ($temporary) {
        if (@file_put_contents($temporary, json_encode($bundle)) !== false) @rename($temporary, $cache);
        if (is_file($temporary)) @unlink($temporary);
    }
    return $bundle;
}

function preview_html($html, $profile, $handle, $bundle = null) {
    $escape = function ($value) { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); };
    $url = 'https://mylinks.bar/' . rawurlencode($handle);
    $title = $profile ? (trim($profile['display_name']) ?: $handle) . ' — mylinks.bar' : 'mylinks.bar — все ссылки в одном месте';
    $description = $profile ? (trim($profile['bio']) ?: 'Все ссылки ' . (trim($profile['display_name']) ?: $handle) . ' в одном месте.') : 'mylinks.bar — одна ссылка для всего, чем вы делитесь.';
    $image = $profile && !empty($profile['avatar_path'])
        ? 'https://mylinks.bar/share-image/' . rawurlencode($handle) . '.' . substr(hash('sha256', 'png-v2' . $profile['avatar_path'] . $profile['updated_at']),0,12) . '.png'
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
    if ($profile && $bundle && !empty($bundle['profile']['is_published'])) {
        foreach ($bundle['links'] as &$link) $link['icon_snapshot_path'] = preview_public_icon_path($handle, $link['icon_snapshot_path'] ?? null);
        unset($link);
        $json = json_encode($bundle, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($json !== false) $meta .= "\n" . '<script type="application/json" id="initial-profile">' . $json . '</script>';
    }
    return str_replace('</head>', $meta . "\n</head>", $html);
}

if (!defined('MYLINKS_PREVIEW_LIBRARY_ONLY')) {
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-cache, max-age=0');
    $handle = preview_handle(isset($_GET['handle']) ? $_GET['handle'] : null);
    $html = file_get_contents(__DIR__ . '/index.html');
    if (!$handle) { http_response_code(404); echo $html; }
    else {
        $bundle = preview_bundle($handle);
        echo preview_html($html, $bundle['profile'] ?? null, $handle, $bundle);
    }
}
