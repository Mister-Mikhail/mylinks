<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function profile_image_error($status,$message) { http_response_code($status);echo json_encode(array('error'=>$message),JSON_UNESCAPED_UNICODE);exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '')!=='POST') profile_image_error(405,'Метод не поддерживается.');
$auth=$_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if (!preg_match('/^Bearer ([A-Za-z0-9._-]+)$/D',$auth,$m)) profile_image_error(401,'Войдите в аккаунт.');
$config=require __DIR__.'/preview-config.php';
$c=curl_init($config['url'].'/auth/v1/user');
curl_setopt_array($c,array(CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>8,CURLOPT_HTTPHEADER=>array('apikey: '.$config['key'],'Authorization: Bearer '.$m[1])));
$raw=curl_exec($c);$status=curl_getinfo($c,CURLINFO_HTTP_CODE);curl_close($c);
$user=$status===200 ? json_decode($raw,true) : null;
if (empty($user['id']) || !is_string($user['id']) || !preg_match('/^[a-f0-9-]{36}$/D',$user['id'])) profile_image_error(401,'Сессия истекла.');
// One image process per account; retries cannot queue expensive transcodes.
$lock=fopen(sys_get_temp_dir().'/mylinks-image-rate-'.hash('sha256',$user['id']),'c+');
if (!$lock) profile_image_error(503,'Не удалось подготовить обработку.');
if (!flock($lock,LOCK_EX|LOCK_NB)) {fclose($lock);header('Retry-After: 10');profile_image_error(429,'Изображение уже обрабатывается. Подождите немного.');}
register_shutdown_function(function()use($lock){flock($lock,LOCK_UN);fclose($lock);});
$rate=json_decode(stream_get_contents($lock),true);$now=time();
$recent=is_array($rate) && ($rate['at'] ?? 0)>$now-60;
if ($recent && ($rate['count'] ?? 0)>=6) {header('Retry-After: 60');profile_image_error(429,'Подождите минуту перед следующей загрузкой.');}
rewind($lock);ftruncate($lock,0);fwrite($lock,json_encode(array('at'=>$recent?$rate['at']:$now,'count'=>$recent?$rate['count']+1:1)));fflush($lock);
$f=$_FILES['file'] ?? null;
if (!$f || $f['error']!==UPLOAD_ERR_OK || $f['size']>10*1024*1024) profile_image_error(413,'Выберите изображение до 10 МБ.');
$mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
$size=@getimagesize($f['tmp_name']);
if (!in_array($mime,array('image/jpeg','image/png','image/webp'),true) || !$size || $size[0]*$size[1]>30000000) profile_image_error(415,'Допустимы JPG, PNG и WebP до 30 мегапикселей.');
$ffmpeg=is_executable('/usr/bin/ffmpeg')?'/usr/bin/ffmpeg':(is_executable('/usr/local/bin/ffmpeg')?'/usr/local/bin/ffmpeg':null);
if (!$ffmpeg || !is_executable('/usr/bin/timeout') || !function_exists('proc_open')) profile_image_error(503,'Обработка изображений временно недоступна.');
$out=tempnam(sys_get_temp_dir(),'mylinks-profile-image-');
if (!$out) profile_image_error(503,'Не удалось подготовить файл.');
try {
 $args=array('/usr/bin/timeout','20s',$ffmpeg,'-nostdin','-v','error','-y','-i',$f['tmp_name'],'-frames:v','1','-map_metadata','-1','-vf','scale=1600:1600:force_original_aspect_ratio=decrease','-c:v','libwebp','-quality','82','-f','webp',$out);
 $p=proc_open(implode(' ',array_map('escapeshellarg',$args)),array(0=>array('pipe','r'),1=>array('pipe','w'),2=>array('pipe','w')),$pipes);
 if (!is_resource($p)) throw new Exception('Не удалось начать обработку.');
 fclose($pipes[0]);stream_get_contents($pipes[1]);fclose($pipes[1]);stream_get_contents($pipes[2]);fclose($pipes[2]);
 $ok=proc_close($p)===0 && filesize($out)>0 && filesize($out)<=1500000;
 $bytes=$ok?file_get_contents($out):null;
} finally { @unlink($out); }
if (!$bytes) profile_image_error(422,'Не удалось уменьшить изображение. Выберите другой файл.');
echo json_encode(array('mime'=>'image/webp','data'=>base64_encode($bytes)));
