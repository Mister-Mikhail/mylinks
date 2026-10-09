<?php
define('MYLINKS_PREVIEW_IMAGE_LIBRARY_ONLY',true);
require __DIR__ . '/../public/share-image.php';
function verify_image($condition,$message) { if (!$condition) throw new Exception($message); }
verify_image(function_exists('imagecreatefromstring'),'GD extension is required for personal previews');
$avatar=imagecreatetruecolor(80,40);
$color=imagecolorallocate($avatar,230,100,30);
imagefilledrectangle($avatar,0,0,79,39,$color);
ob_start(); imagepng($avatar); $bytes=ob_get_clean(); unset($avatar);
$png=preview_image_render($bytes);
$info=getimagesizefromstring($png);
verify_image($info[0]===1200 && $info[1]===630 && $info['mime']==='image/png','Incorrect preview format or size');
$image=imagecreatefromstring($png);
$pixel=imagecolorsforindex($image,imagecolorat($image,310,310));
verify_image($pixel['red']===230 && $pixel['green']===100 && $pixel['blue']===30,'Avatar missing from preview');
verify_image(preview_image_render('invalid')===null,'Invalid image accepted');
unset($image);
echo "Share-image checks passed\n";
