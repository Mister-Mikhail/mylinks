<?php
define('MYLINKS_AVATAR_LIBRARY_ONLY',true);
require __DIR__ . '/../public/avatar-asset.php';
function verify_avatar($condition,$message) { if (!$condition) throw new Exception($message); }
$id='00000000-0000-4000-8000-000000000001';
$profile=array('id'=>$id,'avatar_path'=>$id.'/small.webp','avatar_master_path'=>$id.'/master.webp','avatar_poster_path'=>null,'avatar_media'=>'image','is_published'=>true);
$hash=avatar_fingerprint($profile);
verify_avatar(strlen($hash)===8,'Fingerprint format');
verify_avatar(avatar_asset_details($profile,$hash,'560',false,'webp')['path']===$id.'/small.webp','560 source');
verify_avatar(avatar_asset_details($profile,$hash,'1000',false,'webp')['path']===$id.'/master.webp','1000 source');
verify_avatar(avatar_asset_details($profile,'deadbeef','560',false,'webp')===null,'Stale URL accessible');
$profile['is_published']=false;
verify_avatar(avatar_asset_details($profile,$hash,'560',false,'webp')===null,'Private asset accessible');
$profile['is_published']=true; $profile['avatar_path']='another-owner/small.webp';
verify_avatar(avatar_asset_details($profile,avatar_fingerprint($profile),'560',false,'webp')===null,'Other owner asset accessible');
$video=tempnam(sys_get_temp_dir(),'mylinks-range-test-');
file_put_contents($video,str_repeat('0123456789',20));
foreach (array(array('bytes=0-1',206,'01'),array('bytes=100-',206,substr(str_repeat('0123456789',20),100)),array('bytes=999-',416,''),array('bytes=5-2',416,''),array('bytes=abc-def',416,'')) as $case) {
    http_response_code(200);
    ob_start(); avatar_asset_serve($video,'video/mp4',$case[0]); $body=ob_get_clean();
    verify_avatar(http_response_code()===$case[1] && $body===$case[2], 'Range ' . $case[0]);
}
@unlink($video);
echo "Avatar asset checks passed\n";
