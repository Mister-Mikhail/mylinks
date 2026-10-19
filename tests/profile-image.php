<?php
define('MYLINKS_PROFILE_IMAGE_LIBRARY_ONLY',true);
require __DIR__.'/../public/profile-image.php';
function check_profile_image($condition,$message){if(!$condition)throw new Exception($message);}
$id='00000000-0000-4000-8000-000000000091';$asset='11111111-1111-4111-8111-111111111111.webp';
$bundle=array('profile'=>array('id'=>$id,'is_published'=>true,'background_style'=>'image','background_image_path'=>$id.'/'.$asset));
check_profile_image(profile_image_path($bundle,$asset)===$id.'/'.$asset,'Published image unavailable');
check_profile_image(profile_image_path($bundle,'../../secret.webp')===null,'Traversal accepted');
check_profile_image(profile_image_path($bundle,'22222222-2222-4222-8222-222222222222.webp')===null,'Unreferenced file accepted');
$bundle['profile']['is_published']=false;check_profile_image(profile_image_path($bundle,$asset)===null,'Private profile image public');
$bundle['profile']['is_published']=true;$bundle['profile']['background_style']='preset';check_profile_image(profile_image_path($bundle,$asset)===null,'Inactive background public');
$bundle['links']=array(array('profile_id'=>$id,'is_visible'=>true,'presentation'=>'featured','image_path'=>$id.'/'.$asset));
check_profile_image(profile_image_path($bundle,$asset)===$id.'/'.$asset,'Featured image unavailable');
$bundle['links'][0]['is_visible']=false;check_profile_image(profile_image_path($bundle,$asset)===null,'Hidden featured image public');
echo "Profile image checks passed\n";
