<?php
define('MYLINKS_PREVIEW_LIBRARY_ONLY',true);
require_once __DIR__.'/share-profile.php';
header('Cache-Control: no-store');
$id=$_GET['id']??'';$hash=$_GET['hash']??'';
if(preg_match('/^[a-f0-9-]{36}$/D',$id)&&preg_match('/^[a-f0-9]{12}$/D',$hash)){
 $rows=preview_api('/rest/v1/profile_links?select=id,url,is_visible,profiles!inner(handle,is_published)&id=eq.'.rawurlencode($id).'&is_visible=eq.true&profiles.is_published=eq.true&limit=1');
 $row=is_array($rows)?($rows[0]??null):null;
 if($row&&hash_equals(substr(md5($row['url']),0,12),$hash)&&($handle=preview_handle($row['profiles']['handle']??null))){header('Location: /i/v2/'.rawurlencode($handle).'/'.$id.'/'.$hash.'.png',true,301);exit;}
}
require __DIR__.'/asset-not-found.php';
