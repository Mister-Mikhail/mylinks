<?php
// Keep refresh time separate from last access, so hot icons remain collectable.
function icon_cache_dir() {
    $dir = defined('MYLINKS_ICON_CACHE_DIR') ? MYLINKS_ICON_CACHE_DIR : __DIR__.'/.private-assets/link-icons';
    if (!is_dir($dir)) @mkdir($dir,0700,true);
    return $dir;
}
function icon_cache_access($file) {
    if (!is_file($file.'.access') || filemtime($file.'.access') < time()-3600) { @touch($file.'.access'); @chmod($file.'.access',0600); }
}
function icon_cache_prune($keep=null,$entries=0,$bytes=0,$now=null,$maxEntries=1024,$maxBytes=67108864) {
    $now=$now??time();$groups=array();$total=0;
    foreach (new DirectoryIterator(icon_cache_dir()) as $entry) {
        if (!$entry->isFile() || $entry->isLink()) continue;
        if (!preg_match('/^([a-f0-9]{64}\.png)(?:\.(?:lock|retry|access))?$/D',$entry->getFilename(),$m)) {
            if (strpos($entry->getFilename(),'icon-')===0 && $entry->getMTime()<$now-3600) @unlink($entry->getPathname());
            continue;
        }
        $file=icon_cache_dir().'/'.$m[1];
        if (!isset($groups[$file])) $groups[$file]=array('paths'=>array(),'bytes'=>0,'at'=>0);
        $groups[$file]['paths'][]=$entry->getPathname();$groups[$file]['bytes']+=$entry->getSize();$total+=$entry->getSize();
        $groups[$file]['at']=max($groups[$file]['at'],$entry->getMTime());
    }
    uasort($groups,function($a,$b){return $a['at']<=>$b['at'];});$count=count($groups);
    foreach($groups as $file=>$group) {
        if($file===$keep)continue;
        if($group['at']>=$now-30*86400 && $count+$entries<=$maxEntries && $total+$bytes<=$maxBytes)continue;
        $lock=@fopen($file.'.lock','c');if(!$lock)continue;
        if(flock($lock,LOCK_EX|LOCK_NB)) {
            foreach($group['paths'] as $path)@unlink($path);@unlink($file.'.lock');
            $total-=$group['bytes'];$count--;flock($lock,LOCK_UN);
        }
        fclose($lock);
    }
    return $count+$entries<=$maxEntries && $total+$bytes<=$maxBytes;
}
function icon_cache_maintenance($callback) {
    $file=icon_cache_dir().'/maintenance.lock';$lock=@fopen($file,'c');
    if(!$lock||!flock($lock,LOCK_EX)){if($lock)fclose($lock);return false;}
    @chmod($file,0600);
    try{return $callback();}finally{flock($lock,LOCK_UN);fclose($lock);}
}
function icon_cache_cleanup($keep=null,$force=false) {
    $mark=icon_cache_dir().'/cleanup.at';
    if(!$force&&is_file($mark)&&filemtime($mark)>time()-60)return true;
    return icon_cache_maintenance(function()use($keep,$mark){$ok=icon_cache_prune($keep);@touch($mark);@chmod($mark,0600);return $ok;});
}
function icon_cache_open_lock($file) {
    return icon_cache_maintenance(function()use($file){
        $new=!is_file($file)&&!is_file($file.'.lock')&&!is_file($file.'.retry');
        if(!icon_cache_prune($file,$new?1:0))return false;
        $lock=@fopen($file.'.lock','c');if($lock){@chmod($file.'.lock',0600);flock($lock,LOCK_EX|LOCK_NB);}return $lock;
    });
}
function icon_cache_store($file,$png) {
    return icon_cache_maintenance(function()use($file,$png){
        $new=!is_file($file)&&!is_file($file.'.lock')&&!is_file($file.'.retry');
        $extra=max(0,strlen($png)-(is_file($file)?filesize($file):0));
        if(!icon_cache_prune($file,$new?1:0,$extra))return false;
        $temp=@tempnam(dirname($file),'icon-');if(!$temp)return false;
        $ok=file_put_contents($temp,$png)===strlen($png);@chmod($temp,0600);$ok=$ok&&@rename($temp,$file);
        if(is_file($temp))@unlink($temp);if($ok)icon_cache_access($file);return $ok;
    });
}
