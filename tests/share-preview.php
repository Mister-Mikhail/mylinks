<?php
define('MYLINKS_PREVIEW_LIBRARY_ONLY', true);
require __DIR__ . '/../public/share-profile.php';
function verify($condition, $message) { if (!$condition) { throw new Exception($message); } }
$html = file_get_contents(__DIR__ . '/../index.html');
$profile = array('handle'=>'mister','display_name'=>'Михаил <script>','bio'=>'Креатор "&" дизайнер','avatar_path'=>'id/avatar.webp','updated_at'=>'2026-10-09','is_published'=>true);
$result = preview_html($html, $profile, 'mister');
verify(strpos($result, 'og:title') !== false, 'Missing Open Graph title');
verify(strpos($result, 'Михаил &lt;script&gt;') !== false, 'Unescaped title');
verify(strpos($result, '<script>') === false, 'Unsafe profile markup');
verify(strpos($result, 'share-avatar.php?handle=mister&amp;v=2026-10-09') !== false, 'Missing avatar preview');
verify(strpos($result, 'https://mylinks.bar/mister') !== false, 'Incorrect canonical URL');
verify(strpos($result, 'Креатор &quot;&amp;&quot; дизайнер') !== false, 'Missing bio');
$profile['avatar_path'] = null;
verify(strpos(preview_html($html,$profile,'mister'), 'share-default.png') !== false, 'Missing fallback image');
$hidden = preview_html($html,null,'mister');
verify(strpos($hidden,'Михаил') === false, 'Unpublished profile leaked');
verify(strpos($hidden,'noindex') !== false, 'Missing unpublished noindex');
verify(preview_handle('../secret') === null && preview_handle('admin') === null && preview_handle(array('mister')) === null, 'Handle validation failed');
verify(preview_handle('mister') === 'mister', 'Valid handle rejected');
echo "Share-preview checks passed\n";
