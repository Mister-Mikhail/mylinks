<?php
function icon_signing_key() {
    $path=dirname(icon_cache_dir()).'/icon-signing.key';$file=@fopen($path,'c+');
    if(!$file||!flock($file,LOCK_EX)){if($file)fclose($file);return null;}
    @chmod($path,0600);
    try{$key=stream_get_contents($file);if($key===''){$key=random_bytes(32);rewind($file);fwrite($file,$key);}return strlen($key)===32?$key:null;}
    finally{flock($file,LOCK_UN);fclose($file);}
}
function icon_owner($authorization) {
    if(!is_string($authorization)||strlen($authorization)>8192||!preg_match('/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/D',$authorization,$m))return null;
    // Auth verifies the JWT; a decoded sub is never used as authorization.
    $user=preview_api('/auth/v1/user',null,$m[1]);$id=$user['id']??null;
    if(!is_string($id)||!preg_match('/^[a-f0-9-]{36}$/D',$id))return null;
    $rows=preview_api('/rest/v1/profiles?select=id&id=eq.'.rawurlencode($id).'&limit=1',null,$m[1]);
    return is_array($rows)&&isset($rows[0]['id'])&&$rows[0]['id']===$id?$id:null;
}
function icon_owner_rate($owner,$count) {
    // Verified owner identity avoids a shared rate bucket behind Beget's proxy.
    $path=sys_get_temp_dir().'/mylinks-icon-owner-'.hash('sha256',$owner);$lock=@fopen($path,'c+');
    if(!$lock||!flock($lock,LOCK_EX)){if($lock)fclose($lock);return false;}@chmod($path,0600);
    try{$r=json_decode(stream_get_contents($lock),true);$now=time();if(!is_array($r)||($r['at']??0)<=$now-60)$r=array('at'=>$now,'count'=>0);
        $r['count']+=$count;rewind($lock);ftruncate($lock,0);fwrite($lock,json_encode($r));return $r['count']<=120;
    }finally{flock($lock,LOCK_UN);fclose($lock);}
}
function icon_signed_url($host,$owner,$key,$now=null) {
    $expires=($now??time())+600;$scope=substr(hash_hmac('sha256',$owner,$key),0,32);
    $sig=hash_hmac('sha256',$host."\n".$scope."\n".$expires,$key);
    return '/site-icon.php?'.http_build_query(array('domain'=>$host,'owner'=>$scope,'expires'=>$expires,'sig'=>$sig),'','&',PHP_QUERY_RFC3986);
}
function icon_valid_signature($q,$key,$now=null) {
    $now=$now??time();$host=$q['domain']??'';$scope=$q['owner']??'';$expires=$q['expires']??'';$sig=$q['sig']??'';
    if(!is_string($host)||!icon_valid_host($host)||!is_string($scope)||!preg_match('/^[a-f0-9]{32}$/D',$scope)||!is_scalar($expires)||!preg_match('/^[0-9]{10}$/D',(string)$expires)||(int)$expires<=$now||(int)$expires>$now+600||!is_string($sig)||!preg_match('/^[a-f0-9]{64}$/D',$sig))return false;
    return hash_equals(hash_hmac('sha256',$host."\n".$scope."\n".$expires,$key),$sig);
}
