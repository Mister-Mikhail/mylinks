<?php
// Temporary sources stay outside the webroot; no browser-side video/GIF transcoding.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function avatar_error($code, $message) {
    http_response_code($code);
    echo json_encode(array('error'=>$message), JSON_UNESCAPED_UNICODE);
    exit;
}
function avatar_bin($name) {
    foreach (array('/usr/bin/', '/usr/local/bin/') as $prefix)
        if (is_executable($prefix . $name)) return $prefix . $name;
    return null;
}
function avatar_run($args) {
    if (!function_exists('proc_open') || !avatar_bin('timeout')) avatar_error(503, 'Обработка медиа на сервере недоступна.');
    $command = implode(' ', array_map('escapeshellarg', array_merge(array(avatar_bin('timeout'),'90s'),$args)));
    $proc = proc_open($command, array(0=>array('pipe','r'),1=>array('pipe','w'),2=>array('pipe','w')), $pipes);
    if (!is_resource($proc)) avatar_error(503, 'Не удалось запустить обработку.');
    fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]); $err = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    if (proc_close($proc) !== 0) avatar_error(422, 'Не удалось обработать файл. Проверьте формат.');
    return $out;
}
function avatar_first_visible_frame($path, $duration) {
    if ($duration <= 0.3) return 0.0;
    // Scan only the opening seconds on the server, at a reduced frame rate.
    $scan=min(6.0, max(0.0, $duration-0.1));
    $args=array(avatar_bin('ffmpeg'),'-nostdin','-hide_banner','-i',$path,'-t',(string)$scan,
        '-vf','fps=6,blackdetect=d=0.15:pix_th=0.10','-an','-f','null','-');
    $command=implode(' ',array_map('escapeshellarg',array_merge(array(avatar_bin('timeout'),'20s'),$args)));
    $proc=proc_open($command,array(0=>array('pipe','r'),1=>array('pipe','w'),2=>array('pipe','w')),$pipes);
    if (!is_resource($proc)) return 0.0;
    fclose($pipes[0]); stream_get_contents($pipes[1]); fclose($pipes[1]);
    $log=stream_get_contents($pipes[2]); fclose($pipes[2]);
    if (proc_close($proc)!==0) return 0.0;
    if (preg_match('/black_start:\s*0(?:\.\d+)?\s+black_end:\s*([\d.]+)/',$log,$match) && (float)$match[1] < $scan-0.18)
        return min((float)$match[1]+0.12,max(0.0,$duration-0.1),$scan);
    return 0.0;
}
if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($_GET['action'] ?? '') === 'health') {
    $available=!!avatar_bin('ffmpeg') && !!avatar_bin('ffprobe') && !!avatar_bin('timeout') && function_exists('proc_open');
    $encoders=$available?avatar_run(array(avatar_bin('ffmpeg'),'-hide_banner','-encoders')):'';
    $videoEncoder=strpos($encoders,'libx264')!==false;
    $imageEncoder=strpos($encoders,'libwebp')!==false;
    echo json_encode(array('available'=>$available && $videoEncoder && $imageEncoder,
        'video_encoder'=>$videoEncoder,'image_encoder'=>$imageEncoder,
        'upload_limit'=>ini_get('upload_max_filesize'),'post_limit'=>ini_get('post_max_size')));
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') avatar_error(405, 'Метод не поддерживается.');
if (!avatar_bin('ffmpeg') || !avatar_bin('ffprobe')) avatar_error(503, 'FFmpeg на сервере пока недоступен.');
$config = require __DIR__ . '/preview-config.php';
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if (!preg_match('/^Bearer ([A-Za-z0-9._-]+)$/D', $authorization, $match)) avatar_error(401, 'Войдите в аккаунт.');
$curl = curl_init($config['url'] . '/auth/v1/user');
curl_setopt_array($curl, array(CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>8,
    CURLOPT_HTTPHEADER=>array('apikey: ' . $config['key'], 'Authorization: Bearer ' . $match[1])));
$raw = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
$user = $status === 200 && $raw ? json_decode($raw, true) : null;
if (!isset($user['id']) || !preg_match('/^[a-f0-9-]{36}$/D',$user['id'])) avatar_error(401,'Сессия истекла.');
$root = sys_get_temp_dir() . '/mylinks-avatar-' . hash('sha256',$user['id']);
if (!is_dir($root) && !mkdir($root,0700,true)) avatar_error(503,'Временное хранилище недоступно.');
foreach (glob($root.'/*') ?: array() as $old)
    if (is_file($old) && filemtime($old) < time()-3600) @unlink($old);
$action = $_POST['action'] ?? '';
if ($action === 'discard') {
    $discard=$_POST['token'] ?? '';
    if (preg_match('/^[a-f0-9]{32}$/D',$discard))
        foreach (glob($root.'/'.$discard.'*') ?: array() as $item) if (is_file($item)) @unlink($item);
    echo '{"discarded":true}';
    exit;
}
if ($action === 'prepare') {
    $file = $_FILES['file'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 50*1024*1024)
        avatar_error(413,'Выберите файл до 50 МБ.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $types = array('image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif',
        'video/mp4'=>'mp4','video/webm'=>'webm','video/quicktime'=>'mov','video/x-m4v'=>'m4v','video/3gpp'=>'3gp');
    // Some phones label MOV and M4V as generic binary; ffprobe still validates the actual stream.
    $extension=strtolower(pathinfo($file['name'] ?? '',PATHINFO_EXTENSION));
    if ($mime==='application/octet-stream' && in_array($extension,array('mov','m4v','mp4'),true))
        $mime=$extension==='mov'?'video/quicktime':'video/mp4';
    if (!isset($types[$mime])) avatar_error(415,'Выберите JPG, PNG, WebP, GIF, MP4, MOV или WebM.');
    $token=bin2hex(random_bytes(16)); $path=$root.'/'.$token.'.'.$types[$mime];
    if (!move_uploaded_file($file['tmp_name'],$path)) avatar_error(503,'Не удалось подготовить файл.');
    foreach (glob($root.'/*') ?: array() as $old) if ($old!==$path && is_file($old)) @unlink($old);
    $info=json_decode(avatar_run(array(avatar_bin('ffprobe'),'-v','error','-select_streams','v:0',
        '-show_entries','stream=width,height,duration:format=duration','-of','json',$path)),true);
    $stream=$info['streams'][0] ?? array(); $width=(int)($stream['width'] ?? 0); $height=(int)($stream['height'] ?? 0);
    if (!$width || !$height || $width*$height>100000000) avatar_error(422,'Слишком большое разрешение файла.');
    $animated=$mime==='image/gif' || strncmp($mime,'video/',6)===0;
    $duration=(float)($stream['duration'] ?? $info['format']['duration'] ?? 0);
    if ($animated && $duration<0) avatar_error(422,'Не удалось определить длительность видео.');
    $start=strncmp($mime,'video/',6)===0 ? avatar_first_visible_frame($path,$duration) : 0.0;
    if ($start>0) file_put_contents($root.'/'.$token.'-start', (string)$start);
    $thumb=$root.'/'.$token.'-preview.jpg';
    avatar_run(array_merge(array(avatar_bin('ffmpeg'),'-nostdin','-v','error','-y'),$start>0?array('-ss',(string)$start):array(),array('-i',$path,'-frames:v','1',
        '-vf','scale=800:800:force_original_aspect_ratio=decrease','-q:v','3',$thumb)));
    $dimensions=getimagesize($thumb);
    if (!$dimensions || filesize($thumb)>1000000) avatar_error(422,'Не удалось подготовить предпросмотр.');
    echo json_encode(array('token'=>$token,'kind'=>$mime==='image/gif'?'gif':($animated?'video':'image'),
        'preview'=>'data:image/jpeg;base64,'.base64_encode(file_get_contents($thumb)),
        'width'=>$dimensions[0],'height'=>$dimensions[1]),JSON_UNESCAPED_UNICODE);
    exit;
}
if ($action!=='render') avatar_error(400,'Неизвестное действие.');
$token=$_POST['token'] ?? '';
if (!preg_match('/^[a-f0-9]{32}$/D',$token)) avatar_error(400,'Исходный файл не найден.');
$sources=glob($root.'/'.$token.'.*') ?: array();
if (count($sources)!==1) avatar_error(404,'Исходный файл устарел. Выберите его снова.');
$source=$sources[0]; $preview=getimagesize($root.'/'.$token.'-preview.jpg');
$info=json_decode(avatar_run(array(avatar_bin('ffprobe'),'-v','error','-select_streams','v:0',
    '-show_entries','stream=width,height','-of','json',$source)),true);
$width=(int)($info['streams'][0]['width'] ?? 0); $height=(int)($info['streams'][0]['height'] ?? 0);
// Auto orientation (phone EXIF/video display matrix) may rotate decoded frames.
if ($preview && $width && $height && abs($preview[0]/$preview[1]-$height/$width)<0.02)
    list($width,$height)=array($height,$width);
$x=(float)($_POST['x'] ?? NAN); $y=(float)($_POST['y'] ?? NAN); $size=(float)($_POST['size'] ?? NAN);
$rotation=(float)($_POST['rotation'] ?? 0);
$aspect=(float)($_POST['aspect'] ?? 1);
if (!in_array($aspect,array(1.0,0.8),true)) avatar_error(400,'Проверьте форму аватара.');
if (!$preview || !$width || !$height || !is_finite($x) || !is_finite($y) || !is_finite($size) || $size<=0 || !is_finite($rotation) || abs($rotation)>30)
    avatar_error(400,'Проверьте положение кадра.');
$crop=max(1,min($width,(int)floor($height*$aspect),(int)round($size*$width/$preview[0])));
$cropHeight=max(1,min($height,(int)round($crop/$aspect)));
$cx=max(0,min($width-$crop,(int)round($x*$width/$preview[0])));
$cy=max(0,min($height-$cropHeight,(int)round($y*$height/$preview[1])));
$animated=in_array(strtolower(pathinfo($source,PATHINFO_EXTENSION)),array('gif','mp4','webm','mov','m4v','3gp'),true);
$start=is_file($root.'/'.$token.'-start') ? max(0.0,min(6.0,(float)file_get_contents($root.'/'.$token.'-start'))) : 0.0;
$encode=function($side,$video) use($root,$token,$source,$crop,$cropHeight,$cx,$cy,$rotation,$start,$aspect) {
    $target=$root.'/'.$token.'-'.$side.($video?'.mp4':'.webp');
    $filter=($rotation==0?'':'rotate='.$rotation.'*PI/180:ow=iw:oh=ih:c=black,').
        'crop='.$crop.':'.$cropHeight.':'.$cx.':'.$cy.',scale='.$side.':'.(int)round($side/$aspect).':flags=lanczos';
    $args=array_merge(array(avatar_bin('ffmpeg'),'-nostdin','-v','error','-y'),$start>0?array('-ss',(string)$start):array(),array('-i',$source));
    if ($video) $args=array_merge($args,array('-t','10','-an','-vf',$filter.',fps=24,format=yuv420p',
        '-c:v','libx264','-preset','veryfast','-b:v',$side===1000?'1500k':'700k',
        '-maxrate',$side===1000?'1800k':'900k','-bufsize','3000k','-movflags','+faststart',$target));
    else $args=array_merge($args,array('-frames:v','1','-vf',$filter,'-c:v','libwebp','-quality','86',$target));
    avatar_run($args);
    if (!is_file($target) || filesize($target)>5*1024*1024) avatar_error(422,'Результат слишком велик.');
    return array('mime'=>$video?'video/mp4':'image/webp','data'=>base64_encode(file_get_contents($target)));
};
$master=$encode(1000,$animated); $delivery=$encode(560,$animated); $poster=$animated?$encode(560,false):null;
echo json_encode(array('master'=>$master,'delivery'=>$delivery,'poster'=>$poster,'kind'=>$animated?'video':'image'));
