<?php
define('MYLINKS_PREVIEW_LIBRARY_ONLY', true);
require __DIR__ . '/share-profile.php';
header('Cache-Control: no-cache, max-age=0');
$handle = preview_handle(isset($_GET['handle']) ? $_GET['handle'] : null);
$profile = preview_profile($handle);
if ($profile && !empty($profile['avatar_path'])) {
    $path = implode('/', array_map('rawurlencode', explode('/', $profile['avatar_path'])));
    $result = preview_api('/storage/v1/object/sign/avatars/' . $path, array('expiresIn' => 3600));
    if (isset($result['signedURL']) && strpos($result['signedURL'], '/object/sign/avatars/') === 0) {
        $config = require __DIR__ . '/preview-config.php';
        header('Location: ' . $config['url'] . '/storage/v1' . $result['signedURL'], true, 302);
        exit;
    }
}
header('Location: https://mylinks.bar/share-default.png', true, 302);
