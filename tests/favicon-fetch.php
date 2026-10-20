<?php
require __DIR__.'/../public/favicon-fetch.php';
function check_icon($ok,$message){if(!$ok)throw new Exception($message);}
foreach(array('127.0.0.1','10.0.0.1','100.64.0.1','192.168.1.1','198.18.0.1','203.0.113.1','::1','::ffff:127.0.0.1','2001:db8::1','2002:7f00::1') as $ip)check_icon(!icon_public_ip($ip),'Unsafe IP '.$ip);
check_icon(icon_public_ip('8.8.8.8')&&icon_public_ip('2606:4700:4700::1111'),'Public IP rejected');
foreach(array('http://example.com','https://user:pass@example.com','https://example.com:444','https://localhost','https://[::1]','https://127.0.0.1') as $url)check_icon(icon_url($url)===null,'Unsafe URL '.$url);
$svg='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="a"><stop stop-color="red"/></linearGradient></defs><rect width="64" height="64" fill="url(#a)"/></svg>';
check_icon(icon_safe_svg($svg),'Local gradient rejected');
foreach(array('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>','<svg><script>alert(1)</script></svg>','<svg><use href="https://example.com/a.svg#x"/></svg>','<svg><style>@import "https://example.com/a";</style></svg>','<svg onload="alert(1)"/>','<svg><image href="file:///tmp/x"/></svg>','<svg><style>rect {fill:url(https://example.com/a)}</style></svg>','<svg width="99999" height="99999"/>') as $bad)check_icon(!icon_safe_svg($bad),'Unsafe SVG accepted');
check_icon(icon_to_png('<html>no image</html>',microtime(true)+2)===null,'HTML became image');
$png=icon_to_png($svg,microtime(true)+2);check_icon($png&&getimagesizefromstring($png)[0]===64,'SVG conversion failed (ffmpeg with librsvg is required)');
$original=file_get_contents(__DIR__.'/fixtures/avatar.webp');$raster=icon_to_png($original,microtime(true)+2);check_icon($raster&&getimagesizefromstring($raster)[0]===64,'Raster conversion failed');
// A valid ICO carrying a PNG frame, as served by many small sites.
$ico=pack('vvv',0,1,1).pack('CCCCvvVV',64,64,0,0,1,32,strlen($png),22).$png;
check_icon(icon_to_png($ico,microtime(true)+2)!==null,'ICO conversion failed');
check_icon(icon_declared('<link rel=icon href="/favicon.svg"><link href=/touch.png rel="apple-touch-icon">','https://example.com/page')===array('https://example.com/favicon.svg','https://example.com/touch.png'),'Declared icons not parsed');
check_icon(icon_collect('youtube.com',2,function(){throw new Exception('Brand must not access network');})!==null,'Brand library priority');
$called=array();$got=icon_collect('example.com',1,function($host,$until)use(&$called){$called[]='RU';return null;},function($host,$until)use(&$called,$png){$called[]='EU';check_icon($until>microtime(true),'No shared time budget');return $png;});
check_icon($got===$png&&$called===array('RU','EU'),'EU fallback not used');
$called=array();check_icon(icon_collect('example.com',1,function()use($png){return $png;},function()use(&$called){$called[]='EU';return null;})===$png&&!$called,'Primary success must win');
$key='test:'.bin2hex(random_bytes(8));$file=icon_cache_file($key);
try{
 check_icon(icon_cached($key,'example.com',function()use($png){return $png;})===$png,'Snapshot not stored');
 check_icon(icon_cached($key,'example.com',function(){throw new Exception('Fresh domain snapshot must be shared without another collection');})===$png,'Fresh snapshot not reused');
 check_icon(is_file($file),'Persistent snapshot missing');touch($file,time()-25000);clearstatcache(true,$file);
 check_icon(icon_cached($key,'example.com',function(){return null;})===$png,'Refresh discarded last good snapshot');
 check_icon(file_get_contents($file)===$png,'Failed refresh overwrote snapshot');
}finally{foreach(array($file,$file.'.retry',$file.'.lock') as $f)@unlink($f);}
$key='test:concurrent:'.bin2hex(random_bytes(8));$file=icon_cache_file($key);$temporary=tempnam(dirname($file),'test-write-');file_put_contents($temporary,$png);
$busy=fopen($file.'.lock','c');flock($busy,LOCK_EX);
$child=proc_open(array(PHP_BINARY,'-r','usleep(150000);rename($argv[1],$argv[2]);',$temporary,$file),array(0=>array('pipe','r'),1=>array('pipe','w'),2=>array('pipe','w')),$pipes);
try{
 check_icon(is_resource($child),'Cannot start concurrent cache writer');fclose($pipes[0]);
 check_icon(icon_cached($key,'example.com',function(){throw new Exception('Concurrent read must reuse first collection');})===$png,'Cold concurrent request became a permanent UI miss');
 stream_get_contents($pipes[1]);fclose($pipes[1]);stream_get_contents($pipes[2]);fclose($pipes[2]);check_icon(proc_close($child)===0,'Writer failed');
}finally{flock($busy,LOCK_UN);fclose($busy);foreach(array($file,$file.'.lock',$temporary) as $f)@unlink($f);}
echo "Favicon security, ICO/SVG, RU/EU and persistent last-good cache passed\n";
