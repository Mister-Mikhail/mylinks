<?php
http_response_code(404);
header('Content-Type: text/plain; charset=UTF-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header_remove('ETag');
header_remove('Last-Modified');
echo 'Not found';
