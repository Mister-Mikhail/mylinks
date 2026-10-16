<?php
define('MYLINKS_PREVIEW_LIBRARY_ONLY', true);
require __DIR__ . '/share-profile.php';
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); exit; }
$authorization=$_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer ([A-Za-z0-9._-]+)$/D',$authorization,$match)) { http_response_code(401); exit; }
$user=preview_api('/auth/v1/user',null,$match[1]);
$id=$user['id'] ?? null;
if (!is_string($id) || !preg_match('/^[a-f0-9-]{36}$/D',$id)) { http_response_code(401); exit; }
$staffHandle=preview_handle($_POST['staff_handle'] ?? null);
if ($staffHandle) {
    $role=preview_api('/rest/v1/rpc/staff_role',array(),$match[1]);
    if ($role !== 'admin' && $role !== 'moderator') { http_response_code(403); exit; }
    @unlink(preview_cache_path($staffHandle));
    echo '{"ok":true}';
    exit;
}
$rows=preview_api('/rest/v1/profiles?select=handle&id=eq.' . rawurlencode($id) . '&limit=1',null,$match[1]);
if (!is_array($rows) || !isset($rows[0]['handle'])) { http_response_code(403); exit; }
$current=preview_handle($rows[0]['handle']);
$previous=preview_handle($_POST['previous'] ?? null);
// A previous handle may be purged only if it no longer belongs to another profile.
if ($previous && $previous !== $current) {
    $existing=preview_api('/rest/v1/profiles?select=id&handle=eq.' . rawurlencode($previous) . '&limit=1',null,$match[1]);
    if (is_array($existing) && count($existing) === 0) @unlink(preview_cache_path($previous));
}
if ($current) @unlink(preview_cache_path($current));
echo '{"ok":true}';
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
if (function_exists('set_time_limit')) @set_time_limit(180);
// Saving a link warms its immutable snapshot after the response has reached the owner.
// The same URL hashes are used by link-icon.php and by existing-link backfill.
define('MYLINKS_ICON_LIBRARY_ONLY',true);
require __DIR__ . '/link-icon.php';
if ($current) {
    $links=preview_api('/rest/v1/profile_links?select=id,url,is_visible,icon_snapshot_path&profile_id=eq.' . rawurlencode($id) . '&is_visible=eq.true',null,$match[1]);
    if (is_array($links)) foreach ($links as $link) {
        $path=$link['icon_snapshot_path'] ?? '';
        if (!preg_match('#^/link-icon/([a-f0-9-]{36})/([a-f0-9]{12})\.png$#D',$path,$parts) || $parts[1]!==($link['id'] ?? null)) continue;
        $cache=sys_get_temp_dir() . '/mylinks-link-icon-' . hash('sha256',$parts[1] . ':' . $parts[2]) . '.png';
        if (is_file($cache)) continue;
        $host=icon_snapshot_details($link,$parts[2]);
        if ($host) { $png=icon_snapshot_fetch($host); if ($png) { $temporary=tempnam(sys_get_temp_dir(),'mylinks-icon-write-'); if ($temporary) { file_put_contents($temporary,$png); rename($temporary,$cache); } } }
    }
}
