<?php
// Shared bounded collector. No visitor fetches third-party image URLs.
function icon_valid_host($host){return is_string($host)&&strlen($host)<=253&&preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/D',$host)&&!preg_match('/(?:^|\.)(localhost|local|internal|invalid|test)$/D',$host);}
function icon_public_ip($ip){
 if(!filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE))return false;
 if(filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_IPV4)){
  $p=array_map('intval',explode('.',$ip));
  return !($p[0]===0||$p[0]>=224||$p[0]===100&&$p[1]>=64&&$p[1]<=127||$p[0]===192&&($p[1]===0||$p[1]===88&&$p[2]===99)||$p[0]===198&&(in_array($p[1],array(18,19),true)||$p[1]===51&&$p[2]===100)||$p[0]===203&&$p[1]===0&&$p[2]===113);
 }
 $bytes=inet_pton($ip);$words=unpack('n8',$bytes);$a=$words[1];$b=$words[2];
 return $a>=0x2000&&$a<=0x3fff&&$a!==0x2002&&$a!==0x3fff&&!($a===0x2001&&($b<=0x1ff||$b===0xdb8));
}
function icon_url($url){
 $p=parse_url($url);if(!$p||($p['scheme']??'')!=='https'||isset($p['user'])||isset($p['pass'])||isset($p['port'])&&$p['port']!==443||!icon_valid_host(strtolower($p['host']??'')))return null;
 return $p;
}
function icon_absolute($base,$relative){
 $relative=html_entity_decode(trim($relative),ENT_QUOTES|ENT_HTML5,'UTF-8');
 if(strpos($relative,'//')===0)return 'https:'.$relative;
 if(preg_match('/^[a-z][a-z0-9+.-]*:/i',$relative))return $relative;
 $p=parse_url($base);$origin='https://'.$p['host'];
 if(strpos($relative,'/')===0)return $origin.$relative;
 return $origin.preg_replace('#[^/]*$#','',$p['path']??'/').$relative;
}
function icon_resolve($host,$deadline){
 static $cache=array();if(isset($cache[$host]))return $cache[$host];
 // DNS is bounded as well as curl. getent uses the host resolver without
 // introducing an external DNS provider. Collect A and AAAA independently.
 $getent=is_executable('/usr/bin/getent')?'/usr/bin/getent':(is_executable('/bin/getent')?'/bin/getent':null);
 $timeout=is_executable('/usr/bin/timeout')?'/usr/bin/timeout':null;
 if(!$getent||!$timeout||!function_exists('proc_open')||microtime(true)>$deadline)return array();
 $processes=array();$addresses=array();$until=min($deadline,microtime(true)+1.0);
 foreach(array('ahostsv4','ahostsv6') as $family){
  $p=proc_open(array($timeout,'1s',$getent,$family,$host),array(0=>array('pipe','r'),1=>array('pipe','w'),2=>array('pipe','w')),$pipes);
  if(is_resource($p)){fclose($pipes[0]);stream_set_blocking($pipes[1],false);stream_set_blocking($pipes[2],false);$processes[]=array($p,$pipes,'');}
 }
 do{$running=false;foreach($processes as &$item){$item[2].=stream_get_contents($item[1][1]);stream_get_contents($item[1][2]);if(proc_get_status($item[0])['running'])$running=true;}unset($item);if($running)usleep(5000);}while($running&&microtime(true)<$until);
 foreach($processes as $item){if(proc_get_status($item[0])['running'])proc_terminate($item[0]);$text=$item[2].stream_get_contents($item[1][1]);fclose($item[1][1]);fclose($item[1][2]);proc_close($item[0]);foreach(preg_split('/\R/',$text) as $line){$ip=strtok(trim($line),' ');if(filter_var($ip,FILTER_VALIDATE_IP)){$packed=inet_pton($ip);if(strlen($packed)===16&&substr($packed,0,12)===str_repeat("\0",10)."\xff\xff")$ip=inet_ntop(substr($packed,12));$addresses[$ip]=true;}}}
 $ips=array_keys($addresses);foreach($ips as $ip)if(!icon_public_ip($ip))return $cache[$host]=array();
 return $cache[$host]=$ips;
}
function icon_external_css($text){
 if(preg_match('/(?:\\\\|@import|(?:https?|file|data|javascript):)/i',$text))return true;
 preg_match_all('/url\(([^)]*)\)/i',$text,$urls);foreach($urls[1] as $url)if(strpos(trim($url," \t\r\n\"'"),'#')!==0)return true;return false;
}
function icon_safe_svg($bytes){
 if(strlen($bytes)>524288||preg_match('/<\?(?!xml\s)/i',$bytes)||preg_match('/<!\s*(?:DOCTYPE|ENTITY)/i',$bytes)||!class_exists('DOMDocument'))return false;
 $previous=libxml_use_internal_errors(true);$doc=new DOMDocument();$ok=$doc->loadXML($bytes,LIBXML_NONET);libxml_clear_errors();libxml_use_internal_errors($previous);
 if(!$ok||!$doc->documentElement||strtolower($doc->documentElement->localName)!=='svg')return false;
 $root=$doc->documentElement;foreach(array('width','height') as $dimension){$v=$root->getAttribute($dimension);if(preg_match('/^([0-9.]+)(?:px)?$/D',$v,$m)&&(float)$m[1]>4096)return false;}
 foreach($doc->getElementsByTagName('*') as $node){
  if(in_array(strtolower($node->localName),array('script','foreignobject','iframe','object','embed','image','feimage'),true))return false;
  foreach($node->attributes as $attr){$name=strtolower($attr->localName);if($attr->namespaceURI==='http://www.w3.org/2000/xmlns/'||$name==='xmlns')continue;$v=$attr->value;if(strpos($name,'on')===0||strpos($v,'\\')!==false||$name==='href'&&strpos(trim($v),'#')!==0||icon_external_css($v))return false;}
  if(strtolower($node->localName)==='style'&&icon_external_css($node->textContent))return false;
 }
 return true;
}
function icon_to_png($bytes,$deadline){
 if(!is_string($bytes)||strlen($bytes)<8||strlen($bytes)>524288)return null;
 $svg=preg_match('/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i',$bytes);
 if($svg&&!icon_safe_svg($bytes))return null;
 $dims=!$svg?@getimagesizefromstring($bytes):false;if($dims&&$dims[0]*$dims[1]>4194304)return null;
 $image=!$svg&&function_exists('imagecreatefromstring')?@imagecreatefromstring($bytes):false;
 if($image){
  $w=imagesx($image);$h=imagesy($image);if($w*$h>16777216){imagedestroy($image);return null;}
  $target=imagecreatetruecolor(64,64);imagealphablending($target,false);imagesavealpha($target,true);imagefill($target,0,0,imagecolorallocatealpha($target,0,0,0,127));$scale=min(64/$w,64/$h);$dw=max(1,(int)round($w*$scale));$dh=max(1,(int)round($h*$scale));imagecopyresampled($target,$image,(int)((64-$dw)/2),(int)((64-$dh)/2),0,0,$dw,$dh,$w,$h);ob_start();imagepng($target,null,7);$png=ob_get_clean();imagedestroy($image);imagedestroy($target);return $png;
 }
 // Only ICO/SVG reach the external decoder; never try to decode HTML as media.
 if(!$svg&&substr($bytes,0,4)!=="\0\0\1\0")return null;
 $remaining=$deadline-microtime(true);if($remaining<.1||!function_exists('proc_open'))return null;
 $ffmpeg=is_executable('/usr/bin/ffmpeg')?'/usr/bin/ffmpeg':(is_executable('/usr/local/bin/ffmpeg')?'/usr/local/bin/ffmpeg':null);
 if(!$ffmpeg||!is_executable('/usr/bin/timeout'))return null;
 $src=tempnam(sys_get_temp_dir(),'ml-icon-');$out=tempnam(sys_get_temp_dir(),'ml-png-');if(!$src||!$out)return null;
 file_put_contents($src,$bytes);$args=array('/usr/bin/timeout',max(.1,min(1.5,$remaining)).'s',$ffmpeg,'-nostdin','-v','error','-y','-max_alloc','16777216','-max_pixels','4194304','-threads','1','-filter_threads','1','-protocol_whitelist','file,pipe');if($svg)$args=array_merge($args,array('-f','svg_pipe'));$args=array_merge($args,array('-i',$src,'-frames:v','1','-vf','scale=64:64:force_original_aspect_ratio=decrease,pad=64:64:(ow-iw)/2:(oh-ih)/2:color=black@0','-f','image2','-vcodec','png',$out));
 $p=proc_open($args,array(0=>array('pipe','r'),1=>array('pipe','w'),2=>array('pipe','w')),$pipes);$png=null;
 if(is_resource($p)){fclose($pipes[0]);stream_get_contents($pipes[1]);fclose($pipes[1]);stream_get_contents($pipes[2]);fclose($pipes[2]);if(proc_close($p)===0&&filesize($out)<262144)$png=file_get_contents($out);}
 @unlink($src);@unlink($out);return $png&&substr($png,0,8)==="\x89PNG\r\n\x1a\n"?$png:null;
}
function icon_declared($html,$base){
 $out=array();preg_match_all('/<link\b[^>]*>/i',$html,$tags);
 foreach($tags[0] as $tag){$attrs=array();preg_match_all('/([\w-]+)\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s>]+))/',$tag,$pairs,PREG_SET_ORDER);foreach($pairs as $p)$attrs[strtolower($p[1])]=$p[2]!==''?$p[2]:(($p[3]??'')!==''?$p[3]:($p[4]??''));if(strpos(strtolower($attrs['rel']??''),'icon')!==false&&!empty($attrs['href']))$out[]=icon_absolute($base,$attrs['href']);}
 return array_slice(array_unique($out),0,8);
}
function icon_collect_ru($host,$deadline,$resolver=null){
 if(!icon_valid_host($host)||!function_exists('curl_multi_init'))return null;
 $resolver=$resolver??'icon_resolve';$multi=curl_multi_init();$active=array();$queue=array();$seen=array();$scheduled=0;
 $enqueue=function($url,$kind,$redirect=0)use(&$queue,&$seen,$resolver,$deadline,&$scheduled){
  $key=$kind.':'.$url.':'.$redirect;if(isset($seen[$key])||$scheduled>=96)return;$seen[$key]=true;$p=icon_url($url);if(!$p||$redirect>3||microtime(true)>$deadline)return;$ips=$resolver(strtolower($p['host']),$deadline);foreach($ips as $ip)if(!icon_public_ip($ip))return;foreach($ips as $rank=>$ip){if($scheduled>=96)break;$queue[]=array('url'=>$url,'host'=>strtolower($p['host']),'ip'=>$ip,'kind'=>$kind,'redirect'=>$redirect,'rank'=>$rank);$scheduled++;}
  usort($queue,function($a,$b){return $a['rank']<=>$b['rank'];});
 };
 $enqueue('https://'.$host.'/favicon.ico','icon');$enqueue('https://'.$host.'/apple-touch-icon.png','icon');$enqueue('https://'.$host.'/','page');
 $result=null;
 try{while((count($queue)||count($active))&&microtime(true)<$deadline){
  while(count($queue)&&count($active)<6&&microtime(true)<$deadline){
   $job=array_shift($queue);$ch=curl_init($job['url']);$key=spl_object_id($ch);$state=(object)array('bytes'=>'','location'=>'','type'=>'','oversize'=>false);
   $ms=max(1,(int)(($deadline-microtime(true))*1000));$ip=strpos($job['ip'],':')!==false?'['.$job['ip'].']':$job['ip'];
   curl_setopt_array($ch,array(CURLOPT_RETURNTRANSFER=>false,CURLOPT_PROXY=>'',CURLOPT_FOLLOWLOCATION=>false,CURLOPT_RESOLVE=>array($job['host'].':443:'.$ip),CURLOPT_CONNECTTIMEOUT_MS=>min(1500,$ms),CURLOPT_TIMEOUT_MS=>min(2400,$ms),CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_ENCODING=>'',CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_USERAGENT=>'mylinks.bar favicon/2',CURLOPT_HTTPHEADER=>array('Accept: '.($job['kind']==='page'?'text/html':'image/*,*/*;q=0.5')),CURLOPT_WRITEFUNCTION=>function($ch,$chunk)use($state,$job){$limit=$job['kind']==='page'?409600:524288;if(strlen($state->bytes)+strlen($chunk)>$limit){$state->oversize=true;return 0;}$state->bytes.=$chunk;return strlen($chunk);},CURLOPT_HEADERFUNCTION=>function($ch,$line)use($state){if(stripos($line,'location:')===0)$state->location=trim(substr($line,9));if(stripos($line,'content-type:')===0)$state->type=strtolower(trim(substr($line,13)));return strlen($line);}));
   if(defined('CURL_HTTP_VERSION_2TLS'))curl_setopt($ch,CURLOPT_HTTP_VERSION,CURL_HTTP_VERSION_2TLS);
   curl_multi_add_handle($multi,$ch);$active[$key]=array($ch,$job,$state);
  }
  do{$status=curl_multi_exec($multi,$running);}while($status===CURLM_CALL_MULTI_PERFORM);
  while($info=curl_multi_info_read($multi)){
   $ch=$info['handle'];$key=spl_object_id($ch);list($_,$job,$state)=$active[$key];unset($active[$key]);$code=curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_multi_remove_handle($multi,$ch);curl_close($ch);
   if($info['result']!==CURLE_OK||$state->oversize)continue;
   if($code>=300&&$code<400&&$state->location){$enqueue(icon_absolute($job['url'],$state->location),$job['kind'],$job['redirect']+1);continue;}
   if($code!==200)continue;
   if($job['kind']==='page'){if(strpos($state->type,'html')!==false)foreach(icon_declared($state->bytes,$job['url']) as $url)$enqueue($url,'icon');}
   elseif($png=icon_to_png($state->bytes,$deadline)){$result=$png;break 2;}
  }
  if(count($active))curl_multi_select($multi,.03);
 }}finally{foreach($active as $item){curl_multi_remove_handle($multi,$item[0]);curl_close($item[0]);}curl_multi_close($multi);}
 return $result;
}
function icon_brand_png($host,$deadline){
 static $brands=null;if($brands===null)$brands=json_decode(file_get_contents(__DIR__.'/icons/platforms/brand-assets.json'),true)?:array();
 foreach($brands as $brand)foreach($brand['domains']??array() as $domain){if($host===$domain||substr($host,-strlen($domain)-1)==='.'. $domain)return icon_to_png(file_get_contents(__DIR__.'/icons/platforms/'.$brand['file']),$deadline);}
 return null;
}
function icon_collect($host,$budget=9.8,$primary=null,$backup=null){
 if(!icon_valid_host($host))return null;$deadline=microtime(true)+min(9.8,max(.1,$budget));
 $local=icon_brand_png($host,$deadline);if($local)return $local;
 $primary=$primary??'icon_collect_ru';$png=$primary($host,min($deadline,microtime(true)+6.5));if($png)return $png;
 if($backup)return $backup($host,$deadline);
 $remaining=$deadline-microtime(true);if($remaining<.15||!function_exists('curl_init'))return null;
 $config=require __DIR__.'/preview-config.php';$ch=curl_init($config['url'].'/functions/v1/favicon?domain='.rawurlencode($host).'&budget_ms='.max(100,(int)(($remaining-.1)*1000)));$bytes='';
 curl_setopt_array($ch,array(CURLOPT_RETURNTRANSFER=>false,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT_MS=>min(1000,(int)($remaining*1000)),CURLOPT_TIMEOUT_MS=>max(1,(int)($remaining*1000)),CURLOPT_HTTPHEADER=>array('apikey: '.$config['key']),CURLOPT_WRITEFUNCTION=>function($ch,$chunk)use(&$bytes){if(strlen($bytes)+strlen($chunk)>524288)return 0;$bytes.=$chunk;return strlen($chunk);}));
 $ok=curl_exec($ch);$code=curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);return $ok&&$code===200?icon_to_png($bytes,$deadline):null;
}
function icon_cache_file($key){$dir=__DIR__.'/.private-assets/link-icons';if(!is_dir($dir))@mkdir($dir,0700,true);return $dir.'/'.hash('sha256',$key).'.png';}
function icon_cached($key,$host,$collect=null){
 $file=icon_cache_file($key);$retry=$file.'.retry';$old=is_file($file)?file_get_contents($file):null;if($old&&substr($old,0,8)!=="\x89PNG\r\n\x1a\n")$old=null;
 if($old&&filemtime($file)>time()-21600)return $old;
 if(is_file($retry)&&filemtime($retry)>time()-300)return $old;
 $lock=@fopen($file.'.lock','c');if(!$lock)return $old;
 if(!flock($lock,LOCK_EX|LOCK_NB)){
  // Editor and public cards share one domain snapshot. A concurrent cold read
  // waits for the first writer instead of caching a transient miss in the UI.
  fclose($lock);if($old)return $old;$until=microtime(true)+9.8;
  do{usleep(30000);clearstatcache(true,$file);if(is_file($file)){$ready=file_get_contents($file);if(substr($ready,0,8)==="\x89PNG\r\n\x1a\n")return $ready;}clearstatcache(true,$retry);if(is_file($retry)&&filemtime($retry)>time()-300)return null;}while(microtime(true)<$until);
  return null;
 }
 try{clearstatcache(true,$file);if(is_file($file)&&filemtime($file)>time()-21600)return file_get_contents($file);
  $collect=$collect??'icon_collect';$png=$collect($host);if($png){$temp=tempnam(dirname($file),'icon-');if($temp){file_put_contents($temp,$png);chmod($temp,0600);if(!rename($temp,$file))@unlink($temp);}return $png;}
  @touch($retry);return $old;
 }finally{flock($lock,LOCK_UN);fclose($lock);}
}
