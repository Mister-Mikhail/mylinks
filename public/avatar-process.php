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
if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($_GET['action'] ?? '') === 'health') {
    echo json_encode(array('available'=>!!avatar_bin('ffmpeg') && !!avatar_bin('ffprobe') && !!avatar_bin('timeout') && function_exists('proc_open'),
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
if ($action === 'prepare') {
    $file = $_FILES['file'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 50*1024*1024)
        avatar_error(413,'Выберите файл до 50 МБ.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $types = array('image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif','video/mp4'=>'mp4','video/webm'=>'webm');
    if (!isset($types[$mime])) avatar_error(415,'Выберите JPG, PNG, WebP, GIF, MP4 или WebM.');
    $token=bin2hex(random_bytes(16)); $path=$root.'/'.$token.'.'.$types[$mime];
    if (!move_uploaded_file($file['tmp_name'],$path)) avatar_error(503,'Не удалось подготовить файл.');
    foreach (glob($root.'/*') ?: array() as $old) if ($old!==$path && is_file($old)) @unlink($old);
    $info=json_decode(avatar_run(array(avatar_bin('ffprobe'),'-v','error','-select_streams','v:0',
        '-show_entries','stream=width,height,duration:format=duration','-of','json',$path)),true);
    $stream=$info['streams'][0] ?? array(); $width=(int)($stream['width'] ?? 0); $height=(int)($stream['height'] ?? 0);
    if (!$width || !$height || $width*$height>100000000) avatar_error(422,'Слишком большое разрешение файла.');
    $animated=$mime==='image/gif' || strncmp($mime,'video/',6)===0;
    $duration=(float)($stream['duration'] ?? $info['format']['duration'] ?? 0);
    if ($animated && (!$duration || $duration>10.05)) avatar_error(422,'Анимация должна длиться не более 10 секунд.');
    $thumb=$root.'/'.$token.'-preview.jpg';
    avatar_run(array(avatar_bin('ffmpeg'),'-nostdin','-v','error','-y','-i',$path,'-frames:v','1',
        '-vf','scale=800:800:force_original_aspect_ratio=decrease','-q:v','3',$thumb));
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
$x=(float)($_POST['x'] ?? NAN); $y=(float)($_POST['y'] ?? NAN); $size=(float)($_POST['size'] ?? NAN);
if (!$preview || !$width || !$height || !is_finite($x) || !is_finite($y) || !is_finite($size) || $size<=0)
    avatar_error(400,'Проверьте положение кадра.');
$crop=max(1,min($width,$height,(int)round($size*$width/$preview[0])));
$cx=max(0,min($width-$crop,(int)round($x*$width/$preview[0])));
$cy=max(0,min($height-$crop,(int)round($y*$height/$preview[1])));
$animated=in_array(strtolower(pathinfo($source,PATHINFO_EXTENSION)),array('gif','mp4','webm'),true);
$encode=function($side,$video) use($root,$token,$source,$crop,$cx,$cy) {
    $target=$root.'/'.$token.'-'.$side.($video?'.mp4':'.webp');
    $filter='crop='.$crop.':'.$crop.':'.$cx.':'.$cy.',scale='.$side.':'.$side.':flags=lanczos';
    $args=array(avatar_bin('ffmpeg'),'-nostdin','-v','error','-y','-i',$source);
    if ($video) $args=array_merge($args,array('-t','10','-an','-vf',$filter.',fps=24,format=yuv420p',
        '-c:v','libx264','-preset','veryfast','-b:v',$side===1000?'1500k':'700k',
        '-maxrate',$side===1000?'1800k':'900k','-bufsize','3000k','-movflags','+faststart',$target));
    else $args=array_merge($args,array('-frames:v','1','-vf',$filter,'-c:v','libwebp','-quality','86',$target));
    avatar_run($args);
    if (!is_file($target) || filesize($target)>5*1024*1024) avatar_error(422,'Результат слишком велик.');
    return array('mime'=>$video?'video/mp4':'image/webp','data'=>base64_encode(file_get_contents($target)));
};
$master=$encode(1000,$animated); $delivery=$encode(560,$animated); $poster=$animated?$encode(560,false):null;
foreach (glob($root.'/'.$token.'*') ?: array() as $item) if (is_file($item)) @unlink($item);
echo json_encode(array('master'=>$master,'delivery'=>$delivery,'poster'=>$poster,'kind'=>$animated?'video':'image'));
