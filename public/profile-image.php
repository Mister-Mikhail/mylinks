<?php
if (!defined('MYLINKS_PREVIEW_LIBRARY_ONLY')) define('MYLINKS_PREVIEW_LIBRARY_ONLY',true);
require_once __DIR__.'/share-profile.php';
function profile_image_path($bundle,$asset) {
 if (!is_array($bundle) || empty($bundle['profile']['is_published']) || !preg_match('/^[a-f0-9-]{36}\.webp$/D',$asset)) return null;
 $profile=$bundle['profile'];$path=($profile['id'] ?? '').'/'.$asset;
 return ($profile['background_image_path'] ?? null)===$path && ($profile['background_style'] ?? '')==='image' ? $path : null;
}
if (!defined('MYLINKS_PROFILE_IMAGE_LIBRARY_ONLY')) {
 header('X-Content-Type-Options: nosniff');header('Cache-Control: no-store');
 $handle=preview_handle($_GET['handle'] ?? null);$asset=$_GET['asset'] ?? '';
 $path=$handle ? profile_image_path(preview_bundle($handle),$asset) : null;
 if (!$path) {http_response_code(404);exit;}
 $signed=preview_api('/storage/v1/object/sign/profile-assets/'.implode('/',array_map('rawurlencode',explode('/',$path))),array('expiresIn'=>60));
 if (empty($signed['signedURL']) || strpos($signed['signedURL'],'/object/sign/profile-assets/')!==0) {http_response_code(404);exit;}
 $config=require __DIR__.'/preview-config.php';$c=curl_init($config['url'].'/storage/v1'.$signed['signedURL']);$bytes='';
 curl_setopt_array($c,array(CURLOPT_RETURNTRANSFER=>false,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>10,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_WRITEFUNCTION=>function($c,$chunk)use(&$bytes){if(strlen($bytes)+strlen($chunk)>1500000)return 0;$bytes.=$chunk;return strlen($chunk);}));
 $ok=curl_exec($c);$status=curl_getinfo($c,CURLINFO_HTTP_CODE);curl_close($c);
 $image=$ok && $status===200 ? @getimagesizefromstring($bytes) : false;
 if (!$image || $image['mime']!=='image/webp' || $image[0]>1600 || $image[1]>1600) {http_response_code(404);exit;}
 $etag='"'.hash('sha256',$bytes).'"';header('ETag: '.$etag);header('Cache-Control: private, max-age=0, must-revalidate');
 if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')===$etag) {http_response_code(304);exit;}
 header('Content-Type: image/webp');header('Content-Length: '.strlen($bytes));echo $bytes;
}
